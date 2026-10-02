import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { RequestField } from '../../types';
import { FIELD_TYPES, newField } from '../../lib/workspace';

const cellInput = 'block w-full rounded-md border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500';

// Edits the extra questions a service asks when it's requested
const RequestFieldsEditor = ({ fields, onChange }: { fields: RequestField[]; onChange: (fields: RequestField[]) => void }) => {
  const update = (i: number, patch: Partial<RequestField>) => onChange(fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  const move = (i: number, by: number) => {
    const next = [...fields];
    const [item] = next.splice(i, 1);
    next.splice(i + by, 0, item);
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {fields.length === 0 && <p className="text-sm text-gray-500">No extra questions. Requesters give a title, description, and justification.</p>}
      {fields.map((f, i) => (
        <div key={f.id} className="rounded-lg border border-gray-200 p-3 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_10rem_auto] gap-2 items-center">
            <input className={cellInput} value={f.label} onChange={e => update(i, { label: e.target.value })} placeholder="Question, e.g. Which system?" aria-label="Question" />
            <select className={cellInput} value={f.type} onChange={e => update(i, { type: e.target.value as RequestField['type'] })} aria-label="Answer type">
              {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <div className="flex items-center gap-1">
              <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30" aria-label="Move up"><ArrowUp size={14} /></button>
              <button type="button" disabled={i === fields.length - 1} onClick={() => move(i, 1)} className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30" aria-label="Move down"><ArrowDown size={14} /></button>
              <button type="button" onClick={() => onChange(fields.filter((_, idx) => idx !== i))} className="p-1.5 text-gray-400 hover:text-red-600" aria-label="Remove question"><Trash2 size={14} /></button>
            </div>
          </div>
          {f.type === 'select' && (
            <input
              className={cellInput}
              value={f.options.join(', ')}
              onChange={e => update(i, { options: e.target.value.split(',').map(o => o.trim()) })}
              onBlur={() => update(i, { options: f.options.filter(Boolean) })}
              placeholder="Options, separated by commas"
              aria-label="Options"
            />
          )}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-center">
            <input className={cellInput} value={f.help} onChange={e => update(i, { help: e.target.value })} placeholder="Help text (optional)" aria-label="Help text" />
            <label className="flex items-center gap-1.5 text-sm text-gray-700">
              <input type="checkbox" checked={f.required} onChange={e => update(i, { required: e.target.checked })} className="rounded" />
              Required
            </label>
          </div>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...fields, newField(fields)])} className="flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline">
        <Plus size={14} /> Add a question
      </button>
    </div>
  );
};

export default RequestFieldsEditor;
