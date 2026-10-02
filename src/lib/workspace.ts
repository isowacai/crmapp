// Per-team workspace configuration: who can request, request questions, optional workflow stages,
// dashboard KPIs, and guided-setup progress.
import { RequestAccess, RequestAnswer, RequestField, Team, TeamWorkflow } from '../types';

// ---------- Workflow ----------

export const DEFAULT_WORKFLOW: TeamWorkflow = { useAssessing: true, usePlanned: true };

export const workflowOf = (team?: Pick<Team, 'workflow'> | null): TeamWorkflow => ({ ...DEFAULT_WORKFLOW, ...(team?.workflow ?? {}) });

// ---------- Request access ----------

export const DEFAULT_ACCESS: RequestAccess = { mode: 'everyone', teamIds: [] };

export const accessOf = (team?: Pick<Team, 'requestAccess'> | null): RequestAccess => team?.requestAccess ?? DEFAULT_ACCESS;

// Whether someone in `requesterTeamId` may raise requests with this delivering team (its own members always may)
export const canRequest = (team: Pick<Team, 'id' | 'requestAccess'>, requesterTeamId: string | undefined) => {
  const access = accessOf(team);
  return access.mode === 'everyone' || (!!requesterTeamId && (requesterTeamId === team.id || access.teamIds.includes(requesterTeamId)));
};

// ---------- Request questions ----------

export const FIELD_TYPES: { value: RequestField['type']; label: string }[] = [
  { value: 'text', label: 'Short answer' },
  { value: 'textarea', label: 'Paragraph' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Choice' }
];

export const newField = (existing: RequestField[]): RequestField => {
  let n = existing.length + 1;
  while (existing.some(f => f.id === `q${n}`)) n++;
  return { id: `q${n}`, label: '', type: 'text', required: false, options: [], help: '' };
};

export const validateRequestFields = (fields: RequestField[]): string[] => {
  const problems: string[] = [];
  for (const f of fields) {
    if (!f.label.trim()) problems.push('Every question needs some text.');
    if (f.type === 'select' && f.options.filter(o => o.trim()).length < 2) problems.push(`"${f.label || 'A choice question'}" needs at least two options.`);
  }
  if (new Set(fields.map(f => f.id)).size !== fields.length) problems.push('Two questions share an ID.');
  return [...new Set(problems)];
};

// Turns raw form values into stored answers, checking required questions and choice values
export const buildAnswers = (fields: RequestField[], values: Record<string, string>): { answers: RequestAnswer[]; problems: string[] } => {
  const problems: string[] = [];
  const answers: RequestAnswer[] = [];
  for (const f of fields) {
    const value = (values[f.id] ?? '').trim();
    if (!value) {
      if (f.required) problems.push(`Please answer "${f.label}".`);
      continue;
    }
    if (f.type === 'number' && !Number.isFinite(Number(value))) problems.push(`"${f.label}" must be a number.`);
    if (f.type === 'select' && !f.options.includes(value)) problems.push(`Choose one of the options for "${f.label}".`);
    answers.push({ fieldId: f.id, label: f.label, value });
  }
  return { answers, problems };
};

// ---------- Dashboard KPIs ----------

// Headline figures a team can choose for the top of its dashboard (values are computed on the dashboard)
export const KPI_OPTIONS = [
  { key: 'open', label: 'Open demand' },
  { key: 'awaiting', label: 'Awaiting assessment' },
  { key: 'committedPct', label: 'Committed this month' },
  { key: 'outlook', label: 'Capacity outlook' },
  { key: 'attention', label: 'Needs attention' },
  { key: 'completed', label: 'Completed (90 days)' },
  { key: 'new30', label: 'New demand (30 days)' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'leadTime', label: 'Average lead time' },
  { key: 'targets', label: 'Service targets met' },
  { key: 'costAvoidance', label: 'Cost avoidance' },
  { key: 'effort', label: 'Effort consumed (90 days)' }
] as const;

export type KpiKey = (typeof KPI_OPTIONS)[number]['key'];

export const DEFAULT_KPIS: KpiKey[] = ['open', 'awaiting', 'committedPct', 'outlook', 'attention', 'completed'];
export const MAX_KPIS = 6;

export const kpisOf = (team?: Pick<Team, 'dashboardKpis'> | null): KpiKey[] => {
  const valid = (team?.dashboardKpis ?? []).filter((k): k is KpiKey => KPI_OPTIONS.some(o => o.key === k));
  return valid.length ? valid.slice(0, MAX_KPIS) : DEFAULT_KPIS;
};
