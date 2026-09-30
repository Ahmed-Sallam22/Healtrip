import { useEffect, useRef } from 'react';
import type { TraceEntry } from '@healtrip/shared';
import type { UiMessage } from '@/lib/chat';
import { traceLabel } from '@/lib/chat';
import { detectLocale } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n-context';
import { AssistantMessage } from './AssistantMessage';
import { LogoIcon } from './icons';

interface Props {
  messages: UiMessage[];
  /** Trace entries streamed so far for the in-flight turn; null when idle. */
  pendingTrace: TraceEntry[] | null;
  showTrace: boolean;
  onPickQuestion: (question: string) => void;
}

export function MessageList({ messages, pendingTrace, showTrace, onPickQuestion }: Props) {
  const { t } = useI18n();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, pendingTrace?.length]);

  return (
    <div role="log" aria-live="polite" aria-label={t.messages.listLabel} aria-busy={pendingTrace !== null}>
      <ol className="space-y-5">
        {messages.map((m) =>
          m.role === 'user' ? (
            <li key={m.id} className="flex animate-fade-up justify-end">
              <div className="max-w-[85%] rounded-3xl rounded-ee-md bg-gradient-to-br from-blue-600 to-blue-500 px-4 py-2.5 text-white shadow-md shadow-blue-600/15">
                <span className="sr-only">{t.messages.you}: </span>
                <p className="whitespace-pre-wrap" dir="auto" lang={detectLocale(m.content) ?? undefined}>
                  {m.content}
                </p>
              </div>
            </li>
          ) : (
            <li key={m.id} className="flex animate-fade-up items-start gap-3">
              <AssistantAvatar />
              <div className="min-w-0 flex-1 rounded-3xl rounded-ss-md border border-slate-200/80 bg-white px-4 py-4 shadow-sm sm:px-5">
                <span className="sr-only">{t.messages.assistant}: </span>
                <AssistantMessage
                  content={m.content}
                  response={m.response}
                  showTrace={showTrace}
                  onPickQuestion={onPickQuestion}
                />
              </div>
            </li>
          ),
        )}
        {pendingTrace && (
          <li className="flex animate-fade-up items-start gap-3">
            <AssistantAvatar />
            <div className="rounded-3xl rounded-ss-md border border-slate-200/80 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
              <p className="flex items-center gap-2">
                <span aria-hidden="true" className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="h-1.5 w-1.5 animate-dot-bounce rounded-full bg-blue-500"
                      style={{ animationDelay: `${i * 0.16}s` }}
                    />
                  ))}
                </span>
                {t.messages.thinking}
              </p>
              {pendingTrace.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs">
                  {pendingTrace.map((e) => (
                    <li key={`${e.step}-${e.name}`} className={`flex items-center gap-1.5 ${e.ok ? 'text-slate-500' : 'text-red-700'}`}>
                      <span aria-hidden="true" className={e.ok ? 'text-emerald-600' : ''}>{e.ok ? '✓' : '✗'}</span>
                      {traceLabel(e, t.trace)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        )}
      </ol>
      <div ref={endRef} />
    </div>
  );
}

function AssistantAvatar() {
  return (
    <span
      aria-hidden="true"
      className="mt-1 hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-cyan-500 text-base text-white shadow-sm sm:flex"
    >
      <LogoIcon />
    </span>
  );
}
