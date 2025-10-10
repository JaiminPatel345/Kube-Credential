import { useEffect } from 'react';

interface ErrorToastProps {
  message: string | null;
  onClose: () => void;
  duration?: number;
}

const ErrorToast = ({ message, onClose, duration = 6000 }: ErrorToastProps) => {
  useEffect(() => {
    if (!message) {
      return;
    }

    const timer = window.setTimeout(() => {
      onClose();
    }, duration);

    return () => {
      window.clearTimeout(timer);
    };
  }, [message, onClose, duration]);

  if (!message) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-6 z-50 flex justify-center px-4 md:px-0">
      <div
        role="alert"
        aria-live="assertive"
        className="pointer-events-auto flex w-full max-w-xl items-start gap-3 rounded-2xl border border-red-200 bg-white/95 p-4 shadow-2xl shadow-red-500/20 ring-1 ring-red-100 backdrop-blur"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
          <span className="text-lg font-bold">!</span>
        </div>
        <div className="flex-1 text-sm text-red-700">
          <p className="font-semibold text-red-800">Request failed</p>
          <p className="mt-1 text-red-600">{message}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="ml-2 inline-flex shrink-0 items-center rounded-full border border-transparent bg-red-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-red-600 transition hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
};

export default ErrorToast;
