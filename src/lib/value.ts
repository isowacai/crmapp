// Effort cost and delivered value. Costs are optional: with no rates configured they are null and
// the UI hides them. Rates apply at view time (current rates), not stored on requests.
import { OutcomeMetric, OutcomeType, ServiceRequest, Team, User } from '../types';

export const OUTCOME_TYPES: { key: OutcomeType; label: string; unit: 'currency' | 'hours' | '%' | '' }[] = [
  { key: 'business-benefit', label: 'Business benefit', unit: '' },
  { key: 'cost-avoidance', label: 'Cost avoidance', unit: 'currency' },
  { key: 'time-saved', label: 'Time saved', unit: 'hours' },
  { key: 'risk-reduced', label: 'Risk reduced', unit: '' },
  { key: 'productivity', label: 'Productivity improvement', unit: '%' },
  { key: 'revenue', label: 'Revenue contribution', unit: 'currency' },
  { key: 'compliance', label: 'Compliance achieved', unit: '' },
  { key: 'customer', label: 'Customer / business outcome', unit: '' }
];

export const outcomeLabel = (type: OutcomeType) => OUTCOME_TYPES.find(t => t.key === type)?.label ?? type;

export const DEFAULT_CURRENCY = 'USD';

export const formatMoney = (amount: number, currency = DEFAULT_CURRENCY) => {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${Math.round(amount).toLocaleString()} ${currency}`;
  }
};

// Rate for a person's hours: their own rate, else their team's, else none
export const rateFor = (userId: string, users: Map<string, User>, team?: Pick<Team, 'hourlyRate'>): number | null => {
  const own = users.get(userId)?.hourlyRate;
  if (typeof own === 'number' && own > 0) return own;
  return typeof team?.hourlyRate === 'number' && team.hourlyRate > 0 ? team.hourlyRate : null;
};

export interface RequestCost {
  estimated: number | null; // estimate × owner's rate
  actual: number | null; // each logged hour × the rate of whoever logged it
  variance: number | null; // actual − estimated
}

export const requestCost = (r: ServiceRequest, users: Map<string, User>, team?: Pick<Team, 'hourlyRate'>): RequestCost => {
  const ownerRate = r.assigneeId ? rateFor(r.assigneeId, users, team) : rateFor('', users, team);
  const estimated = ownerRate !== null && r.estimatedHours > 0 ? r.estimatedHours * ownerRate : null;

  let actual: number | null = null;
  for (const h of r.history || []) {
    if (!h.hours) continue;
    const rate = rateFor(h.byId, users, team);
    if (rate === null) continue;
    actual = (actual ?? 0) + h.hours * rate;
  }
  return { estimated, actual, variance: estimated !== null && actual !== null ? actual - estimated : null };
};

// Totals of quantitative outcomes across requests, e.g. cost avoidance and time saved
export const sumOutcomes = (requests: ServiceRequest[], type: OutcomeType): { total: number; unit: string; count: number } => {
  let total = 0;
  let count = 0;
  let unit = '';
  for (const r of requests) {
    for (const m of r.outcome?.metrics || []) {
      if (m.type !== type || !Number.isFinite(m.value)) continue;
      total += m.value;
      count++;
      unit = unit || m.unit;
    }
  }
  return { total, unit, count };
};

export const validateOutcomeMetric = (m: OutcomeMetric): string | null => {
  if (!Number.isFinite(m.value)) return 'Enter a number for each measured result.';
  if (m.value < 0) return "Measured results can't be negative.";
  return null;
};

// ---------- Cost avoidance ----------
// Hours the business no longer spends, turned into money: hours saved per month × 12 × the value of an
// hour saved (the team's "value of an hour saved", else its hourly rate). Confirmed figures come from
// recorded outcomes; expected ones from the assessment, for completed work whose outcome isn't in yet.
// Money entered directly as a cost-avoidance result is added on top.

export const MONTHS_PER_YEAR = 12;

export const savedHourValue = (team?: Pick<Team, 'savedHourValue' | 'hourlyRate'>): number | null =>
  team?.savedHourValue && team.savedHourValue > 0 ? team.savedHourValue : team?.hourlyRate && team.hourlyRate > 0 ? team.hourlyRate : null;

export interface CostAvoidance {
  confirmedHoursPerMonth: number; // from recorded outcomes
  expectedHoursPerMonth: number; // from assessments, where no outcome has been recorded yet
  confirmedPerYear: number | null; // money; null when no rate is set
  expectedPerYear: number | null;
  direct: number; // cost-avoidance amounts entered on outcomes
  confirmedCount: number;
  expectedCount: number;
  directCount: number;
}

export const costAvoidance = (
  completed: ServiceRequest[],
  teamFor: (r: ServiceRequest) => Pick<Team, 'savedHourValue' | 'hourlyRate'> | undefined
): CostAvoidance => {
  const result: CostAvoidance = {
    confirmedHoursPerMonth: 0, expectedHoursPerMonth: 0, confirmedPerYear: null, expectedPerYear: null,
    direct: 0, confirmedCount: 0, expectedCount: 0, directCount: 0
  };
  const add = (kind: 'confirmed' | 'expected', hours: number, rate: number | null) => {
    result[`${kind}HoursPerMonth`] += hours;
    result[`${kind}Count`]++;
    if (rate !== null) result[`${kind}PerYear`] = (result[`${kind}PerYear`] ?? 0) + hours * MONTHS_PER_YEAR * rate;
  };
  for (const r of completed) {
    const rate = savedHourValue(teamFor(r));
    const confirmed = r.outcome?.hoursSavedPerMonth;
    if (typeof confirmed === 'number') {
      if (confirmed > 0) add('confirmed', confirmed, rate);
    } else if (r.expectedBenefit?.hoursSavedPerMonth) {
      add('expected', r.expectedBenefit.hoursSavedPerMonth, rate);
    }
    for (const m of r.outcome?.metrics || []) {
      if (m.type === 'cost-avoidance' && Number.isFinite(m.value)) {
        result.direct += m.value;
        result.directCount++;
      }
    }
  }
  return result;
};
