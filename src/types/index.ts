// 'staff' submit requests; 'lead' and 'manager' assess, prioritize, and plan their team's demand;
// 'admin' also manages users and sees every team
export type UserRole = 'admin' | 'manager' | 'lead' | 'staff';

export interface User {
  id: string;
  email: string | null;
  displayName: string;
  role: UserRole;
  lastLogin: Date;
  createdAt: Date;
  active: boolean;
  teamId?: string; // teams/{id}; '' or missing means no team
  team?: string; // team name, kept alongside teamId for display
  weeklyCapacityHours?: number; // hours available for request work per week
}

// ---------- Workspaces (teams) ----------

// One scored assessment criterion, e.g. Business Value 1–5 weighted 30%
export interface AssessmentCriterion {
  key: string;
  label: string;
  description: string;
  weight: number; // relative weight; normalized across enabled criteria
  enabled: boolean;
  min: number;
  max: number;
  // 'higher' = a higher score raises priority; 'lower' = a higher score lowers it (e.g. complexity)
  direction: 'higher' | 'lower';
}

// Minimum score (0–100) for each level; anything below `medium` is Low
export interface PriorityThresholds {
  critical: number;
  high: number;
  medium: number;
}

export interface Team {
  id: string;
  name: string;
  description: string;
  managerIds: string[]; // leads/managers who run this workspace
  assessmentCriteria: AssessmentCriterion[];
  priorityThresholds: PriorityThresholds;
}

export interface Service {
  id: string;
  name: string;
  category: string;
  description: string;
  teamId: string; // team that delivers this service
  ownerTeam: string; // that team's name, kept for display
  active: boolean;
}

// ---------- Demand ----------

export type PriorityLevel = 'critical' | 'high' | 'medium' | 'low';

export type RequestStatus =
  | 'new'
  | 'assessing' // more information requested from the requester
  | 'approved' // accepted as valid demand
  | 'planned' // owner and target dates set, capacity not yet committed
  | 'committed' // capacity allocated; the team intends to deliver
  | 'in-progress'
  | 'blocked'
  | 'completed'
  | 'deferred'
  | 'declined'
  | 'cancelled';

export type AssessmentDecision = 'accept' | 'defer' | 'decline' | 'more-info';

export interface Assessment {
  at: string; // ISO timestamp
  byId: string;
  byName: string;
  // The criteria as they were when assessed, so history stays meaningful if the model changes
  criteria: Pick<AssessmentCriterion, 'key' | 'label' | 'weight' | 'min' | 'max' | 'direction'>[];
  scores: Record<string, number>;
  score: number | null; // normalized 0–100
  calculatedPriority: PriorityLevel | '';
  estimatedHours: number;
  dependencies: string;
  comments: string;
  decision: AssessmentDecision;
  revisitOn: string; // YYYY-MM-DD for deferred demand, else ''
}

export interface PriorityOverride {
  level: PriorityLevel;
  reason: string;
  byId: string;
  byName: string;
  at: string;
}

// One tracked field's before/after value in an audit entry
export interface FieldChange {
  field: string;
  from: string | number | null;
  to: string | number | null;
}

export interface RequestHistoryEntry {
  at: string; // ISO timestamp
  byId: string;
  byName: string;
  action: string; // e.g. "Submitted", "Assessed: accepted", "Logged 3h"
  toStatus?: RequestStatus;
  note?: string;
  hours?: number; // hours logged by `byId` in this entry (used for actual consumption reporting)
  changes?: FieldChange[]; // tracked fields that changed (status, priority, estimate, owner, dates, ...)
}

export interface ServiceRequest {
  id: string;
  requestNumber: string; // e.g. REQ-20260930-0001
  teamId: string; // team that owns this demand (the service's delivering team)
  teamName: string;
  serviceId: string;
  serviceName: string;
  category: string;
  title: string;
  description: string;
  businessJustification: string;
  requesterId: string;
  requesterName: string;
  requesterTeam: string;
  status: RequestStatus;
  neededBy: string; // requested completion date, YYYY-MM-DD, or ''
  // Priority: `priority` is what everyone sees = the manager's override if set, else the calculated level
  priority: PriorityLevel | '';
  priorityScore: number | null;
  calculatedPriority: PriorityLevel | '';
  priorityOverride: PriorityOverride | null;
  assessments: Assessment[];
  assigneeId: string;
  assigneeName: string;
  assigneeTeam: string;
  estimatedHours: number;
  loggedHours: number;
  startDate: string; // YYYY-MM-DD planned start
  dueDate: string; // YYYY-MM-DD planned finish
  assignedAt: string; // ISO timestamp, '' until planned/committed
  completedAt: string; // ISO timestamp, '' until completed
  history: RequestHistoryEntry[];
  createdAt: { seconds: number; nanoseconds: number };
}
