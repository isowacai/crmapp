import { useState } from 'react';
import { Plus, Trash2, Trophy } from 'lucide-react';
import { OutcomeMetric, OutcomeType, ServiceRequest } from '../../types';
import { formatMoney, MONTHS_PER_YEAR, OUTCOME_TYPES, outcomeLabel } from '../../lib/value';
import { formatHours } from '../../lib/demand';
import * as commands from '../../services/requestCommands';

const inputClass = 'mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm';

const unitFor = (type: OutcomeType, currency: string) => {
  const unit = OUTCOME_TYPES.find(t => t.key === type)?.unit;
  return unit === 'currency' ? currency : unit ?? '';
};

const formatMetric = (m: OutcomeMetric) =>
  /^[A-Z]{3}$/.test(m.unit) ? formatMoney(m.value, m.unit) : `${m.value.toLocaleString()}${m.unit ? ` ${m.unit}` : ''}`;

// The value delivered by completed work: what kind, any measured results, and a summary
const OutcomePanel = ({
  request: r,
  canEdit,
  currency,
  hourValue = null,
  actor,
  run
}: {
  request: ServiceRequest;
  canEdit: boolean;
  currency: string;
  hourValue?: number | null; // value of an hour saved, for cost avoidance
  actor: commands.Actor;
  run: (build: () => commands.RequestPatch) => Promise<void>;
}) => {
  const [editing, setEditing] = useState(false);
  const [types, setTypes] = useState<OutcomeType[]>(r.outcome?.types ?? []);
  const [metrics, setMetrics] = useState<OutcomeMetric[]>(r.outcome?.metrics ?? []);
  const [summary, setSummary] = useState(r.outcome?.summary ?? '');
  // Starts from the hours expected at assessment
  const [hoursSaved, setHoursSaved] = useState<number>(r.outcome?.hoursSavedPerMonth ?? r.expectedBenefit?.hoursSavedPerMonth ?? 0);
  const expected = r.expectedBenefit?.hoursSavedPerMonth ?? 0;
  const perYear = (hours: number) => (hourValue !== null ? formatMoney(hours * MONTHS_PER_YEAR * hourValue, currency) : null);

  if (r.status !== 'completed' && !r.outcome) {
    return <p className="text-sm text-gray-500">Outcomes are recorded once the work is completed.</p>;
  }

  if (!editing) {
    return r.outcome ? (
      <div className="space-y-4">
        {(r.outcome.hoursSavedPerMonth || expected > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3">
              <p className="text-xs text-gray-500">Hours saved per month</p>
              <p className="text-lg font-semibold">
                {r.outcome.hoursSavedPerMonth ? formatHours(r.outcome.hoursSavedPerMonth) : '—'}
                {expected > 0 && <span className="ml-2 text-xs font-normal text-gray-500">expected {formatHours(expected)}</span>}
              </p>
            </div>
            {r.outcome.hoursSavedPerMonth && perYear(r.outcome.hoursSavedPerMonth) ? (
              <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3">
                <p className="text-xs text-gray-500">Cost avoidance</p>
                <p className="text-lg font-semibold">{perYear(r.outcome.hoursSavedPerMonth)} <span className="text-xs font-normal text-gray-500">a year</span></p>
              </div>
            ) : null}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {r.outcome.types.map(t => (
            <span key={t} className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">{outcomeLabel(t)}</span>
          ))}
        </div>
        {r.outcome.metrics.length > 0 && (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {r.outcome.metrics.map((m, i) => (
              <div key={i} className="rounded-lg border border-gray-100 p-3">
                <dt className="text-xs text-gray-500">{outcomeLabel(m.type)}</dt>
                <dd className="text-lg font-semibold">{formatMetric(m)}</dd>
                {m.description && <dd className="text-xs text-gray-600">{m.description}</dd>}
              </div>
            ))}
          </dl>
        )}
        <p className="text-sm text-gray-800 whitespace-pre-wrap">{r.outcome.summary}</p>
        <p className="text-xs text-gray-500">Recorded by {r.outcome.recordedByName} · {new Date(r.outcome.recordedAt).toLocaleDateString()}</p>
        {canEdit && (
          <button onClick={() => setEditing(true)} className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
            Edit outcome
          </button>
        )}
      </div>
    ) : (
      <div className="flex flex-col items-start gap-3 p-4 rounded-lg bg-gray-50">
        <p className="text-sm text-gray-700 flex items-center gap-2">
          <Trophy size={16} className="text-amber-600" /> No outcome recorded yet. What value did this work deliver?
        </p>
        {expected > 0 && (
          <p className="text-xs text-gray-600">
            Expected at assessment: {formatHours(expected)} saved a month{perYear(expected) ? ` (≈ ${perYear(expected)} a year)` : ''}
            {r.expectedBenefit?.description ? ` · ${r.expectedBenefit.description}` : ''}. Confirm it when you record the outcome.
          </p>
        )}
        {canEdit && <button onClick={() => setEditing(true)} className="btn-primary text-sm">Record outcome</button>}
      </div>
    );
  }

  const toggle = (t: OutcomeType) => setTypes(prev => (prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]));
  const setMetric = (i: number, patch: Partial<OutcomeMetric>) => setMetrics(prev => prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));

  return (
    <form
      onSubmit={async e => {
        e.preventDefault();
        await run(() => commands.recordOutcome(r, { types, metrics, summary, hoursSavedPerMonth: hoursSaved > 0 ? hoursSaved : 0 }, actor));
        setEditing(false);
      }}
      className="space-y-4"
    >
      <fieldset>
        <legend className="text-sm font-medium text-gray-700 mb-2">What kind of outcome? (choose any)</legend>
        <div className="flex flex-wrap gap-2">
          {OUTCOME_TYPES.map(t => (
            <label key={t.key} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm cursor-pointer ${types.includes(t.key) ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
              <input type="checkbox" className="sr-only" checked={types.includes(t.key)} onChange={() => toggle(t.key)} />
              {t.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="p-3 rounded-lg border border-emerald-100 bg-emerald-50/40">
        <label className="text-sm font-medium text-gray-700">
          Hours saved per month (actual)
          <input type="number" min={0} step={0.5} className={`${inputClass} sm:w-40`} value={hoursSaved || ''} onChange={e => setHoursSaved(Number(e.target.value))} />
        </label>
        <p className="mt-1 text-xs text-gray-500">
          {expected > 0 ? `Expected at assessment: ${formatHours(expected)}. ` : ''}
          {hoursSaved > 0 && perYear(hoursSaved)
            ? `Counts as ${perYear(hoursSaved)} a year of cost avoidance.`
            : 'Business hours no longer spent each month because of this work; counted as cost avoidance.'}
        </p>
      </div>

      <div>
        <p className="text-sm font-medium text-gray-700">Other measured results (optional)</p>
        <p className="text-xs text-gray-500 mb-2">Financial value isn't required; add figures only where you have them.</p>
        <div className="space-y-2">
          {metrics.map((m, i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-[12rem_8rem_6rem_1fr_auto] gap-2 items-end">
              <label className="text-xs text-gray-600">
                Result
                <select className={inputClass} value={m.type} onChange={e => setMetric(i, { type: e.target.value as OutcomeType, unit: unitFor(e.target.value as OutcomeType, currency) })}>
                  {OUTCOME_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </label>
              <label className="text-xs text-gray-600">
                Value
                <input type="number" min={0} step="any" className={inputClass} value={Number.isFinite(m.value) ? m.value : ''} onChange={e => setMetric(i, { value: e.target.value === '' ? NaN : Number(e.target.value) })} required />
              </label>
              <label className="text-xs text-gray-600">
                Unit
                <input className={inputClass} value={m.unit} onChange={e => setMetric(i, { unit: e.target.value })} placeholder="e.g. hours" />
              </label>
              <label className="text-xs text-gray-600">
                Note (optional)
                <input className={inputClass} value={m.description} onChange={e => setMetric(i, { description: e.target.value })} placeholder="e.g. per year" />
              </label>
              <button type="button" onClick={() => setMetrics(prev => prev.filter((_, idx) => idx !== i))} className="p-2 text-gray-400 hover:text-red-600" aria-label="Remove result">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            const type = types.find(t => OUTCOME_TYPES.find(x => x.key === t)?.unit) ?? 'cost-avoidance';
            setMetrics(prev => [...prev, { type, value: NaN, unit: unitFor(type, currency), description: '' }]);
          }}
          className="mt-2 flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline"
        >
          <Plus size={14} /> Add a measured result
        </button>
      </div>

      <label className="block text-sm font-medium text-gray-700">
        Summary
        <textarea className={inputClass} rows={3} value={summary} onChange={e => setSummary(e.target.value)} placeholder="What changed for the business?" required />
      </label>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setEditing(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
          Cancel
        </button>
        <button type="submit" className="btn-primary">Save outcome</button>
      </div>
    </form>
  );
};

export default OutcomePanel;
