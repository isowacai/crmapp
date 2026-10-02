import React, { useState } from 'react';
import { Team } from '../../types';
import { validateRequestFields } from '../../lib/workspace';
import { deliveringTeamIds, ServiceFormData, teamIdsPatch } from '../../lib/catalog';
import RequestFieldsEditor from '../workspace/RequestFieldsEditor';

const inputClass = 'mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500';

// Create or edit a catalog service, including the questions it asks requesters
const ServiceForm = ({
  initialData,
  categories,
  teams,
  editableTeamIds,
  submitLabel = 'Save service',
  onSubmit,
  onCancel
}: {
  initialData: ServiceFormData;
  categories: string[];
  teams: Team[];
  editableTeamIds: string[]; // the delivering teams this user may add or remove (managers: only their own)
  submitLabel?: string;
  onSubmit: (data: ServiceFormData) => void | Promise<void>;
  onCancel: () => void;
}) => {
  // With a single team (release 1) the service simply belongs to it and the team picker is hidden
  const singleTeam = teams.length === 1 ? teams[0] : undefined;
  const [form, setForm] = useState<ServiceFormData>({
    ...initialData,
    teamIds: deliveringTeamIds(initialData).length || !singleTeam ? deliveringTeamIds(initialData) : [singleTeam.id],
    requestFields: initialData.requestFields ?? []
  });
  const [problems, setProblems] = useState<string[]>([]);
  const set = <K extends keyof ServiceFormData>(key: K, value: ServiceFormData[K]) => setForm(prev => ({ ...prev, [key]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const issues = [
      ...(form.teamIds.length ? [] : ['Choose at least one team to deliver this service.']),
      ...validateRequestFields(form.requestFields ?? [])
    ];
    setProblems(issues);
    if (!issues.length) onSubmit({ ...form, ...teamIdsPatch(form.teamIds), requestFields: (form.requestFields ?? []).map(f => ({ ...f, label: f.label.trim(), options: f.options.filter(Boolean) })) });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">Service name</label>
        <input className={inputClass} value={form.name} onChange={e => set('name', e.target.value)} required />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Category</label>
        <select className={inputClass} value={form.category} onChange={e => set('category', e.target.value)} required>
          <option value="">Select a category</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      {!singleTeam && (
      <fieldset>
        <legend className="block text-sm font-medium text-gray-700">Delivering teams</legend>
        <p className="text-xs text-gray-500">
          Each team delivers this service separately. When there's more than one, requesters choose which team delivers their request.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {[...teams]
            .filter(t => form.teamIds.includes(t.id) || editableTeamIds.includes(t.id))
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(t => {
              const on = form.teamIds.includes(t.id);
              const locked = !editableTeamIds.includes(t.id);
              return (
                <label
                  key={t.id}
                  title={locked ? 'Only that team\'s manager or an admin can change this' : undefined}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm ${on ? 'border-blue-500 bg-blue-50 text-blue-900' : 'border-gray-200 text-gray-700'} ${locked ? 'opacity-70' : 'cursor-pointer'}`}
                >
                  <input
                    type="checkbox"
                    className="rounded"
                    checked={on}
                    disabled={locked}
                    onChange={e => set('teamIds', e.target.checked ? [...form.teamIds, t.id] : form.teamIds.filter(id => id !== t.id))}
                  />
                  {t.name}
                </label>
              );
            })}
        </div>
      </fieldset>
      )}
      <div>
        <label className="block text-sm font-medium text-gray-700">Description</label>
        <textarea className={inputClass} rows={3} value={form.description} onChange={e => set('description', e.target.value)} required />
      </div>
      <div>
        <p className="block text-sm font-medium text-gray-700 mb-2">Questions for requesters</p>
        <RequestFieldsEditor fields={form.requestFields ?? []} onChange={fields => set('requestFields', fields)} />
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={form.active} onChange={e => set('active', e.target.checked)} className="rounded" />
        Available for new requests
      </label>
      {problems.length > 0 && (
        <ul className="p-3 rounded-lg bg-amber-50 text-amber-800 text-sm list-disc pl-6">
          {problems.map(p => <li key={p}>{p}</li>)}
        </ul>
      )}
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
          Cancel
        </button>
        <button type="submit" className="btn-primary">{submitLabel}</button>
      </div>
    </form>
  );
};

export default ServiceForm;
