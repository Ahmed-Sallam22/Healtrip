import { useI18n } from '@/lib/i18n-context';

export function HealthBanner({ status }: { status: 'degraded' | 'error' }) {
  const { t } = useI18n();
  return (
    <div role="status" className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
      {status === 'error' ? t.health.unavailable : t.health.degraded}
    </div>
  );
}
