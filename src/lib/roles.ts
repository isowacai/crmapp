import { UserRole } from '../types';

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  manager: 'Manager',
  lead: 'Lead',
  staff: 'Staff'
};

// Users created before the demand-management change were stored with role 'customer'
export const normalizeRole = (role: unknown): UserRole =>
  role === 'admin' || role === 'manager' || role === 'lead' ? role : 'staff';

// Leads and managers assess, prioritize, plan, and see capacity; admins can do everything
export const canManageRequests = (role?: UserRole) =>
  role === 'admin' || role === 'manager' || role === 'lead';

export const canManageCatalog = (role?: UserRole) => role === 'admin' || role === 'manager';

// Whether this user manages demand owned by `teamId`: admins manage every team; leads and managers
// manage their own team's (matches the Firestore rules)
export const managesTeam = (user: { role?: UserRole; teamId?: string } | null | undefined, teamId: string) =>
  !!user && (user.role === 'admin' || (canManageRequests(user.role) && !!user.teamId && user.teamId === teamId));

// People whose capacity a viewer can plan against: admins see everyone; leads and managers their own team
export const usersInScope = <U extends { teamId?: string }>(users: U[], viewer: { role?: UserRole; teamId?: string } | null | undefined): U[] =>
  viewer?.role === 'admin' ? users : users.filter(u => !!viewer?.teamId && u.teamId === viewer.teamId);

export const DEFAULT_WEEKLY_CAPACITY = 40;
