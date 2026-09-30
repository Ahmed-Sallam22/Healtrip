import type { TraceEntry } from '@healtrip/shared';
import { format } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n-context';

function JsonDetails({ label, value }: { label: string; value: unknown }) {
  if (value === undefined) return null;
  return (
    <details>
      <summary className="cursor-pointer text-blue-700">{label}</summary>
      <pre className="mt-1 max-h-64 overflow-auto rounded bg-slate-900 p-2 text-[11px] leading-snug text-slate-100" dir="ltr">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

/** Developer-facing view of what the agent did this turn (tools, validation, fallbacks). */
export function TracePanel({ trace, promptVersion }: { trace: TraceEntry[]; promptVersion: string }) {
  const { t } = useI18n();
  const failures = trace.filter((e) => !e.ok).length;
  return (
    <details className="rounded-2xl border border-slate-200 bg-slate-50/70 text-xs">
      <summary className="cursor-pointer rounded-2xl px-3 py-2 text-slate-500 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
        {t.trace.panelTitle} · {format(t.trace.steps, { count: trace.length })}
        {failures > 0 && (
          <span className="ms-2 rounded bg-red-100 px-1.5 text-red-700">
            {failures} {t.trace.error}
          </span>
        )}
        <span className="ms-2 text-slate-400">
          {t.trace.promptVersion}: <code dir="ltr">{promptVersion}</code>
        </span>
      </summary>
      <div className="overflow-x-auto px-3 pb-3">
        <table className="w-full border-collapse text-start">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th scope="col" className="py-1 pe-2 text-start font-medium">{t.trace.colStep}</th>
              <th scope="col" className="py-1 pe-2 text-start font-medium">{t.trace.colType}</th>
              <th scope="col" className="py-1 pe-2 text-start font-medium">{t.trace.colName}</th>
              <th scope="col" className="py-1 pe-2 text-start font-medium">{t.trace.colStatus}</th>
              <th scope="col" className="py-1 pe-2 text-end font-medium">{t.trace.colDuration}</th>
              <th scope="col" className="py-1 text-start font-medium">{t.trace.colDetails}</th>
            </tr>
          </thead>
          <tbody>
            {trace.map((e) => (
              <tr key={`${e.step}-${e.name}`} className="border-b border-slate-100 align-top last:border-0">
                <td className="py-1 pe-2 tabular-nums">{e.step}</td>
                <td className="py-1 pe-2">{e.type}</td>
                <td className="py-1 pe-2 font-mono" dir="ltr">{e.name}</td>
                <td className="py-1 pe-2">
                  <span className={e.ok ? 'text-emerald-700' : 'font-semibold text-red-700'}>
                    {e.ok ? t.trace.ok : t.trace.error}
                  </span>
                </td>
                <td className="py-1 pe-2 text-end tabular-nums">{Math.round(e.durationMs)}</td>
                <td className="space-y-1 py-1">
                  {e.error && (
                    <p className="font-mono text-red-700" dir="ltr">
                      {e.error}
                    </p>
                  )}
                  <JsonDetails label={t.trace.args} value={e.args} />
                  <JsonDetails label={t.trace.summary} value={e.summary} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
