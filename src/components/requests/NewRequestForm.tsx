import React, { useState } from 'react';
import { Service } from '../../types';

export interface NewRequestData {
  serviceId: string;
  title: string;
  description: string;
  businessJustification: string;
  neededBy: string;
}

const inputClass =
  'mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500';

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
    neededBy: ''
  });
  const [submitting, setSubmitting] = useState(false);

  const set = <K extends keyof NewRequestData>(key: K, value: NewRequestData[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const service = services.find(s => s.id === form.serviceId);

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
            <span className="block mt-1 text-gray-500">Delivered by {service.ownerTeam}</span>
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
      <div className="sm:w-1/2">
        <label className="block text-sm font-medium text-gray-700">Needed by (optional)</label>
        <input type="date" className={inputClass} value={form.neededBy} onChange={e => set('neededBy', e.target.value)} />
      </div>
      <p className="text-sm text-gray-500">
        A lead or manager will review your request, set its priority, and assign it to someone.
      </p>
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
