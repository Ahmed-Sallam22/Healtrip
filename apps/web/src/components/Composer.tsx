import { useLayoutEffect, useRef } from 'react';
import { MAX_MESSAGE_CHARS } from '@healtrip/shared';
import { format } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n-context';
import { SendIcon } from './icons';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  busy: boolean;
  ref?: React.Ref<HTMLTextAreaElement>;
}

const MAX_HEIGHT_PX = 200;

export function Composer({ value, onChange, onSubmit, disabled, busy, ref }: Props) {
  const { t } = useI18n();
  const localRef = useRef<HTMLTextAreaElement | null>(null);
  const length = value.trim().length;
  const tooLong = value.length > MAX_MESSAGE_CHARS;
  const canSend = !disabled && length > 0 && !tooLong;
  // Only surface the counter once it becomes relevant.
  const showCounter = value.length > MAX_MESSAGE_CHARS * 0.8;

  // Grow with the content up to a cap, then scroll.
  useLayoutEffect(() => {
    const el = localRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [value]);

  const setRefs = (el: HTMLTextAreaElement | null) => {
    localRef.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) onSubmit();
      }}
    >
      <div
        className={`flex items-end gap-2 rounded-3xl border bg-white p-2 shadow-lg shadow-slate-900/5 transition focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-100 ${
          tooLong ? 'border-red-300' : 'border-slate-200'
        }`}
      >
        <label htmlFor="composer" className="sr-only">
          {t.composer.label}
        </label>
        <textarea
          id="composer"
          ref={setRefs}
          value={value}
          rows={1}
          disabled={disabled}
          placeholder={t.composer.placeholder}
          aria-describedby="composer-hint"
          aria-invalid={tooLong}
          dir="auto"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter inserts a newline; ignore Enter while an IME is composing.
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (canSend) onSubmit();
            }
          }}
          className="block max-h-[200px] min-h-[44px] flex-1 resize-none bg-transparent px-3 py-2.5 text-start leading-6 placeholder:text-slate-400 focus:outline-none disabled:cursor-not-allowed disabled:text-slate-400"
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label={busy ? t.composer.sending : t.composer.send}
          title={busy ? t.composer.sending : t.composer.send}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xl text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
        >
          {busy ? (
            <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          ) : (
            <SendIcon />
          )}
        </button>
      </div>
      <p id="composer-hint" className="mt-1.5 flex justify-between gap-3 px-3 text-[11px] text-slate-400">
        <span className="hidden sm:inline">{t.composer.hint}</span>
        {showCounter && (
          <span className={`ms-auto tabular-nums ${tooLong ? 'font-medium text-red-600' : ''}`}>
            {format(t.composer.counter, { count: value.length, max: MAX_MESSAGE_CHARS })}
            {tooLong && <span className="ms-2">{t.composer.tooLong}</span>}
          </span>
        )}
      </p>
    </form>
  );
}
