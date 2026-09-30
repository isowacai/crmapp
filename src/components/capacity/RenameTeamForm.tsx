import React, { useState } from 'react';
import { UNASSIGNED_TEAM } from '../../lib/demand';

const inputClass =
  'mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500';

const RenameTeamForm = ({
  team,
  memberNames,
  serviceCount,
  existingTeams,
  onSubmit,
  onCancel
}: {
  team: string;
  memberNames: string[];
  serviceCount: number;
  existingTeams: string[];
  onSubmit: (newName: string) => Promise<void>;
  onCancel: () => void;
}) => {
  const isUnassigned = team === UNASSIGNED_TEAM;
  const [name, setName] = useState(isUnassigned ? '' : team);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const mergesInto = existingTeams.find(t => t !== team && t.toLowerCase() === trimmed.toLowerCase());
  const unchanged = trimmed === team;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed || unchanged) return;
    if (trimmed.toLowerCase() === UNASSIGNED_TEAM.toLowerCase()) {
      setError(`"${UNASSIGNED_TEAM}" is reserved for people without a team.`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // Reuse the existing team's exact spelling when merging
      await onSubmit(mergesInto ?? trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename the team');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">
          {isUnassigned ? 'Team name for these people' : 'New team name'}
        </label>
        <input
          className={inputClass}
          value={name}
          onChange={e => setName(e.target.value)}
          list="rename-team-options"
          maxLength={60}
          autoFocus
          required
        />
        <datalist id="rename-team-options">
          {existingTeams.filter(t => t !== team).map(t => <option key={t} value={t} />)}
        </datalist>
      </div>

      <div className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3 space-y-1">
        <p>
          This will update <strong>{memberNames.length}</strong> {memberNames.length === 1 ? 'person' : 'people'}:{' '}
          {memberNames.join(', ')}.
        </p>
        {!isUnassigned && serviceCount > 0 && (
          <p>
            It will also update <strong>{serviceCount}</strong> catalog {serviceCount === 1 ? 'service' : 'services'} delivered by {team}.
          </p>
        )}
        {mergesInto && (
          <p className="text-amber-700">"{mergesInto}" already exists, so these people will join that team.</p>
        )}
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm">{error}</div>}

      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
          Cancel
        </button>
        <button type="submit" className="btn-primary disabled:opacity-60" disabled={submitting || !trimmed || unchanged}>
          {submitting ? 'Saving…' : mergesInto ? 'Move to team' : isUnassigned ? 'Assign team' : 'Rename team'}
        </button>
      </div>
    </form>
  );
};

export default RenameTeamForm;
