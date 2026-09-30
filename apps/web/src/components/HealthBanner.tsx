import { getDictionary } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n-context';

/** Shown in both languages: it may appear before the user has picked one. */
export function HealthBanner({ status }: { status: 'degraded' | 'error' }) {
  const { locale } = useI18n();
  const key = status === 'error' ? 'unavailable' : 'degraded';
  const order = locale === 'ar' ? (['ar', 'en'] as const) : (['en', 'ar'] as const);
  return (
    <div role="status" className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
      <div className="mx-auto max-w-3xl space-y-0.5">
        {order.map((l) => (
          <p key={l} lang={l} dir={l === 'ar' ? 'rtl' : 'ltr'} className={l === 'ar' ? 'font-arabic' : 'font-sans'}>
            {getDictionary(l).health[key]}
          </p>
        ))}
      </div>
    </div>
  );
}
