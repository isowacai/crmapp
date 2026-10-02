import React, { useState } from 'react';
import { AssessmentCriterion, AssessmentDecision, PriorityThresholds, ServiceRequest, User } from '../../types';
import { decisionWindow } from '../../lib/forecast';
import CapacityCheck from '../capacity/CapacityCheck';
import { activeCriteria, calculateScore, levelForScore, normalizedWeights, PRIORITY_STYLES } from '../../lib/priority';
import { AssessInput } from '../../services/requestCommands';
import { formatMoney, MONTHS_PER_YEAR } from '../../lib/value';

const inputClass =
  'mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500';

const DECISIONS: { value: AssessmentDecision; label: string; help: string }[] = [
  { value: 'accept', label: 'Accept', help: 'Valid demand; approve it for planning' },
  { value: 'more-info', label: 'Request more information', help: 'Ask the requester before deciding' },
  { value: 'defer', label: 'Defer', help: 'Valid, but not now' },
  { value: 'decline', label: 'Decline', help: "The team won't take this on" }
];

// Scores a request against the team's criteria and records a decision
const AssessmentForm = ({
  request,
  criteria,
  thresholds,
  teamUsers,
  requests,
  initialDecision = 'accept',
  allowMoreInfo = true,
  hourValue = null,
  currency = 'USD',
  onSubmit,
  onCancel
}: {
  request: ServiceRequest;
  criteria: AssessmentCriterion[];
  thresholds: PriorityThresholds;
  teamUsers: User[];
  requests: ServiceRequest[];
  initialDecision?: AssessmentDecision;
  allowMoreInfo?: boolean; // false when the team doesn't use the Assessing stage
  hourValue?: number | null; // value of an hour saved, to show the expected benefit in money
  currency?: string;
  onSubmit: (input: AssessInput) => Promise<void>;
  onCancel: () => void;
}) => {
  const active = activeCriteria(criteria);
  const weights = normalizedWeights(criteria);
  // Start from the latest assessment, if any, so reassessing only needs the changes
  const previous = request.assessments?.at(-1);

  const [scores, setScores] = useState<Record<string, number>>(() =>
    Object.fromEntries(active.filter(c => previous?.scores[c.key] !== undefined).map(c => [c.key, previous!.scores[c.key]]))
  );
  const [estimatedHours, setEstimatedHours] = useState(request.estimatedHours || previous?.estimatedHours || 0);
  const [dependencies, setDependencies] = useState(previous?.dependencies ?? '');
  const [comments, setComments] = useState('');
  const [decision, setDecision] = useState<AssessmentDecision>(initialDecision);
  const [revisitOn, setRevisitOn] = useState('');
  const [hoursSaved, setHoursSaved] = useState(request.expectedBenefit?.hoursSavedPerMonth ?? 0);
  const [benefitNote, setBenefitNote] = useState(request.expectedBenefit?.description ?? '');
  const [submitting, setSubmitting] = useState(false);

  const score = calculateScore(scores, active);
  const level = score === null ? null : levelForScore(score, thresholds);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit({
        scores,
        estimatedHours,
        dependencies,
        comments,
        decision,
        revisitOn,
        expectedBenefit: { hoursSavedPerMonth: hoursSaved || 0, description: benefitNote }
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-3">
        {active.map(c => {
          const options = Array.from({ length: c.max - c.min + 1 }, (_, i) => c.min + i);
          return (
            <div key={c.key} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-2 items-center">
              <div>
                <p className="text-sm font-medium text-gray-800">
                  {c.label} <span className="text-xs font-normal text-gray-500">· {Math.round(weights[c.key])}%</span>
                </p>
                <p className="text-xs text-gray-500">
                  {c.description}
                  {c.direction === 'lower' && ' (higher score lowers priority)'}
                </p>
              </div>
              <div className="flex gap-1" role="radiogroup" aria-label={c.label}>
                {options.length <= 10 ? (
                  options.map(v => (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={scores[c.key] === v}
                      onClick={() => setScores(prev => ({ ...prev, [c.key]: v }))}
                      className={`w-9 h-9 rounded-lg text-sm font-medium border transition-colors ${
                        scores[c.key] === v ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {v}
                    </button>
                  ))
                ) : (
                  <input
                    type="number"
                    min={c.min}
                    max={c.max}
                    value={scores[c.key] ?? ''}
                    onChange={e => setScores(prev => ({ ...prev, [c.key]: Number(e.target.value) }))}
                    className="w-24 rounded-lg border-gray-300"
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg bg-gray-50">
        <span className="text-sm text-gray-600">Calculated priority</span>
        {level ? (
          <>
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${PRIORITY_STYLES[level].badge}`}>{PRIORITY_STYLES[level].label}</span>
            <span className="text-sm font-semibold tabular-nums">{score}/100</span>
          </>
        ) : (
          <span className="text-sm text-gray-500">Score every criterion to calculate it</span>
        )}
        {request.priorityOverride && (
          <span className="text-xs text-amber-700">
            A manager priority ({PRIORITY_STYLES[request.priorityOverride.level].label}) is in force and will stay until cleared.
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Estimated effort (hours)</label>
          <input
            type="number"
            min={0}
            step={0.5}
            className={inputClass}
            value={estimatedHours || ''}
            onChange={e => setEstimatedHours(Number(e.target.value))}
            required={decision === 'accept'}
          />
        </div>
        <div>
          <p className="block text-sm font-medium text-gray-700">Requested completion</p>
          <p className="mt-2 text-sm text-gray-900">{request.neededBy || 'No date requested'}</p>
        </div>
      </div>
      {estimatedHours > 0 && (() => {
        const window = decisionWindow(request);
        return (
          <CapacityCheck
            request={request}
            effort={estimatedHours}
            start={window.start}
            end={window.end}
            basis={window.basis}
            teamUsers={teamUsers}
            requests={requests}
          />
        );
      })()}
      <div>
        <label className="block text-sm font-medium text-gray-700">Dependencies (optional)</label>
        <input
          className={inputClass}
          value={dependencies}
          onChange={e => setDependencies(e.target.value)}
          placeholder="Other teams, systems, approvals, or work this depends on"
        />
      </div>

      <fieldset className="p-3 rounded-lg border border-emerald-100 bg-emerald-50/40">
        <legend className="px-1 text-sm font-medium text-gray-700">Expected benefit (optional)</legend>
        <p className="text-xs text-gray-500 mb-2">
          Business hours this work should save each month once delivered. Confirmed in the outcome after completion, and turned into
          cost avoidance on the dashboard.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-[10rem_1fr] gap-3">
          <label className="text-xs text-gray-600">
            Hours saved per month
            <input type="number" min={0} step={0.5} className={inputClass} value={hoursSaved || ''} onChange={e => setHoursSaved(Number(e.target.value))} />
          </label>
          <label className="text-xs text-gray-600">
            What will it save?
            <input className={inputClass} value={benefitNote} onChange={e => setBenefitNote(e.target.value)} placeholder="e.g. No more manual weekend deployments" />
          </label>
        </div>
        {hoursSaved > 0 && hourValue !== null && (
          <p className="mt-2 text-xs text-emerald-800">
            ≈ {formatMoney(hoursSaved * MONTHS_PER_YEAR * hourValue, currency)} a year in cost avoidance ({hoursSaved} h × {MONTHS_PER_YEAR} months ×{' '}
            {formatMoney(hourValue, currency)}/h)
          </p>
        )}
      </fieldset>

      <fieldset>
        <legend className="block text-sm font-medium text-gray-700 mb-2">Decision</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {DECISIONS.filter(d => allowMoreInfo || d.value !== 'more-info').map(d => (
            <label
              key={d.value}
              className={`flex gap-2 p-3 rounded-lg border cursor-pointer ${decision === d.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}
            >
              <input type="radio" name="decision" value={d.value} checked={decision === d.value} onChange={() => setDecision(d.value)} className="mt-0.5" />
              <span>
                <span className="block text-sm font-medium text-gray-900">{d.label}</span>
                <span className="block text-xs text-gray-500">{d.help}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {decision === 'defer' && (
        <div className="sm:w-1/2">
          <label className="block text-sm font-medium text-gray-700">Revisit on (optional)</label>
          <input type="date" className={inputClass} value={revisitOn} onChange={e => setRevisitOn(e.target.value)} />
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700">
          {decision === 'accept' ? 'Comments (optional)' : decision === 'more-info' ? 'What do you need to know?' : 'Reason (shown to the requester)'}
        </label>
        <textarea className={inputClass} rows={2} value={comments} onChange={e => setComments(e.target.value)} required={decision !== 'accept'} />
      </div>

      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
          Cancel
        </button>
        <button type="submit" className="btn-primary disabled:opacity-60" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save assessment'}
        </button>
      </div>
    </form>
  );
};

export default AssessmentForm;
