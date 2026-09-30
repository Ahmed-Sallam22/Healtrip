import type { ChatResponse } from '@healtrip/shared';
import { useI18n } from '@/lib/i18n-context';
import { CitationChips } from './CitationChips';
import { NextStepBadge } from './NextStepBadge';
import { ProviderCardView } from './ProviderCardView';
import { TracePanel } from './TracePanel';

interface Props {
  content: string;
  response: ChatResponse | null;
  showTrace: boolean;
  onPickQuestion: (question: string) => void;
}

export function AssistantMessage({ content, response, showTrace, onPickQuestion }: Props) {
  const { t } = useI18n();
  if (!response)
    return (
      <p className="whitespace-pre-wrap" dir="auto">
        {content}
      </p>
    );

  const sourceTag =
    response.source === 'triage' ? t.source.triage : response.source === 'fallback' ? t.source.fallback : null;

  return (
    <div className="space-y-3">
      {(response.nextStep || sourceTag) && (
        <div className="flex flex-wrap items-center gap-2">
          {response.nextStep && <NextStepBadge nextStep={response.nextStep} />}
          {sourceTag && (
            <span className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-600">{sourceTag}</span>
          )}
        </div>
      )}

      <p className="whitespace-pre-wrap" dir="auto">
        {response.reply}
      </p>

      {response.reasoning && (
        <p className="text-sm text-slate-500">
          <span className="font-medium">{t.messages.why}</span> {response.reasoning}
        </p>
      )}

      {response.clarifyingQuestions.length > 0 && (
        <section aria-label={t.messages.clarifyingTitle}>
          <p className="text-sm font-medium">{t.messages.clarifyingTitle}</p>
          <p className="text-xs text-slate-500">{t.messages.clarifyingHint}</p>
          <ul className="mt-1.5 flex flex-wrap gap-2">
            {response.clarifyingQuestions.map((q) => (
              <li key={q}>
                <button
                  type="button"
                  onClick={() => onPickQuestion(q)}
                  className="rounded-full border border-blue-300 bg-blue-50 px-3 py-1 text-start text-sm text-blue-900 hover:bg-blue-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  {q}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {response.providers.length > 0 && (
        <section aria-label={t.messages.providersTitle}>
          <h3 className="mb-1.5 text-sm font-medium">{t.messages.providersTitle}</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {response.providers.map((p) => (
              <ProviderCardView key={`${p.kind}-${p.id}`} card={p} />
            ))}
          </div>
        </section>
      )}

      {response.citations.length > 0 && (
        <section aria-label={t.messages.sourcesTitle}>
          <CitationChips citations={response.citations} />
        </section>
      )}

      <p className="text-xs text-slate-500">{response.disclaimer}</p>

      {showTrace && <TracePanel trace={response.trace} promptVersion={response.promptVersion} />}
    </div>
  );
}
