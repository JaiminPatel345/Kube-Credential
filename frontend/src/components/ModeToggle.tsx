type ModeToggleProps = {
  mode: 'simple' | 'raw';
  onModeChange: (mode: 'simple' | 'raw') => void;
  disabled?: boolean;
};

const ModeToggle = ({ mode, onModeChange, disabled = false }: ModeToggleProps) => {
  const isRawMode = mode === 'raw';

  return (
    <button
      type="button"
      onClick={() => onModeChange(isRawMode ? 'simple' : 'raw')}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <div
        className={`relative h-5 w-9 rounded-full transition-colors ${
          isRawMode ? 'bg-brand' : 'bg-slate-300'
        }`}
      >
        <div
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
            isRawMode ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </div>
      <span>Raw JSON</span>
    </button>
  );
};

export default ModeToggle;
