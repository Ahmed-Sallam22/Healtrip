import type { Locale } from '@healtrip/shared';
import { useI18n } from '@/lib/i18n-context';

export function LocaleToggle({ onChange }: { onChange: (locale: Locale) => void }) {
  const { locale, t } = useI18n();
  const next: Locale = locale === 'ar' ? 'en' : 'ar';
  return (
    <button
      type="button"
      onClick={() => onChange(next)}
      aria-label={t.header.switchLocaleLabel}
      lang={next}
      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      {t.header.switchLocale}
    </button>
  );
}
