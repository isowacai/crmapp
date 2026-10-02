// Reads requests saved before the demand pipeline (migration 001) in the current shape, so the app works
// whether or not the migration has been run. Mirrors scripts/migrations/teamsAndPipeline.js.
import { PriorityLevel, RequestStatus, ServiceRequest } from '../types';

export const LEGACY_STATUS: Record<string, RequestStatus> = {
  submitted: 'new',
  assigned: 'committed',
  'on-hold': 'blocked',
  rejected: 'declined'
};

const LEGACY_PRIORITY: Record<string, PriorityLevel> = { P1: 'critical', P2: 'high', P3: 'medium', P4: 'low' };

const PRIORITY_VALUES: (PriorityLevel | '')[] = ['critical', 'high', 'medium', 'low', ''];

export const normalizeRequest = (raw: ServiceRequest): ServiceRequest => {
  const r = raw as ServiceRequest & Record<string, unknown>;
  const status = LEGACY_STATUS[r.status as string] ?? r.status;
  const legacyPriority = LEGACY_PRIORITY[r.priority as string];
  const priority = legacyPriority ?? (PRIORITY_VALUES.includes(r.priority) ? r.priority : '');

  if (
    status === r.status &&
    priority === r.priority &&
    Array.isArray(r.assessments) &&
    r.teamId !== undefined &&
    r.committedAt !== undefined &&
    r.targetPeriod !== undefined &&
    Array.isArray(r.milestones) &&
    Array.isArray(r.blockers) &&
    Array.isArray(r.dependsOn) &&
    r.parentId !== undefined &&
    r.outcome !== undefined &&
    Array.isArray(r.answers)
  ) {
    return raw;
  }

  return {
    ...raw,
    status,
    priority,
    teamId: r.teamId ?? '',
    teamName: r.teamName ?? (r.assigneeTeam as string) ?? '',
    priorityScore: r.priorityScore ?? null,
    calculatedPriority: r.calculatedPriority ?? '',
    priorityOverride: r.priorityOverride ?? null,
    assessments: Array.isArray(r.assessments) ? r.assessments : [],
    // Work committed before commitment dates existed: use when it was assigned
    committedAt: r.committedAt ?? (['committed', 'in-progress', 'blocked', 'completed'].includes(status) ? (r.assignedAt as string) || '' : ''),
    targetPeriod: r.targetPeriod ?? ((r.dueDate as string) || '').slice(0, 7),
    // Delivery and cross-team fields (added in Phase 3)
    actualStart: r.actualStart ?? (Array.isArray(r.history) ? r.history.find(h => h.toStatus === 'in-progress')?.at ?? '' : ''),
    progress: typeof r.progress === 'number' ? r.progress : status === 'completed' ? 100 : 0,
    milestones: Array.isArray(r.milestones) ? r.milestones : [],
    blockers: Array.isArray(r.blockers) ? r.blockers : [],
    dependsOn: Array.isArray(r.dependsOn) ? r.dependsOn : [],
    parentId: r.parentId ?? '',
    parentTeamId: r.parentTeamId ?? '',
    parentNumber: r.parentNumber ?? '',
    parentTitle: r.parentTitle ?? '',
    parentTeamName: r.parentTeamName ?? '',
    outcome: r.outcome ?? null,
    answers: Array.isArray(r.answers) ? r.answers : [],
    history: Array.isArray(r.history) ? r.history : []
  };
};

// True when the stored document still needs migration 001 (used to warn admins)
export const isLegacyRequest = (raw: ServiceRequest) =>
  raw.status in LEGACY_STATUS || (raw.priority as string) in LEGACY_PRIORITY || !raw.teamId;
