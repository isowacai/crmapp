import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, updateDoc } from 'firebase/firestore';
import { firebaseConfig } from '../../config/firebaseConfig.js';

// Gives every order without an `orderNumber` one in the format ORD-YYYYMMDD-NNNN,
// based on the date it was created. Only adds the field; document IDs are unchanged.
//
// Usage:
//   npm run number-orders            preview the changes (nothing is written)
//   npm run number-orders -- --apply write the order numbers

const PREFIX = 'ORD';
const apply = process.argv.includes('--apply');

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const toDate = (value) => {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
};

const datePart = (date) =>
  `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;

const addOrderNumbers = async () => {
  try {
    const snapshot = await getDocs(collection(db, 'orders'));
    const orders = snapshot.docs.map(doc => ({ ref: doc.ref, docId: doc.id, data: doc.data() }));

    // Highest sequence already used per day, so new numbers never repeat an existing one
    const lastSequence = {};
    const noteSequence = (number) => {
      const match = number.match(/^(?:[A-Z]+-)?(\d{8})-(\d+)$/);
      if (match) lastSequence[match[1]] = Math.max(lastSequence[match[1]] || 0, parseInt(match[2], 10));
    };
    const used = new Set();
    for (const order of orders) {
      if (order.data.orderNumber) {
        noteSequence(order.data.orderNumber);
        used.add(order.data.orderNumber);
      }
    }

    const changes = [];
    const pending = [];

    // Oldest first, so if two orders share an old number the earlier one keeps it
    orders.sort((a, b) => (toDate(a.data.createdAt)?.getTime() ?? 0) - (toDate(b.data.createdAt)?.getTime() ?? 0));

    for (const order of orders) {
      if (order.data.orderNumber) continue;

      // Reuse an existing readable number (YYYYMMDD-NNNN) from the document ID or old `id` field
      const existing = [order.docId, order.data.id].find(v => typeof v === 'string' && /^\d{8}-\d{4}$/.test(v));
      const orderNumber = existing && `${PREFIX}-${existing}`;
      if (orderNumber && !used.has(orderNumber)) {
        noteSequence(orderNumber);
        used.add(orderNumber);
        changes.push({ order, orderNumber });
      } else {
        pending.push(order);
      }
    }

    // Remaining orders are numbered in the order they were created
    pending.sort((a, b) => (toDate(a.data.createdAt)?.getTime() ?? 0) - (toDate(b.data.createdAt)?.getTime() ?? 0));
    for (const order of pending) {
      const created = toDate(order.data.createdAt);
      if (!created) {
        console.warn(`Skipping ${order.docId}: no valid createdAt date`);
        continue;
      }
      const day = datePart(created);
      lastSequence[day] = (lastSequence[day] || 0) + 1;
      changes.push({ order, orderNumber: `${PREFIX}-${day}-${String(lastSequence[day]).padStart(4, '0')}` });
    }

    if (changes.length === 0) {
      console.log('All orders already have an order number.');
      process.exit(0);
    }

    for (const { order, orderNumber } of changes) {
      console.log(`${order.docId.padEnd(25)} → ${orderNumber}`);
      if (apply) await updateDoc(order.ref, { orderNumber });
    }

    console.log(`\n${changes.length} order(s) ${apply ? 'updated' : 'would be updated'}.`);
    if (!apply) console.log('Preview only. Run with --apply to write the changes.');
    process.exit(0);
  } catch (error) {
    console.error('Error adding order numbers:', error);
    process.exit(1);
  }
};

addOrderNumbers();
