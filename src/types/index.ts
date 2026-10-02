// 'staff' submit requests; 'lead' and 'manager' assess, prioritize, and plan their team's demand;
// 'admin' also manages users and sees every team
export type UserRole = 'admin' | 'manager' | 'lead' | 'staff';

export interface User {
  id: string;
  email: string | null;
  displayName: string; // full name, shown everywhere
  firstName?: string;
  lastName?: string;
  role: UserRole;
  lastLogin: Date;
  createdAt: Date;
  active: boolean;
  teamId?: string; // teams/{id}; '' or missing means no team
  team?: string; // team name, kept alongside teamId for display
  weeklyCapacityHours?: number; // hours available for request work per week
  hourlyRate?: number | null; // optional cost rate for this person, set on the Team page; falls back to the team's rate
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

// Optional lightweight service targets, in calendar days (null = not tracked)
export interface ServiceTargets {
  responseDays: number | null; // submitted → first response from the team
  assessmentDays: number | null; // submitted → accept / defer / decline
  commitmentDays: number | null; // approved → committed
  deliveryDays: number | null; // committed → completed
}

// Who may request a team's services
export interface RequestAccess {
  mode: 'everyone' | 'teams';
  teamIds: string[]; // requesting teams allowed when mode is 'teams' (the team itself always may)
}

// Optional pipeline stages a team can switch off
export interface TeamWorkflow {
  useAssessing: boolean; // "request more information" before deciding
  usePlanned: boolean; // plan tentatively before committing capacity
}

export interface Team {
  id: string;
  name: string;
  description: string;
  managerIds: string[]; // leads/managers who run this workspace
  assessmentCriteria: AssessmentCriterion[];
  priorityThresholds: PriorityThresholds;
  serviceTargets?: ServiceTargets;
  hourlyRate?: number | null; // default cost rate for the team's people; costs are hidden without one
  currency?: string; // ISO code for costs and financial outcomes, e.g. "USD"
  requestAccess?: RequestAccess;
  workflow?: TeamWorkflow;
  dashboardKpis?: string[]; // headline figures shown first on the team's dashboard
  setupSteps?: string[]; // guided-setup steps completed
  linesOfBusiness?: string[]; // LOBs this team delivers for; requests are routed by LOB. None = takes every LOB
  savedHourValue?: number | null; // value of one hour saved for the business, for cost avoidance; blank = hourlyRate
  workingDays?: number[]; // days the team works, 0 = Sunday … 6 = Saturday; default Monday–Friday
  hoursPerDay?: number; // a standard working day, e.g. 7; with workingDays gives the standard week
}

// An extra question a service asks when it's requested
export interface RequestField {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'date' | 'select';
  required: boolean;
  options: string[]; // for 'select'
  help: string;
}

export interface RequestAnswer {
  fieldId: string;
  label: string; // the question as it was asked
  value: string;
}

export interface Service {
  id: string;
  name: string;
  category: string;
  description: string;
  // Teams that deliver this service, e.g. one per line of business; requests are routed by LOB
  teamIds: string[];
  teamId?: string; // legacy: the single delivering team, before services could have several
  ownerTeam?: string; // legacy: that team's name
  active: boolean;
  requestFields?: RequestField[];
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

// ---------- Delivery ----------

export interface Milestone {
  id: string;
  title: string;
  dueDate: string; // YYYY-MM-DD or ''
  done: boolean;
  doneAt: string; // ISO timestamp or ''
}

export interface Blocker {
  id: string;
  description: string;
  raisedAt: string; // ISO timestamp
  raisedById: string;
  raisedByName: string;
  resolvedAt: string; // ISO timestamp, '' while open
  resolution: string;
}

// A link to another request this one depends on (number/title kept so it reads even without access)
export interface DependencyRef {
  id: string;
  requestNumber: string;
  title: string;
}

// ---------- Outcomes ----------

export type OutcomeType =
  | 'business-benefit'
  | 'cost-avoidance'
  | 'time-saved'
  | 'risk-reduced'
  | 'productivity'
  | 'revenue'
  | 'compliance'
  | 'customer';

// One measured result, e.g. { type: 'cost-avoidance', value: 12000, unit: 'USD' }
export interface OutcomeMetric {
  type: OutcomeType;
  value: number;
  unit: string;
  description: string;
}

// What the work is expected to save, estimated during assessment
export interface ExpectedBenefit {
  hoursSavedPerMonth: number; // business hours saved each month once delivered
  description: string; // e.g. "No more manual weekend deployments"
}

// Value delivered, recorded after completion. Financial value is optional.
export interface Outcome {
  types: OutcomeType[];
  metrics: OutcomeMetric[];
  hoursSavedPerMonth?: number | null; // confirmed hours saved each month; turned into cost avoidance
  summary: string;
  recordedAt: string;
  recordedById: string;
  recordedByName: string;
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
  answers: RequestAnswer[]; // replies to the service's request questions
  lineOfBusiness?: string; // chosen by the requester; decides which delivering team gets it
  expectedBenefit?: ExpectedBenefit | null; // set during assessment; confirmed by the outcome
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
  // Hours per week (keyed by the week's Monday) when the planner split the estimate by hand;
  // null/missing = spread evenly over the working days between startDate and dueDate
  weeklyPlan?: Record<string, number> | null;
  assignedAt: string; // ISO timestamp, '' until planned/committed
  committedAt: string; // ISO timestamp the team committed capacity, '' if not committed
  targetPeriod: string; // YYYY-MM the work is aimed at, '' if not set
  completedAt: string; // ISO timestamp, '' until completed (actual completion)
  // Delivery tracking
  actualStart: string; // ISO timestamp work first started, ''
  progress: number; // 0–100
  milestones: Milestone[];
  blockers: Blocker[];
  dependsOn: DependencyRef[];
  // Cross-team: a supporting request raised as part of another team's demand ('' when not)
  parentId: string;
  parentTeamId: string;
  parentNumber: string;
  parentTitle: string;
  parentTeamName: string;
  outcome: Outcome | null;
  history: RequestHistoryEntry[];
  createdAt: { seconds: number; nanoseconds: number };
}
