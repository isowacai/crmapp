// Lifecycle timing and lightweight service targets, derived from each request's history so it
// works for requests created before these were tracked.
import { RequestStatus, ServiceRequest, ServiceTargets } from '../types';
import { firestoreDate } from './demand';
import { LEGACY_STATUS } from './legacy';

const DAY = 86400000;

export interface StageTimes {
  submitted: Date | null;
  responded: Date | null; // first action by someone other than the requester
  assessed: Date | null; // first accept / defer / decline decision
  approved: Date | null;
  committed: Date | null;
  started: Date | null;
  completed: Date | null;
}

const current = (s: string | undefined): RequestStatus | undefined => (s ? LEGACY_STATUS[s] ?? (s as RequestStatus) : undefined);

export const stageTimes = (r: ServiceRequest): StageTimes => {
  const history = r.history || [];
  const firstTo = (status: RequestStatus) => {
    const h = history.find(e => current(e.toStatus) === status);
    return h ? new Date(h.at) : null;
  };
  const decision = (r.assessments || []).find(a => a.decision !== 'more-info');
  const response = history.find(e => e.byId && e.byId !== r.requesterId && e.byId !== 'migration');

  return {
    submitted: firestoreDate(r.createdAt) ?? (history[0] ? new Date(history[0].at) : null),
    responded: response ? new Date(response.at) : null,
    // Older requests were triaged straight to assigned, which counts as their assessment
    assessed: decision ? new Date(decision.at) : firstTo('committed') ?? firstTo('approved') ?? firstTo('declined'),
    approved: firstTo('approved') ?? firstTo('planned') ?? firstTo('committed'),
    committed: r.committedAt ? new Date(r.committedAt) : firstTo('committed'),
    started: r.actualStart ? new Date(r.actualStart) : firstTo('in-progress'),
    completed: r.completedAt ? new Date(r.completedAt) : null
  };
};

export const STAGES = [
  { key: 'assessment', label: 'Request → Assessment', from: 'submitted', to: 'assessed' },
  { key: 'approval', label: 'Assessment → Approval', from: 'assessed', to: 'approved' },
  { key: 'commitment', label: 'Approval → Commitment', from: 'approved', to: 'committed' },
  { key: 'start', label: 'Commitment → Start', from: 'committed', to: 'started' },
  { key: 'completion', label: 'Start → Completion', from: 'started', to: 'completed' }
] as const satisfies readonly { key: string; label: string; from: keyof StageTimes; to: keyof StageTimes }[];

export type StageKey = (typeof STAGES)[number]['key'];

export const daysBetween = (from: Date | null, to: Date | null) =>
  from && to && to >= from ? (to.getTime() - from.getTime()) / DAY : null;

// Days spent in each stage that the request has passed through
export const stageDurations = (r: ServiceRequest): Partial<Record<StageKey, number>> => {
  const t = stageTimes(r);
  const out: Partial<Record<StageKey, number>> = {};
  for (const s of STAGES) {
    const d = daysBetween(t[s.from], t[s.to]);
    if (d !== null) out[s.key] = d;
  }
  return out;
};

// Average days per stage across requests, with how many requests each average covers
export const averageStageDurations = (requests: ServiceRequest[]) =>
  STAGES.map(s => {
    const values = requests.map(r => stageDurations(r)[s.key]).filter((d): d is number => d !== undefined);
    return { ...s, count: values.length, averageDays: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null };
  });

// The stage an open request is currently waiting in, and for how long
export const waitingIn = (r: ServiceRequest, now = new Date()): { stage: StageKey; days: number } | null => {
  const t = stageTimes(r);
  const at = (from: keyof StageTimes, stage: StageKey) => {
    const d = daysBetween(t[from], now);
    return d === null ? null : { stage, days: d };
  };
  switch (r.status) {
    case 'new':
    case 'assessing':
      return at('submitted', 'assessment');
    case 'approved':
    case 'planned':
      return at('approved', 'commitment');
    case 'committed':
      return at('committed', 'start');
    case 'in-progress':
    case 'blocked':
      return at('started', 'completion');
    default:
      return null;
  }
};

// ---------- Service targets ----------

export const TARGETS = [
  { key: 'responseDays', label: 'Initial response', from: 'submitted', to: 'responded' },
  { key: 'assessmentDays', label: 'Assessment', from: 'submitted', to: 'assessed' },
  { key: 'commitmentDays', label: 'Commitment', from: 'approved', to: 'committed' },
  { key: 'deliveryDays', label: 'Delivery', from: 'committed', to: 'completed' }
] as const satisfies readonly { key: keyof ServiceTargets; label: string; from: keyof StageTimes; to: keyof StageTimes }[];

export const NO_TARGETS: ServiceTargets = { responseDays: null, assessmentDays: null, commitmentDays: null, deliveryDays: null };

export type TargetState = 'met' | 'missed' | 'on-time' | 'overdue';

export interface TargetResult {
  key: keyof ServiceTargets;
  label: string;
  targetDays: number;
  actualDays: number; // elapsed so far if still pending
  state: TargetState; // met / missed once done; on-time / overdue while pending
}

const CLOSED: RequestStatus[] = ['declined', 'cancelled'];

// How a request is doing against its team's targets. Targets whose start hasn't happened yet are left
// out, as are pending ones on demand that was closed without delivery.
export const evaluateTargets = (r: ServiceRequest, targets: ServiceTargets | undefined, now = new Date()): TargetResult[] => {
  if (!targets) return [];
  const t = stageTimes(r);
  const results: TargetResult[] = [];
  for (const def of TARGETS) {
    const targetDays = targets[def.key];
    const start = t[def.from];
    if (targetDays == null || !start) continue;
    const end = t[def.to];
    if (!end && CLOSED.includes(r.status)) continue;
    const actualDays = (((end ?? now).getTime() - start.getTime()) / DAY);
    results.push({
      key: def.key,
      label: def.label,
      targetDays,
      actualDays,
      state: end ? (actualDays <= targetDays ? 'met' : 'missed') : actualDays <= targetDays ? 'on-time' : 'overdue'
    });
  }
  return results;
};

// Share of finished target measurements that met the target, per target, across requests
export const targetPerformance = (requests: ServiceRequest[], targetsFor: (r: ServiceRequest) => ServiceTargets | undefined, now = new Date()) =>
  TARGETS.map(def => {
    const results = requests
      .map(r => evaluateTargets(r, targetsFor(r), now).find(x => x.key === def.key))
      .filter((x): x is TargetResult => !!x);
    const finished = results.filter(x => x.state === 'met' || x.state === 'missed');
    const met = finished.filter(x => x.state === 'met').length;
    return {
      key: def.key,
      label: def.label,
      measured: finished.length,
      met,
      metPct: finished.length ? Math.round((met / finished.length) * 100) : null,
      overdueNow: results.filter(x => x.state === 'overdue').length
    };
  });
