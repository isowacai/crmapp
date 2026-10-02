import { useState } from 'react';
import { ServiceTargets, Team } from '../../types';
import { NO_TARGETS, TARGETS } from '../../lib/lifecycle';
import { DEFAULT_CURRENCY } from '../../lib/value';

const cellInput = 'mt-1 block w-full rounded-md border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500';

const TARGET_HELP: Record<keyof ServiceTargets, string> = {
  responseDays: 'From submission to the first reply or action by the team',
  assessmentDays: 'From submission to an accept, defer, or decline decision',
  commitmentDays: 'From approval to committing capacity',
  deliveryDays: 'From commitment to completion'
};

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'CHF', 'JPY', 'INR', 'AED', 'SAR', 'ZAR', 'SGD'];

// Optional service targets plus the cost rate and currency for a team's workspace
const TargetsAndCostEditor = ({
  team,
  readOnly,
  onSave
}: {
  team: Team;
  readOnly: boolean;
  onSave: (data: Pick<Team, 'serviceTargets' | 'hourlyRate' | 'currency' | 'savedHourValue'>) => Promise<void>;
}) => {
  const [targets, setTargets] = useState<ServiceTargets>({ ...NO_TARGETS, ...(team.serviceTargets ?? {}) });
  const [rate, setRate] = useState<string>(team.hourlyRate ? String(team.hourlyRate) : '');
  const [currency, setCurrency] = useState(team.currency || DEFAULT_CURRENCY);
  const [hourValue, setHourValue] = useState<string>(team.savedHourValue ? String(team.savedHourValue) : '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const invalid =
    Object.values(targets).some(v => v !== null && !(v > 0)) || (rate !== '' && !(Number(rate) > 0)) || (hourValue !== '' && !(Number(hourValue) > 0));

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await onSave({ serviceTargets: targets, hourlyRate: rate === '' ? null : Number(rate), currency, savedHourValue: hourValue === '' ? null : Number(hourValue) });
      setMessage({ tone: 'ok', text: 'Saved.' });
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not save' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-gray-700">Service targets (calendar days; leave blank to not track)</p>
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {TARGETS.map(t => (
            <label key={t.key} className="text-sm">
              <span className="font-medium text-gray-800">{t.label}</span>
              <input
                type="number"
                min={0.5}
                step={0.5}
                className={cellInput}
                value={targets[t.key] ?? ''}
                disabled={readOnly}
                placeholder="Not tracked"
                onChange={e => setTargets(prev => ({ ...prev, [t.key]: e.target.value === '' ? null : Number(e.target.value) }))}
              />
              <span className="mt-1 block text-xs text-gray-500">{TARGET_HELP[t.key]}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <label className="text-sm">
          <span className="font-medium text-gray-800">Default hourly rate (optional)</span>
          <input
            type="number"
            min={0}
            step={1}
            className={cellInput}
            value={rate}
            disabled={readOnly}
            placeholder="No cost tracking"
            onChange={e => setRate(e.target.value)}
          />
          <span className="mt-1 block text-xs text-gray-500">Used for estimated and actual cost. Set individual rates under People &amp; capacity.</span>
        </label>
        <label className="text-sm">
          <span className="font-medium text-gray-800">Value of an hour saved (optional)</span>
          <input
            type="number"
            min={0}
            step={1}
            className={cellInput}
            value={hourValue}
            disabled={readOnly}
            placeholder={rate ? `Same as hourly rate (${rate})` : 'Not set'}
            onChange={e => setHourValue(e.target.value)}
          />
          <span className="mt-1 block text-xs text-gray-500">
            Turns hours saved for the business into cost avoidance: hours saved per month × 12 × this value. Blank uses the hourly rate.
          </span>
        </label>
        <label className="text-sm">
          <span className="font-medium text-gray-800">Currency</span>
          <select className={cellInput} value={currency} disabled={readOnly} onChange={e => setCurrency(e.target.value)}>
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <span className="mt-1 block text-xs text-gray-500">For costs and financial outcomes.</span>
        </label>
      </div>

      {invalid && <p className="text-sm text-amber-700">Targets and rates must be greater than 0 (or left blank).</p>}
      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.tone === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-600'}`}>{message.text}</div>
      )}
      {!readOnly && (
        <div className="flex justify-end">
          <button onClick={save} disabled={saving || invalid} className="btn-primary disabled:opacity-50">
            {saving ? 'Saving…' : 'Save targets and rates'}
          </button>
        </div>
      )}
    </div>
  );
};

export default TargetsAndCostEditor;
