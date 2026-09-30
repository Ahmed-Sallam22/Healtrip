import type { NextStep } from '@healtrip/shared';
import { useI18n } from '@/lib/i18n-context';

const STYLES: Record<NextStep, { chip: string; dot: string }> = {
  EMERGENCY_NOW: { chip: 'bg-red-50 text-red-700 ring-red-200', dot: 'bg-red-500 animate-pulse' },
  URGENT_CARE_24H: { chip: 'bg-orange-50 text-orange-700 ring-orange-200', dot: 'bg-orange-500' },
  BOOK_SPECIALIST: { chip: 'bg-blue-50 text-blue-700 ring-blue-200', dot: 'bg-blue-500' },
  SECOND_OPINION: { chip: 'bg-indigo-50 text-indigo-700 ring-indigo-200', dot: 'bg-indigo-500' },
  GENERAL_PRACTITIONER: { chip: 'bg-teal-50 text-teal-700 ring-teal-200', dot: 'bg-teal-500' },
  SELF_CARE_MONITOR: { chip: 'bg-slate-100 text-slate-700 ring-slate-200', dot: 'bg-slate-500' },
};

export function NextStepBadge({ nextStep }: { nextStep: NextStep }) {
  const { t } = useI18n();
  const style = STYLES[nextStep];
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ring-1 ${style.chip}`}>
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${style.dot}`} />
      {t.nextStep[nextStep]}
    </span>
  );
}
