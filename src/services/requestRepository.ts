// Firestore writes for requests that need more than a simple document update
import { doc, runTransaction, Timestamp } from 'firebase/firestore';
import { db, COLLECTIONS } from '../lib/firebase';
import { generateDailyNumber, toDateKey } from '../lib/demand';
import { ServiceRequest } from '../types';

const COUNTERS = 'counters';

// Creates a request numbered REQ-YYYYMMDD-NNNN, using the number as its document ID.
// A per-day counter document hands out numbers in a transaction, so numbers are unique even though
// staff can't see other people's requests. If the transaction's request document already exists,
// the write is an update, which security rules refuse, so an existing request is never overwritten.
export const createNumberedRequest = async (
  build: (requestNumber: string) => Omit<ServiceRequest, 'id' | 'createdAt'>,
  knownNumbers: string[] // used to seed today's counter the first time it's created
): Promise<ServiceRequest> => {
  const day = toDateKey(new Date()).replace(/-/g, '');
  const counterRef = doc(db, COUNTERS, `REQ-${day}`);

  return runTransaction(db, async tx => {
    const counter = await tx.get(counterRef);
    const seed = parseInt(generateDailyNumber('REQ', knownNumbers).split('-')[2], 10) - 1;
    const next = (counter.exists() ? (counter.data().last as number) : seed) + 1;
    const requestNumber = `REQ-${day}-${String(next).padStart(4, '0')}`;

    const data = { ...build(requestNumber), createdAt: Timestamp.now() };
    tx.set(counterRef, { last: next });
    tx.set(doc(db, COLLECTIONS.REQUESTS, requestNumber), data);
    return { ...data, id: requestNumber } as unknown as ServiceRequest;
  });
};
