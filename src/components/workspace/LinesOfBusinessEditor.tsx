import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';

// The lines of business (LOBs) a team delivers for. New requests are routed to the delivering team
// whose LOBs include the one the requester picks.
const LinesOfBusinessEditor = ({
  value,
  suggestions,
  readOnly,
  onSave
}: {
  value: string[];
  suggestions: string[]; // LOBs other teams already use, so names stay consistent
  readOnly: boolean;
  onSave: (lobs: string[]) => Promise<void>;
}) => {
  const [lobs, setLobs] = useState(value);
  const [entry, setEntry] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => setLobs(value), [value]);

  const add = () => {
    const name = entry.trim();
    if (name && !lobs.some(l => l.toLowerCase() === name.toLowerCase())) setLobs([...lobs, name]);
    setEntry('');
  };
  const changed = JSON.stringify(lobs) !== JSON.stringify(value);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await onSave(lobs);
      setMessage({ tone: 'ok', text: 'Lines of business saved.' });
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not save' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {lobs.length === 0 && <p className="text-sm text-gray-500">No lines of business yet. Add the ones your team takes demand from, e.g. HCM, Productions, Corporate.</p>}
        {lobs.map(l => (
          <span key={l} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-blue-800 text-sm">
            {l}
            {!readOnly && (
              <button onClick={() => setLobs(lobs.filter(x => x !== l))} className="text-blue-500 hover:text-blue-800" aria-label={`Remove ${l}`}>
                <X size={14} />
              </button>
            )}
          </span>
        ))}
      </div>
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            list="lob-suggestions"
            value={entry}
            onChange={e => setEntry(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            placeholder="e.g. HCM, Productions, Corporate"
            className="rounded-lg border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
          />
          <datalist id="lob-suggestions">
            {suggestions.filter(s => !lobs.includes(s)).map(s => <option key={s} value={s} />)}
          </datalist>
          <button onClick={add} disabled={!entry.trim()} className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
            <Plus size={16} /> Add
          </button>
          <button onClick={save} disabled={!changed || saving} className="btn-primary disabled:opacity-50">
            {saving ? 'Saving…' : 'Save lines of business'}
          </button>
        </div>
      )}
      {message && <p className={`text-sm ${message.tone === 'ok' ? 'text-emerald-700' : 'text-red-600'}`}>{message.text}</p>}
    </div>
  );
};

export default LinesOfBusinessEditor;
