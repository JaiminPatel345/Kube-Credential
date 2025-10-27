import { useEffect } from 'react';

type ConfirmDialogProps = {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'warning' | 'danger' | 'info';
};

const ConfirmDialog = ({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'warning'
}: ConfirmDialogProps) => {
  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const variantStyles = {
    warning: {
      icon: '⚠️',
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      text: 'text-amber-900',
      button: 'bg-amber-600 hover:bg-amber-700'
    },
    danger: {
      icon: '❌',
      bg: 'bg-red-50',
      border: 'border-red-200',
      text: 'text-red-900',
      button: 'bg-red-600 hover:bg-red-700'
    },
    info: {
      icon: 'ℹ️',
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      text: 'text-blue-900',
      button: 'bg-blue-600 hover:bg-blue-700'
    }
  };

  const styles = variantStyles[variant];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onCancel}
      />
      
      {/* Dialog */}
      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="bg-white rounded-2xl shadow-2xl ring-1 ring-slate-200">
          {/* Header */}
          <div className={`flex items-center gap-3 px-6 py-4 border-b ${styles.border} ${styles.bg} rounded-t-2xl`}>
            <span className="text-2xl">{styles.icon}</span>
            <h2 className={`text-lg font-semibold ${styles.text}`}>{title}</h2>
          </div>
          
          {/* Content */}
          <div className="px-6 py-4">
            <p className="text-sm text-slate-700 whitespace-pre-line">{message}</p>
          </div>
          
          {/* Actions */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 rounded-b-2xl border-t border-slate-200">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2"
            >
              {cancelText}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className={`px-4 py-2 text-sm font-semibold text-white rounded-lg shadow-sm ${styles.button} focus:outline-none focus:ring-2 focus:ring-offset-2`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
