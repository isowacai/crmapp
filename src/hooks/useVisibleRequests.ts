import { useMemo } from 'react';
import { or, where } from 'firebase/firestore';
import { useFirestore } from './useFirestore';
import { COLLECTIONS } from '../lib/firebase';
import { canManageRequests } from '../lib/roles';
import { normalizeRequest } from '../lib/legacy';
import { ServiceRequest, User } from '../types';

// Requests the signed-in user may see, matching the Firestore security rules (a query must stay
// within them or Firestore rejects it):
//   admin          – everything
//   lead / manager – their team's demand, supporting requests raised under it, plus anything they raised or own
//   staff          – requests they raised or own
// Requests saved before migration 001 are read in the current shape (see lib/legacy).
export const useVisibleRequests = (user: User | null) => {
  const isAdmin = user?.role === 'admin';
  const teamId = canManageRequests(user?.role) ? user?.teamId || '' : '';

  const filter = useMemo(() => {
    if (!user || isAdmin) return undefined;
    const own = [where('requesterId', '==', user.id), where('assigneeId', '==', user.id)];
    return teamId ? or(where('teamId', '==', teamId), where('parentTeamId', '==', teamId), ...own) : or(...own);
  }, [user, isAdmin, teamId]);

  const result = useFirestore<ServiceRequest>({
    collectionName: COLLECTIONS.REQUESTS,
    filter,
    // Filtered queries skip server ordering (which would need composite indexes); pages sort themselves
    orderByCreated: isAdmin,
    enabled: !!user
  });

  const data = useMemo(() => result.data.map(normalizeRequest), [result.data]);
  return { ...result, data };
};
