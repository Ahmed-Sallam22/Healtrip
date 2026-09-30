import { useEffect } from 'react';
import { format } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n-context';

export interface ToastData {
  id: number;
  message: string;
  requestId: string | null;
}

const AUTO_DISMISS_MS = 7000;

export function Toast({ toast, onDismiss }: { toast: ToastData; onDismiss: () => void }) {
  const { t } = useI18n();

  useEffect(() => {
    const timer = window.setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [toast.id, onDismiss]);

  return (
    <div
      role="alert"
      className="fixed inset-x-4 bottom-28 z-20 mx-auto flex max-w-md animate-fade-up items-start gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-white shadow-xl"
    >
      <div className="flex-1">
        <p className="text-sm">{toast.message}</p>
        {toast.requestId && (
          <p className="mt-1 text-xs text-slate-400">
            {format(t.errors.requestId, { id: toast.requestId })}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="rounded px-2 text-sm text-slate-300 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        {t.errors.dismiss}
      </button>
    </div>
  );
}
