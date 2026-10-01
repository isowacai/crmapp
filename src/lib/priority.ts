// Configurable weighted prioritization. Each team defines its criteria and thresholds; this module
// turns assessment scores into a normalized 0–100 score and a priority level.
import { AssessmentCriterion, PriorityLevel, PriorityThresholds, Team } from '../types';

export const PRIORITY_LEVELS: PriorityLevel[] = ['critical', 'high', 'medium', 'low'];

export const PRIORITY_STYLES: Record<PriorityLevel, { label: string; badge: string }> = {
  critical: { label: 'Critical', badge: 'bg-red-100 text-red-800' },
  high: { label: 'High', badge: 'bg-orange-100 text-orange-800' },
  medium: { label: 'Medium', badge: 'bg-amber-100 text-amber-800' },
  low: { label: 'Low', badge: 'bg-gray-100 text-gray-700' }
};

export const DEFAULT_CRITERIA: AssessmentCriterion[] = [
  { key: 'businessValue', label: 'Business value', description: 'Benefit to the business if delivered', weight: 30, enabled: true, min: 1, max: 5, direction: 'higher' },
  { key: 'urgency', label: 'Urgency', description: 'How soon it is needed; cost of waiting', weight: 25, enabled: true, min: 1, max: 5, direction: 'higher' },
  { key: 'strategicAlignment', label: 'Strategic alignment', description: 'Fit with current goals and priorities', weight: 20, enabled: true, min: 1, max: 5, direction: 'higher' },
  { key: 'riskReduction', label: 'Risk reduction', description: 'Risk, compliance, or security exposure it removes', weight: 15, enabled: true, min: 1, max: 5, direction: 'higher' },
  { key: 'complexity', label: 'Complexity', description: 'Effort and difficulty; simpler work ranks higher', weight: 10, enabled: true, min: 1, max: 5, direction: 'lower' }
];

export const DEFAULT_THRESHOLDS: PriorityThresholds = { critical: 80, high: 60, medium: 40 };

// A team's model, falling back to the defaults when a team has none configured
export const teamModel = (team?: Pick<Team, 'assessmentCriteria' | 'priorityThresholds'> | null) => ({
  criteria: team?.assessmentCriteria?.length ? team.assessmentCriteria : DEFAULT_CRITERIA,
  thresholds: team?.priorityThresholds ?? DEFAULT_THRESHOLDS
});

export const activeCriteria = (criteria: AssessmentCriterion[]) => criteria.filter(c => c.enabled && c.weight > 0);

// Each enabled criterion's share of the total weight, as a percentage
export const normalizedWeights = (criteria: AssessmentCriterion[]): Record<string, number> => {
  const active = activeCriteria(criteria);
  const total = active.reduce((sum, c) => sum + c.weight, 0);
  return Object.fromEntries(active.map(c => [c.key, total > 0 ? (c.weight / total) * 100 : 0]));
};

// Weighted score 0–100, or null if any enabled criterion hasn't been scored
export const calculateScore = (
  scores: Record<string, number>,
  criteria: Pick<AssessmentCriterion, 'key' | 'weight' | 'min' | 'max' | 'direction'>[]
): number | null => {
  const active = criteria.filter(c => c.weight > 0 && ('enabled' in c ? (c as AssessmentCriterion).enabled : true));
  const totalWeight = active.reduce((sum, c) => sum + c.weight, 0);
  if (active.length === 0 || totalWeight <= 0) return null;

  let weighted = 0;
  for (const c of active) {
    const raw = scores[c.key];
    if (raw === undefined || Number.isNaN(raw)) return null;
    const span = c.max - c.min;
    const fraction = span > 0 ? (Math.min(Math.max(raw, c.min), c.max) - c.min) / span : 1;
    weighted += c.weight * (c.direction === 'lower' ? 1 - fraction : fraction);
  }
  return Math.round((weighted / totalWeight) * 100);
};

export const levelForScore = (score: number, thresholds: PriorityThresholds): PriorityLevel =>
  score >= thresholds.critical ? 'critical' : score >= thresholds.high ? 'high' : score >= thresholds.medium ? 'medium' : 'low';

// Validation for the workspace editor; returns problems to show, or [] if the model is usable
export const validateModel = (criteria: AssessmentCriterion[], thresholds: PriorityThresholds): string[] => {
  const problems: string[] = [];
  if (activeCriteria(criteria).length === 0) problems.push('Enable at least one criterion with a weight above 0.');
  const keys = new Set<string>();
  for (const c of criteria) {
    if (!c.label.trim()) problems.push('Every criterion needs a name.');
    if (keys.has(c.key)) problems.push(`Two criteria share the key "${c.key}".`);
    keys.add(c.key);
    if (!(c.max > c.min)) problems.push(`"${c.label || c.key}": the maximum score must be above the minimum.`);
    if (c.weight < 0) problems.push(`"${c.label || c.key}": weight can't be negative.`);
  }
  const { critical, high, medium } = thresholds;
  if (!(critical > high && high > medium && medium > 0 && critical <= 100)) {
    problems.push('Thresholds must satisfy 100 ≥ Critical > High > Medium > 0.');
  }
  return [...new Set(problems)];
};

// Stable key for a new criterion label, e.g. "Customer impact" → "customerImpact"
export const criterionKey = (label: string, existing: string[]): string => {
  const base =
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+(.)?/g, (_, ch: string | undefined) => (ch ? ch.toUpperCase() : ''))
      .replace(/^[^a-z]+/, '') || 'criterion';
  let key = base;
  for (let i = 2; existing.includes(key); i++) key = `${base}${i}`;
  return key;
};
