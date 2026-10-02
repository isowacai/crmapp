import { useState } from 'react';
import { Plus, Trash2, RotateCcw } from 'lucide-react';
import { AssessmentCriterion, PriorityThresholds } from '../../types';
import {
  calculateScore,
  criterionKey,
  DEFAULT_CRITERIA,
  DEFAULT_THRESHOLDS,
  levelForScore,
  normalizedWeights,
  PRIORITY_STYLES,
  validateModel
} from '../../lib/priority';
import { SERIES, NEUTRAL } from '../charts/chartTheme';

const cellInput = 'w-full rounded-md border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500';

// Edits a team's assessment criteria, weights, scales, and priority thresholds, with a live preview
const PriorityModelEditor = ({
  criteria: initialCriteria,
  thresholds: initialThresholds,
  readOnly,
  section = 'all',
  saveLabel = 'Save priority model',
  onSave
}: {
  criteria: AssessmentCriterion[];
  thresholds: PriorityThresholds;
  readOnly: boolean;
  // 'criteria' = what demand is scored on; 'thresholds' = the resulting weights and priority cut-offs
  section?: 'all' | 'criteria' | 'thresholds';
  saveLabel?: string;
  onSave: (criteria: AssessmentCriterion[], thresholds: PriorityThresholds) => Promise<void>;
}) => {
  const showCriteria = section !== 'thresholds';
  const showThresholds = section !== 'criteria';
  const [criteria, setCriteria] = useState<AssessmentCriterion[]>(initialCriteria);
  const [thresholds, setThresholds] = useState<PriorityThresholds>(initialThresholds);
  const [trial, setTrial] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const problems = validateModel(criteria, thresholds);
  const weights = normalizedWeights(criteria);
  const dirty = JSON.stringify(criteria) !== JSON.stringify(initialCriteria) || JSON.stringify(thresholds) !== JSON.stringify(initialThresholds);

  const updateCriterion = (i: number, patch: Partial<AssessmentCriterion>) =>
    setCriteria(prev => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  const addCriterion = () => {
    const key = criterionKey('New criterion', criteria.map(c => c.key));
    setCriteria(prev => [...prev, { key, label: 'New criterion', description: '', weight: 10, enabled: true, min: 1, max: 5, direction: 'higher' }]);
  };

  const trialScores = Object.fromEntries(criteria.map(c => [c.key, trial[c.key] ?? Math.round((c.min + c.max) / 2)]));
  const trialScore = calculateScore(trialScores, criteria);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await onSave(criteria, thresholds);
      setMessage({ tone: 'ok', text: 'Saved. New assessments use this model; past assessments keep the weights they were scored with.' });
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not save' });
    } finally {
      setSaving(false);
    }
  };

  const active = criteria.filter(c => c.enabled && c.weight > 0);

  return (
    <div className="space-y-6">
      {showCriteria && (<>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium w-10">On</th>
              <th className="px-3 py-2 text-left font-medium">Criterion</th>
              <th className="px-3 py-2 text-left font-medium w-24">Weight</th>
              <th className="px-3 py-2 text-left font-medium w-20">Share</th>
              <th className="px-3 py-2 text-left font-medium w-36">Scale</th>
              <th className="px-3 py-2 text-left font-medium w-44">Higher score…</th>
              <th className="px-2 py-2 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {criteria.map((c, i) => (
              <tr key={c.key} className={c.enabled ? '' : 'bg-gray-50 text-gray-400'}>
                <td className="px-3 py-2">
                  <input type="checkbox" checked={c.enabled} disabled={readOnly} onChange={e => updateCriterion(i, { enabled: e.target.checked })} className="rounded" aria-label={`Use ${c.label}`} />
                </td>
                <td className="px-3 py-2 space-y-1 min-w-[14rem]">
                  <input className={cellInput} value={c.label} disabled={readOnly} onChange={e => updateCriterion(i, { label: e.target.value })} aria-label="Name" />
                  <input className={`${cellInput} text-xs`} value={c.description} disabled={readOnly} placeholder="What assessors should consider" onChange={e => updateCriterion(i, { description: e.target.value })} aria-label="Description" />
                </td>
                <td className="px-3 py-2">
                  <input type="number" min={0} className={cellInput} value={c.weight} disabled={readOnly} onChange={e => updateCriterion(i, { weight: Number(e.target.value) })} aria-label="Weight" />
                </td>
                <td className="px-3 py-2 tabular-nums text-gray-700">{weights[c.key] !== undefined ? `${Math.round(weights[c.key])}%` : '—'}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    <input type="number" className={cellInput} value={c.min} disabled={readOnly} onChange={e => updateCriterion(i, { min: Number(e.target.value) })} aria-label="Minimum score" />
                    <span className="text-gray-400">–</span>
                    <input type="number" className={cellInput} value={c.max} disabled={readOnly} onChange={e => updateCriterion(i, { max: Number(e.target.value) })} aria-label="Maximum score" />
                  </div>
                </td>
                <td className="px-3 py-2">
                  <select className={cellInput} value={c.direction} disabled={readOnly} onChange={e => updateCriterion(i, { direction: e.target.value as AssessmentCriterion['direction'] })} aria-label="Direction">
                    <option value="higher">raises priority</option>
                    <option value="lower">lowers priority</option>
                  </select>
                </td>
                <td className="px-2 py-2">
                  {!readOnly && (
                    <button onClick={() => setCriteria(prev => prev.filter((_, idx) => idx !== i))} className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50" aria-label={`Remove ${c.label}`}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <button onClick={addCriterion} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
            <Plus size={16} /> Add criterion
          </button>
          <button
            onClick={() => { setCriteria(DEFAULT_CRITERIA); setThresholds(DEFAULT_THRESHOLDS); }}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <RotateCcw size={16} /> Reset to defaults
          </button>
        </div>
      )}

      </>)}

      {/* Weight shares as one stacked bar; legend carries names and values */}
      {active.length > 0 && (
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">How the score is made up</p>
          <div className="flex h-3 rounded-full overflow-hidden gap-0.5 bg-white">
            {active.map((c, i) => (
              <div key={c.key} style={{ width: `${weights[c.key]}%`, backgroundColor: SERIES[i] ?? NEUTRAL }} title={`${c.label}: ${Math.round(weights[c.key])}%`} />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-600">
            {active.map((c, i) => (
              <span key={c.key} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: SERIES[i] ?? NEUTRAL }} />
                {c.label} {Math.round(weights[c.key])}%
              </span>
            ))}
          </div>
        </div>
      )}

      {showThresholds && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Priority thresholds (score out of 100)</p>
          <div className="grid grid-cols-3 gap-3">
            {(['critical', 'high', 'medium'] as const).map(level => (
              <label key={level} className="text-sm">
                <span className={`inline-block mb-1 px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_STYLES[level].badge}`}>{PRIORITY_STYLES[level].label} ≥</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  className={cellInput}
                  value={thresholds[level]}
                  disabled={readOnly}
                  onChange={e => setThresholds(prev => ({ ...prev, [level]: Number(e.target.value) }))}
                />
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500">Anything below {thresholds.medium} is Low.</p>
        </div>

        <div className="rounded-lg bg-gray-50 p-4">
          <p className="text-sm font-medium text-gray-700 mb-2">Try it</p>
          <div className="space-y-2">
            {active.map(c => (
              <label key={c.key} className="grid grid-cols-[minmax(0,1fr)_8rem_2rem] items-center gap-2 text-sm">
                <span className="truncate text-gray-700">{c.label}</span>
                <input
                  type="range"
                  min={c.min}
                  max={c.max}
                  value={trialScores[c.key]}
                  onChange={e => setTrial(prev => ({ ...prev, [c.key]: Number(e.target.value) }))}
                />
                <span className="tabular-nums text-gray-900">{trialScores[c.key]}</span>
              </label>
            ))}
          </div>
          {trialScore !== null && problems.length === 0 && (
            <p className="mt-3 text-sm">
              Score <strong className="tabular-nums">{trialScore}/100</strong> →{' '}
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_STYLES[levelForScore(trialScore, thresholds)].badge}`}>
                {PRIORITY_STYLES[levelForScore(trialScore, thresholds)].label}
              </span>
            </p>
          )}
        </div>
      </div>

      )}

      {problems.length > 0 && (
        <ul className="p-3 rounded-lg bg-amber-50 text-amber-800 text-sm list-disc pl-6">
          {problems.map(p => <li key={p}>{p}</li>)}
        </ul>
      )}
      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.tone === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-600'}`}>{message.text}</div>
      )}

      {!readOnly && (
        <div className="flex justify-end">
          <button onClick={save} disabled={saving || (!dirty && section === 'all') || problems.length > 0} className="btn-primary disabled:opacity-50">
            {saving ? 'Saving…' : saveLabel}
          </button>
        </div>
      )}
    </div>
  );
};

export default PriorityModelEditor;
