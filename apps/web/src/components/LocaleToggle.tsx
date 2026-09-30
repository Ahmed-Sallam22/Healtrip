import type { Locale } from '@healtrip/shared';
import { useI18n } from '@/lib/i18n-context';
import { GlobeIcon } from './icons';

export function LocaleToggle({ onChange }: { onChange: (locale: Locale) => void }) {
  const { locale, t } = useI18n();
  const next: Locale = locale === 'ar' ? 'en' : 'ar';
  return (
    <button
      type="button"
      onClick={() => onChange(next)}
      aria-label={t.header.switchLocaleLabel}
      lang={next}
      className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
    >
      <GlobeIcon className="text-base text-slate-500" />
      {t.header.switchLocale}
    </button>
  );
}
