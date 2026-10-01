import { useMemo } from 'react';
import { or, where } from 'firebase/firestore';
import { useFirestore } from './useFirestore';
import { COLLECTIONS } from '../lib/firebase';
import { canManageRequests } from '../lib/roles';
import { ServiceRequest, User } from '../types';

// Requests the signed-in user may see, matching the Firestore security rules (a query must stay
// within them or Firestore rejects it):
//   admin          – everything
//   lead / manager – their team's demand, plus anything they raised or own
//   staff          – requests they raised or own
export const useVisibleRequests = (user: User | null) => {
  const isAdmin = user?.role === 'admin';
  const teamId = canManageRequests(user?.role) ? user?.teamId || '' : '';

  const filter = useMemo(() => {
    if (!user || isAdmin) return undefined;
    const own = [where('requesterId', '==', user.id), where('assigneeId', '==', user.id)];
    return teamId ? or(where('teamId', '==', teamId), ...own) : or(...own);
  }, [user, isAdmin, teamId]);

  return useFirestore<ServiceRequest>({
    collectionName: COLLECTIONS.REQUESTS,
    filter,
    // Filtered queries skip server ordering (which would need composite indexes); pages sort themselves
    orderByCreated: isAdmin,
    enabled: !!user
  });
};
