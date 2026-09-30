import type { ChatResponse } from '@healtrip/shared';
import { format } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n-context';

type Numbers = NonNullable<ChatResponse['emergency']>['numbers'];

export function EmergencyBanner({ numbers }: { numbers: Numbers }) {
  const { t } = useI18n();
  return (
    <div role="alert" className="bg-red-700 px-4 py-3 text-white">
      <div className="mx-auto max-w-3xl">
        <p className="font-semibold">{t.emergency.title}</p>
        <ul className="mt-2 flex flex-wrap gap-3">
          {numbers.map((n) => (
            <li key={`${n.label}-${n.number}`}>
              <a
                href={`tel:${n.number}`}
                className="inline-flex flex-col rounded-lg bg-white px-4 py-2 text-red-700 hover:bg-red-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-red-300"
              >
                <span className="text-2xl font-bold">
                  {format(t.emergency.call, { number: n.number })}
                </span>
                <span className="text-xs">{n.label}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
