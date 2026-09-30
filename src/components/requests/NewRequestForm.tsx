import React, { useState } from 'react';
import { Impact, Service, Urgency } from '../../types';
import { computePriority, PRIORITY_STYLES } from '../../lib/demand';

export interface NewRequestData {
  serviceId: string;
  title: string;
  description: string;
  businessJustification: string;
  impact: Impact;
  urgency: Urgency;
  neededBy: string;
}

const inputClass =
  'mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500';

const IMPACT_HELP: Record<Impact, string> = {
  high: 'Many people, a whole team, or a critical process is affected',
  medium: 'A few people or a non-critical process is affected',
  low: 'One person, or a nice-to-have improvement'
};

const URGENCY_HELP: Record<Urgency, string> = {
  high: 'Work is blocked or a hard deadline is imminent',
  medium: 'Needed soon; a workaround exists',
  low: 'No time pressure'
};

const NewRequestForm = ({
  services,
  initialServiceId = '',
  onSubmit,
  onCancel
}: {
  services: Service[];
  initialServiceId?: string;
  onSubmit: (data: NewRequestData) => Promise<void>;
  onCancel: () => void;
}) => {
  const [form, setForm] = useState<NewRequestData>({
    serviceId: initialServiceId,
    title: '',
    description: '',
    businessJustification: '',
    impact: 'medium',
    urgency: 'medium',
    neededBy: ''
  });
  const [submitting, setSubmitting] = useState(false);

  const set = <K extends keyof NewRequestData>(key: K, value: NewRequestData[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const service = services.find(s => s.id === form.serviceId);
  const priority = computePriority(form.impact, form.urgency);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit(form);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">Service</label>
        <select className={inputClass} value={form.serviceId} onChange={e => set('serviceId', e.target.value)} required>
          <option value="">Select a service</option>
          {services.map(s => (
            <option key={s.id} value={s.id}>{s.category} · {s.name}</option>
          ))}
        </select>
        {service && (
          <p className="mt-2 text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
            {service.description}
            <span className="block mt-1 text-gray-500">
              Delivered by {service.ownerTeam} · typically ~{service.standardEffortHours}h · {service.slaDays} working day turnaround
            </span>
          </p>
        )}
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Short title</label>
        <input className={inputClass} value={form.title} onChange={e => set('title', e.target.value)} maxLength={120} required />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">What do you need?</label>
        <textarea className={inputClass} rows={4} value={form.description} onChange={e => set('description', e.target.value)} required />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Why is it needed? (business justification)</label>
        <textarea
          className={inputClass}
          rows={2}
          value={form.businessJustification}
          onChange={e => set('businessJustification', e.target.value)}
          required
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Impact</label>
          <select className={inputClass} value={form.impact} onChange={e => set('impact', e.target.value as Impact)}>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <p className="mt-1 text-xs text-gray-500">{IMPACT_HELP[form.impact]}</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Urgency</label>
          <select className={inputClass} value={form.urgency} onChange={e => set('urgency', e.target.value as Urgency)}>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <p className="mt-1 text-xs text-gray-500">{URGENCY_HELP[form.urgency]}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700">Needed by (optional)</label>
          <input type="date" className={inputClass} value={form.neededBy} onChange={e => set('neededBy', e.target.value)} />
        </div>
        <div className="text-sm text-gray-600 pb-2">
          Calculated priority:{' '}
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${PRIORITY_STYLES[priority].badge}`}>
            {PRIORITY_STYLES[priority].label}
          </span>
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
          Cancel
        </button>
        <button type="submit" className="btn-primary disabled:opacity-60" disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit request'}
        </button>
      </div>
    </form>
  );
};

export default NewRequestForm;
