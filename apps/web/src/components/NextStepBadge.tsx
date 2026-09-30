import type { NextStep } from '@healtrip/shared';
import { useI18n } from '@/lib/i18n-context';

const STYLES: Record<NextStep, string> = {
  EMERGENCY_NOW: 'bg-red-600 text-white',
  URGENT_CARE_24H: 'bg-orange-500 text-white',
  BOOK_SPECIALIST: 'bg-blue-600 text-white',
  SECOND_OPINION: 'bg-blue-600 text-white',
  GENERAL_PRACTITIONER: 'bg-teal-600 text-white',
  SELF_CARE_MONITOR: 'bg-slate-500 text-white',
};

export function NextStepBadge({ nextStep }: { nextStep: NextStep }) {
  const { t } = useI18n();
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${STYLES[nextStep]}`}>
      {t.nextStep[nextStep]}
    </span>
  );
}
