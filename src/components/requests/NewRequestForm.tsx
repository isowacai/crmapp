import React, { useState } from 'react';
import { RequestField, Service } from '../../types';

export interface NewRequestData {
  serviceId: string;
  lineOfBusiness: string; // the app routes the request to the team serving this LOB
  title: string;
  description: string;
  businessJustification: string;
  neededBy: string;
  answers: Record<string, string>; // replies to the service's questions, by question ID
}

// One of the service's own questions
const QuestionInput = ({ field, value, onChange }: { field: RequestField; value: string; onChange: (v: string) => void }) => {
  const common = { className: inputClass, value, required: field.required, onChange: (e: { target: { value: string } }) => onChange(e.target.value) };
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">
        {field.label}
        {!field.required && <span className="font-normal text-gray-400"> (optional)</span>}
      </label>
      {field.type === 'textarea' ? (
        <textarea rows={3} {...common} />
      ) : field.type === 'select' ? (
        <select {...common}>
          <option value="">Select…</option>
          {field.options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'} step="any" {...common} />
      )}
      {field.help && <p className="mt-1 text-xs text-gray-500">{field.help}</p>}
    </div>
  );
};

const inputClass =
  'mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500';

const NewRequestForm = ({
  services,
  linesOfBusiness,
  initialServiceId = '',
  onSubmit,
  onCancel
}: {
  services: Service[];
  linesOfBusiness: string[]; // empty when no team has set any up; then the question is skipped
  initialServiceId?: string;
  onSubmit: (data: NewRequestData) => Promise<void>;
  onCancel: () => void;
}) => {
  const [form, setForm] = useState<NewRequestData>({
    serviceId: initialServiceId,
    lineOfBusiness: linesOfBusiness.length === 1 ? linesOfBusiness[0] : '',
    title: '',
    description: '',
    businessJustification: '',
    neededBy: '',
    answers: {}
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
        {service && <p className="mt-2 text-sm text-gray-600 bg-gray-50 rounded-lg p-3">{service.description}</p>}
      </div>
      {linesOfBusiness.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700">Line of business</label>
          <select className={inputClass} value={form.lineOfBusiness} onChange={e => set('lineOfBusiness', e.target.value)} required>
            <option value="">Select a line of business</option>
            {linesOfBusiness.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
      )}
      <div>
        <label className="block text-sm font-medium text-gray-700">Short title</label>
        <input className={inputClass} value={form.title} onChange={e => set('title', e.target.value)} maxLength={120} required />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">What do you need?</label>
        <textarea className={inputClass} rows={4} value={form.description} onChange={e => set('description', e.target.value)} required />
      </div>
      {(service?.requestFields ?? []).map(f => (
        <QuestionInput
          key={f.id}
          field={f}
          value={form.answers[f.id] ?? ''}
          onChange={v => setForm(prev => ({ ...prev, answers: { ...prev.answers, [f.id]: v } }))}
        />
      ))}
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
