import { useState } from 'react';

type KeyValuePair = {
  id: string;
  key: string;
  value: string;
};

type KeyValueEditorProps = {
  initialPairs?: Record<string, string>;
  onChange: (pairs: Record<string, string>) => void;
  disabled?: boolean;
};

const generateId = () => `kvp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const KeyValueEditor = ({ initialPairs = {}, onChange, disabled = false }: KeyValueEditorProps) => {
  const [pairs, setPairs] = useState<KeyValuePair[]>(() => {
    const entries = Object.entries(initialPairs);
    if (entries.length === 0) {
      // Start with 1 empty pair by default
      return [
        { id: generateId(), key: '', value: '' },
      ];
    }
    return entries.map(([key, value]) => ({
      id: generateId(),
      key,
      value: String(value),
    }));
  });

  // We don't need useEffect that reacts to initialPairs changes
  // The component manages its own state, and initialPairs is only used for initial setup
  // If external updates are needed (like file parse), use a key prop to remount the component

  const notifyChange = (updatedPairs: KeyValuePair[]) => {
    const record: Record<string, string> = {};
    updatedPairs.forEach((pair) => {
      if (pair.key.trim()) {
        record[pair.key.trim()] = pair.value;
      }
    });
    onChange(record);
  };

  const handleKeyChange = (id: string, newKey: string) => {
    const updated = pairs.map((pair) =>
      pair.id === id ? { ...pair, key: newKey } : pair
    );
    setPairs(updated);
    notifyChange(updated);
  };

  const handleValueChange = (id: string, newValue: string) => {
    const updated = pairs.map((pair) =>
      pair.id === id ? { ...pair, value: newValue } : pair
    );
    setPairs(updated);
    notifyChange(updated);
  };

  const handleAddPair = () => {
    const updated = [...pairs, { id: generateId(), key: '', value: '' }];
    setPairs(updated);
    notifyChange(updated);
  };

  const handleRemovePair = (id: string) => {
    if (pairs.length <= 1) {
      return; // Minimum 1 pair required
    }
    const updated = pairs.filter((pair) => pair.id !== id);
    setPairs(updated);
    notifyChange(updated);
  };

  return (
    <div className="space-y-3">
      {pairs.map((pair) => (
        <div key={pair.id} className="flex flex-col gap-2 sm:flex-row">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Key"
              value={pair.key}
              onChange={(e) => handleKeyChange(pair.id, e.target.value)}
              disabled={disabled}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/40 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>
          <div className="flex flex-1 gap-2">
            <input
              type="text"
              placeholder="Value"
              value={pair.value}
              onChange={(e) => handleValueChange(pair.id, e.target.value)}
              disabled={disabled}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/40 disabled:cursor-not-allowed disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => handleRemovePair(pair.id)}
              disabled={disabled || pairs.length <= 1}
              className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-600 shadow-sm transition hover:border-rose-300 hover:bg-rose-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
              title={pairs.length <= 1 ? 'At least one field is required' : 'Remove field'}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      ))}
      
      <button
        type="button"
        onClick={handleAddPair}
        disabled={disabled}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-brand hover:bg-brand/5 hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-60"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Add Field
      </button>
    </div>
  );
};

export default KeyValueEditor;
