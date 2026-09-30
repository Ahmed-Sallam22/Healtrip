import type { ChatResponse } from '@healtrip/shared';
import { detectLocale } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n-context';
import { CitationChips } from './CitationChips';
import { ArrowIcon, InfoIcon } from './icons';
import { NextStepBadge } from './NextStepBadge';
import { ProviderCardView } from './ProviderCardView';
import { TracePanel } from './TracePanel';

interface Props {
  content: string;
  response: ChatResponse | null;
  showTrace: boolean;
  onPickQuestion: (question: string) => void;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</h3>;
}

export function AssistantMessage({ content, response, showTrace, onPickQuestion }: Props) {
  const { t } = useI18n();
  if (!response)
    return (
      <p className="whitespace-pre-wrap leading-relaxed" dir="auto" lang={detectLocale(content) ?? undefined}>
        {content}
      </p>
    );

  // Server-written text keeps its own language (a restored turn may differ from the current UI locale).
  const replyLang = detectLocale(response.reply) ?? undefined;
  const sourceTag =
    response.source === 'triage' ? t.source.triage : response.source === 'fallback' ? t.source.fallback : null;

  return (
    <div className="space-y-4">
      {(response.nextStep || sourceTag) && (
        <div className="flex flex-wrap items-center gap-2">
          {response.nextStep && <NextStepBadge nextStep={response.nextStep} />}
          {sourceTag && (
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
              {sourceTag}
            </span>
          )}
        </div>
      )}

      <p className="whitespace-pre-wrap leading-relaxed text-slate-800" dir="auto" lang={replyLang}>
        {response.reply}
      </p>

      {response.reasoning && (
        <div className="rounded-2xl bg-slate-50 px-3.5 py-2.5 text-sm text-slate-600 ring-1 ring-slate-100">
          <span className="font-semibold text-slate-700">{t.messages.why}</span>{' '}
          <span dir="auto" lang={replyLang}>
            {response.reasoning}
          </span>
        </div>
      )}

      {response.clarifyingQuestions.length > 0 && (
        <section aria-label={t.messages.clarifyingTitle} className="space-y-2">
          <div>
            <SectionTitle>{t.messages.clarifyingTitle}</SectionTitle>
            <p className="mt-0.5 text-xs text-slate-400">{t.messages.clarifyingHint}</p>
          </div>
          <ul className="grid gap-2">
            {response.clarifyingQuestions.map((q) => (
              <li key={q}>
                <button
                  type="button"
                  onClick={() => onPickQuestion(q)}
                  className="group flex w-full items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-2.5 text-start text-sm text-blue-950 transition hover:border-blue-300 hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <span className="flex-1" dir="auto" lang={detectLocale(q) ?? undefined}>
                    {q}
                  </span>
                  <ArrowIcon className="shrink-0 text-base text-blue-400 transition group-hover:translate-x-0.5 group-hover:text-blue-600 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {response.providers.length > 0 && (
        <section aria-label={t.messages.providersTitle} className="space-y-2">
          <SectionTitle>{t.messages.providersTitle}</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            {response.providers.map((p) => (
              <ProviderCardView key={`${p.kind}-${p.id}`} card={p} />
            ))}
          </div>
        </section>
      )}

      {response.citations.length > 0 && (
        <section aria-label={t.messages.sourcesTitle} className="space-y-2">
          <SectionTitle>{t.messages.sourcesTitle}</SectionTitle>
          <CitationChips citations={response.citations} />
        </section>
      )}

      <p className="flex items-start gap-1.5 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-400">
        <InfoIcon className="mt-0.5 shrink-0 text-sm" />
        <span dir="auto" lang={detectLocale(response.disclaimer) ?? undefined}>
          {response.disclaimer}
        </span>
      </p>

      {showTrace && <TracePanel trace={response.trace} promptVersion={response.promptVersion} />}
    </div>
  );
}
