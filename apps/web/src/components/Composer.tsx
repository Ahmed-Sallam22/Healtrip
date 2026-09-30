import { MAX_MESSAGE_CHARS } from '@healtrip/shared';
import { format } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n-context';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  busy: boolean;
  ref?: React.Ref<HTMLTextAreaElement>;
}

export function Composer({ value, onChange, onSubmit, disabled, busy, ref }: Props) {
  const { t } = useI18n();
  const length = value.trim().length;
  const tooLong = value.length > MAX_MESSAGE_CHARS;
  const canSend = !disabled && length > 0 && !tooLong;

  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) onSubmit();
      }}
    >
      <div className="flex-1">
        <label htmlFor="composer" className="sr-only">
          {t.composer.label}
        </label>
        <textarea
          id="composer"
          ref={ref}
          value={value}
          rows={2}
          disabled={disabled}
          placeholder={t.composer.placeholder}
          aria-describedby="composer-counter"
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
          className="block w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-start focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100"
        />
        <p
          id="composer-counter"
          className={`mt-1 text-xs tabular-nums ${tooLong ? 'text-red-700' : 'text-slate-500'}`}
        >
          {format(t.composer.counter, { count: value.length, max: MAX_MESSAGE_CHARS })}
          {tooLong && <span className="ms-2">{t.composer.tooLong}</span>}
        </p>
      </div>
      <button
        type="submit"
        disabled={!canSend}
        className="mb-6 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {busy ? t.composer.sending : t.composer.send}
      </button>
    </form>
  );
}
