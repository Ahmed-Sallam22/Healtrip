import { useEffect, useRef } from 'react';
import type { TraceEntry } from '@healtrip/shared';
import type { UiMessage } from '@/lib/chat';
import { traceLabel } from '@/lib/chat';
import { useI18n } from '@/lib/i18n-context';
import { AssistantMessage } from './AssistantMessage';

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
      <ol className="space-y-4">
        {messages.map((m) => (
          <li key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={
                m.role === 'user'
                  ? 'max-w-[85%] rounded-2xl rounded-ee-sm bg-blue-600 px-4 py-2 text-white'
                  : 'w-full max-w-[95%] rounded-2xl rounded-es-sm border border-slate-200 bg-white px-4 py-3'
              }
            >
              <span className="sr-only">{m.role === 'user' ? t.messages.you : t.messages.assistant}: </span>
              {m.role === 'user' ? (
                <p className="whitespace-pre-wrap" dir="auto">
                  {m.content}
                </p>
              ) : (
                <AssistantMessage
                  content={m.content}
                  response={m.response}
                  showTrace={showTrace}
                  onPickQuestion={onPickQuestion}
                />
              )}
            </div>
          </li>
        ))}
        {pendingTrace && (
          <li className="flex justify-start">
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-600">
              <p className="flex items-center gap-2">
                <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                {t.messages.thinking}
              </p>
              {pendingTrace.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs">
                  {pendingTrace.map((e) => (
                    <li key={`${e.step}-${e.name}`} className={e.ok ? '' : 'text-red-700'}>
                      {e.ok ? '✓' : '✗'} {traceLabel(e, t.trace)}
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
