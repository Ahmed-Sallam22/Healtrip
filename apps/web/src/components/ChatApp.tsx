'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EMERGENCY_NUMBERS, type Locale, type TraceEntry } from '@healtrip/shared';
import { ApiError, getHealth, getSession, isAbortError, streamChat } from '@/lib/api';
import {
  latestAssistantResponse,
  localId,
  readStoredSessionId,
  sessionToMessages,
  storeSessionId,
  type UiMessage,
} from '@/lib/chat';
import { DEFAULT_LOCALE, detectLocale, dirFor, getDictionary, readStoredLocale, storeLocale } from '@/lib/i18n';
import { I18nContext } from '@/lib/i18n-context';
import { Composer } from './Composer';
import { EmergencyBanner } from './EmergencyBanner';
import { HealthBanner } from './HealthBanner';
import { LogoIcon, PlusIcon } from './icons';
import { LocaleToggle } from './LocaleToggle';
import { MessageList } from './MessageList';
import { SamplePrompts } from './SamplePrompts';
import { Toast, type ToastData } from './Toast';

type HealthStatus = 'unknown' | 'ok' | 'degraded' | 'error';

export function ChatApp({ showTrace }: { showTrace: boolean }) {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [draft, setDraft] = useState('');
  /** Non-null while a turn is in flight; holds the trace entries streamed so far. */
  const [pendingTrace, setPendingTrace] = useState<TraceEntry[] | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [health, setHealth] = useState<HealthStatus>('unknown');
  const [toast, setToast] = useState<ToastData | null>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inFlight = useRef<AbortController | null>(null);

  const t = getDictionary(locale);
  const i18n = useMemo(() => ({ locale, t }), [locale, t]);
  const sending = pendingTrace !== null;

  const showError = useCallback((err: unknown, activeLocale: Locale) => {
    const dict = getDictionary(activeLocale);
    if (!(err instanceof ApiError) || err.isClientError) {
      setToast({ id: Date.now(), message: dict.errors.network, requestId: null });
      return;
    }
    const message = activeLocale === 'ar' && err.messageAr ? err.messageAr : err.message;
    setToast({ id: Date.now(), message, requestId: err.requestId || null });
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);

  const changeLocale = useCallback((next: Locale) => {
    setLocale(next);
    storeLocale(next);
  }, []);

  // Keep <html lang/dir> in sync so the whole document (fonts, logical CSS, bidi) flips.
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dirFor(locale);
    document.title = t.meta.title;
  }, [locale, t]);

  // On load: restore locale + previous session, and check API health.
  useEffect(() => {
    const storedLocale = readStoredLocale();
    if (storedLocale) setLocale(storedLocale);

    const controller = new AbortController();
    getHealth(controller.signal).then((status) => {
      if (!controller.signal.aborted) setHealth(status);
    });

    const storedSession = readStoredSessionId();
    if (storedSession) {
      setRestoring(true);
      getSession(storedSession, controller.signal)
        .then((session) => {
          setSessionId(session.id);
          setMessages(sessionToMessages(session));
          // Reopen the conversation in the language it was held in, so restored turns don't mix AR/EN.
          const lastUser = [...session.messages].reverse().find((m) => m.role === 'user');
          const sessionLocale = lastUser ? detectLocale(lastUser.content) : null;
          if (sessionLocale) changeLocale(sessionLocale);
        })
        .catch((err: unknown) => {
          if (isAbortError(err)) return;
          storeSessionId(null);
          // A 404 just means the session expired/was purged; anything else deserves a toast.
          if (!(err instanceof ApiError && err.status === 404)) showError(err, storedLocale ?? DEFAULT_LOCALE);
        })
        .finally(() => {
          if (!controller.signal.aborted) setRestoring(false);
        });
    }
    return () => controller.abort();
  }, [showError, changeLocale]);

  const send = useCallback(
    async (rawText: string, explicitLocale?: Locale) => {
      const text = rawText.trim();
      if (!text || inFlight.current) return;

      // Reply in the language the user actually wrote in, and flip the UI to match so AR/EN never mix.
      const turnLocale = explicitLocale ?? detectLocale(text) ?? locale;

      if (turnLocale !== locale) changeLocale(turnLocale);
      const controller = new AbortController();
      inFlight.current = controller;
      setMessages((prev) => [...prev, { id: localId('user'), role: 'user', content: text }]);
      setDraft('');
      setPendingTrace([]);

      try {
        const response = await streamChat(
          { message: text, locale: turnLocale, ...(sessionId ? { sessionId } : {}) },
          (entry) => setPendingTrace((prev) => (prev ? [...prev, entry] : prev)),
          controller.signal,
        );
        setSessionId(response.sessionId);
        storeSessionId(response.sessionId);
        setMessages((prev) => [
          ...prev,
          { id: response.messageId, role: 'assistant', content: response.reply, response },
        ]);
      } catch (err) {
        if (isAbortError(err)) return;
        if (err instanceof ApiError && err.code === 'NOT_FOUND' && sessionId) {
          // Server no longer knows this session: start fresh on the next message.
          setSessionId(null);
          storeSessionId(null);
        }
        showError(err, turnLocale);
        setDraft((current) => current || text); // give the user their text back to retry
      } finally {
        if (inFlight.current === controller) {
          inFlight.current = null;
          setPendingTrace(null);
          // Wait for the textarea to be re-enabled before focusing it.
          requestAnimationFrame(() => inputRef.current?.focus());
        }
      }
    },
    [locale, sessionId, changeLocale, showError],
  );

  const newChat = useCallback(() => {
    inFlight.current?.abort();
    inFlight.current = null;
    setPendingTrace(null);
    setMessages([]);
    setSessionId(null);
    storeSessionId(null);
    setDraft('');
    inputRef.current?.focus();
  }, []);

  /** Clarifying chip: prefill the question so the answer is explicitly tied to it; user completes and sends. */
  const pickQuestion = useCallback((question: string) => {
    setDraft(`${question}\n`);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }, []);

  const latest = latestAssistantResponse(messages);
  const isEmergency = latest?.nextStep === 'EMERGENCY_NOW';
  // Safety net: if the server omitted numbers, still show the default emergency lines.
  const emergencyNumbers = latest?.emergency?.numbers.length
    ? latest.emergency.numbers
    : EMERGENCY_NUMBERS.DEFAULT.map((n) => ({ label: locale === 'ar' ? n.labelAr : n.labelEn, number: n.number }));

  return (
    <I18nContext.Provider value={i18n}>
      <div className="flex min-h-screen flex-col">
        <div className="sticky top-0 z-10">
          {isEmergency && <EmergencyBanner numbers={emergencyNumbers} />}
          {(health === 'error' || health === 'degraded') && <HealthBanner status={health} />}
          <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur-md">
            <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 text-2xl text-white shadow-md shadow-blue-600/20">
                  <LogoIcon />
                </span>
                <div className="min-w-0">
                  <h1 className="truncate text-base font-semibold leading-tight">{t.header.title}</h1>
                  <p className="truncate text-xs text-slate-500">{t.header.subtitle}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <LocaleToggle onChange={changeLocale} />
                <button
                  type="button"
                  onClick={newChat}
                  className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                >
                  <PlusIcon className="text-base" />
                  <span className="hidden sm:inline">{t.header.newChat}</span>
                </button>
              </div>
            </div>
          </header>
        </div>

        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
          {restoring && <p className="py-8 text-center text-sm text-slate-500">{t.messages.restoring}</p>}
          {!restoring && messages.length === 0 && !sending && (
            <SamplePrompts onPick={(text) => void send(text, locale)} disabled={sending} />
          )}
          <MessageList
            messages={messages}
            pendingTrace={pendingTrace}
            showTrace={showTrace}
            onPickQuestion={pickQuestion}
          />
        </main>

        <footer className="sticky bottom-0 bg-gradient-to-t from-slate-50 via-slate-50/95 to-transparent pt-4">
          <div className="mx-auto max-w-3xl px-4 pb-3">
            <Composer
              ref={inputRef}
              value={draft}
              onChange={setDraft}
              onSubmit={() => void send(draft)}
              disabled={sending || restoring}
              busy={sending}
            />
            <p className="mt-2 text-center text-[11px] text-slate-400">{t.header.prototypeNote}</p>
          </div>
        </footer>

        {toast && <Toast key={toast.id} toast={toast} onDismiss={dismissToast} />}
      </div>
    </I18nContext.Provider>
  );
}
