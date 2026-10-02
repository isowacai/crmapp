import { useEffect, useState } from 'react';
import { standardWeek, WorkCalendar } from '../../lib/demand';

// Monday first; values are JavaScript day numbers (0 = Sunday)
const DAYS = [
  { day: 1, label: 'Mon' },
  { day: 2, label: 'Tue' },
  { day: 3, label: 'Wed' },
  { day: 4, label: 'Thu' },
  { day: 5, label: 'Fri' },
  { day: 6, label: 'Sat' },
  { day: 0, label: 'Sun' }
];

// The team's working days and standard daily hours. Estimates are spread over the working days;
// days × hours is the standard week new members start with.
const WorkingWeekEditor = ({
  value,
  readOnly,
  memberCount,
  onSave
}: {
  value: WorkCalendar;
  readOnly: boolean;
  memberCount: number;
  onSave: (calendar: WorkCalendar, applyToMembers: boolean) => Promise<void>;
}) => {
  const [days, setDays] = useState(value.workingDays);
  const [hours, setHours] = useState(value.hoursPerDay);
  const [applyToMembers, setApplyToMembers] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDays(value.workingDays);
    setHours(value.hoursPerDay);
  }, [value]);

  const draft: WorkCalendar = { workingDays: [...days].sort((a, b) => a - b), hoursPerDay: hours };
  const valid = days.length > 0 && hours > 0 && hours <= 24;
  const changed = JSON.stringify(draft) !== JSON.stringify(value);
  const week = standardWeek(draft);

  const toggle = (day: number) => setDays(d => (d.includes(day) ? d.filter(x => x !== day) : [...d, day]));

  const save = async () => {
    setSaving(true);
    try {
      await onSave(draft, applyToMembers);
      setApplyToMembers(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-6">
        <fieldset>
          <legend className="text-sm font-medium text-gray-700">Working days</legend>
          <div className="mt-1 flex gap-1">
            {DAYS.map(({ day, label }) => {
              const on = days.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  disabled={readOnly}
                  aria-pressed={on}
                  onClick={() => toggle(day)}
                  className={`w-12 py-1.5 rounded-lg text-sm font-medium border ${
                    on ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                  } disabled:cursor-not-allowed`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </fieldset>
        <label className="text-sm font-medium text-gray-700">
          Hours per day
          <input
            type="number"
            min={0.5}
            max={24}
            step={0.5}
            value={hours}
            disabled={readOnly}
            onChange={e => setHours(Number(e.target.value))}
            className="mt-1 block w-24 rounded-lg border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
          />
        </label>
        <p className="text-sm text-gray-600 pb-2">
          Standard week: <strong>{valid ? `${week} h` : '—'}</strong>
          {valid && <span className="text-gray-500"> ({days.length} days × {hours} h)</span>}
        </p>
      </div>
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-4">
          {memberCount > 0 && (
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" className="rounded" checked={applyToMembers} onChange={e => setApplyToMembers(e.target.checked)} />
              Also set every member's weekly hours to {valid ? `${week} h` : 'the standard week'}
            </label>
          )}
          <button onClick={save} disabled={!valid || saving || (!changed && !applyToMembers)} className="btn-primary disabled:opacity-50">
            {saving ? 'Saving…' : 'Save working week'}
          </button>
        </div>
      )}
      {!valid && !readOnly && <p className="text-sm text-amber-700">Choose at least one working day and between 0.5 and 24 hours per day.</p>}
    </div>
  );
};

export default WorkingWeekEditor;
