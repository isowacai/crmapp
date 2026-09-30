export interface Task {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed';
  dueDate: string;
  assignedTo: string; // assignee's display name
  assignedToId?: string; // assignee's user ID (missing on tasks created before users were selectable)
  priority: 'low' | 'medium' | 'high';
}

// 'staff' submit requests; 'lead' and 'manager' triage and assign; 'admin' also manages the catalog and users
export type UserRole = 'admin' | 'manager' | 'lead' | 'staff';

export interface User {
  id: string;
  email: string | null;
  displayName: string;
  role: UserRole;
  lastLogin: Date;
  createdAt: Date;
  active: boolean;
  team?: string;
  weeklyCapacityHours?: number; // hours available for request work per week
}

export interface Service {
  id: string;
  name: string;
  category: string;
  description: string;
  ownerTeam: string; // team that normally delivers this service
  standardEffortHours: number; // default estimate when a request is assigned
  slaDays: number; // target working days from assignment to completion
  active: boolean;
}

export type Impact = 'low' | 'medium' | 'high';
export type Urgency = 'low' | 'medium' | 'high';
export type Priority = 'P1' | 'P2' | 'P3' | 'P4';

export type RequestStatus =
  | 'submitted'
  | 'assigned'
  | 'in-progress'
  | 'on-hold'
  | 'completed'
  | 'rejected'
  | 'cancelled';

export interface RequestHistoryEntry {
  at: string; // ISO timestamp
  byId: string;
  byName: string;
  action: string; // e.g. "Submitted", "Assigned to Jane", "Logged 3h"
  toStatus?: RequestStatus;
  note?: string;
  hours?: number; // hours logged by `byId` in this entry (used for actual consumption reporting)
}

export interface ServiceRequest {
  id: string;
  requestNumber: string; // e.g. REQ-20260930-0001
  serviceId: string;
  serviceName: string;
  category: string;
  title: string;
  description: string;
  businessJustification: string;
  requesterId: string;
  requesterName: string;
  requesterTeam: string;
  impact: Impact;
  urgency: Urgency;
  priority: Priority;
  status: RequestStatus;
  neededBy: string; // YYYY-MM-DD, or '' if no date requested
  assigneeId: string;
  assigneeName: string;
  assigneeTeam: string;
  estimatedHours: number;
  loggedHours: number;
  startDate: string; // YYYY-MM-DD planned start
  dueDate: string; // YYYY-MM-DD planned finish
  assignedAt: string; // ISO timestamp, '' until assigned
  completedAt: string; // ISO timestamp, '' until completed
  history: RequestHistoryEntry[];
  createdAt: { seconds: number; nanoseconds: number };
}
