import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useFirestore } from './useFirestore';
import { COLLECTIONS } from '../lib/firebase';
import { calendarOf, WorkCalendar } from '../lib/demand';
import { Team } from '../types';

// The working week (days and hours per day) of `teamId`, or of the signed-in user's team. Release 1 has
// one team, so people without a team (e.g. admins) get the first team's calendar.
export const useWorkCalendar = (teamId?: string): WorkCalendar => {
  const { user } = useAuth();
  const { data: teams } = useFirestore<Team>({ collectionName: COLLECTIONS.TEAMS });
  const id = teamId || user?.teamId;
  const team = teams.find(t => t.id === id) ?? (id ? undefined : teams[0]);
  return useMemo(() => calendarOf(team), [team]);
};
