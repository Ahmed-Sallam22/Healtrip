import type { Citation, SourceType } from '@healtrip/shared';
import { useI18n } from '@/lib/i18n-context';

const ICONS: Record<SourceType, string> = { doctor_bio: 'Dr', hospital_profile: 'H', patient_guide: 'i' };

/** Each chip is a native <details>: keyboard/screen-reader accessible, snippet expands inline. */
export function CitationChips({ citations }: { citations: Citation[] }) {
  const { t } = useI18n();
  return (
    <ul className="flex flex-wrap gap-2">
      {citations.map((c) => (
        <li key={c.chunkId} className="max-w-full">
          <details className="group rounded-2xl border border-slate-200 bg-white text-xs shadow-sm transition hover:border-slate-300 open:shadow-md">
            <summary
              className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              title={c.snippet}
            >
              <span
                aria-hidden="true"
                className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-blue-50 px-1 text-[10px] font-bold text-blue-700"
              >
                {ICONS[c.sourceType]}
              </span>
              <span className="text-slate-500">{t.citation[c.sourceType]}</span>
              <span className="font-medium text-slate-700" dir="auto">
                {c.title}
              </span>
            </summary>
            <blockquote className="border-t border-slate-100 px-3 py-2 leading-relaxed text-slate-600" dir="auto">
              {c.snippet}
            </blockquote>
          </details>
        </li>
      ))}
    </ul>
  );
}
