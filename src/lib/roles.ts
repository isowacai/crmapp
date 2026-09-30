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

// Leads and managers triage, assign, and see capacity; admins can do everything
export const canManageRequests = (role?: UserRole) =>
  role === 'admin' || role === 'manager' || role === 'lead';

export const canManageCatalog = (role?: UserRole) => role === 'admin' || role === 'manager';

export const DEFAULT_WEEKLY_CAPACITY = 40;
