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
          <details className="group rounded-2xl border border-slate-200 bg-slate-50 text-xs open:bg-white">
            <summary
              className="flex cursor-pointer list-none items-center gap-1.5 px-2.5 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              title={c.snippet}
            >
              <span
                aria-hidden="true"
                className="inline-flex h-4 min-w-4 items-center justify-center rounded bg-slate-200 px-1 text-[10px] font-bold text-slate-700"
              >
                {ICONS[c.sourceType]}
              </span>
              <span className="text-slate-500">{t.citation[c.sourceType]}</span>
              <span>
                {t.citation.source} {c.title}
              </span>
            </summary>
            <blockquote className="border-t border-slate-200 px-3 py-2 text-slate-700">{c.snippet}</blockquote>
          </details>
        </li>
      ))}
    </ul>
  );
}
