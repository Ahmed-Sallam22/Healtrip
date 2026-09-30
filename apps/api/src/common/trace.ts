import type { TraceEntry } from '@healtrip/shared';

/** Collects the agent trace for one request and streams each entry to an optional listener (SSE). */
export class TraceRecorder {
  readonly entries: TraceEntry[] = [];

  constructor(private readonly listener?: (entry: TraceEntry) => void) {}

  add(entry: Omit<TraceEntry, 'step'>): TraceEntry {
    const full: TraceEntry = { step: this.entries.length + 1, ...entry };
    this.entries.push(full);
    try {
      this.listener?.(full);
    } catch {
      // a broken SSE listener must never break the agent
    }
    return full;
  }

  /** Times an async operation and records it. */
  async time<T>(
    type: TraceEntry['type'],
    name: string,
    fn: () => Promise<T>,
    describe: (result: T) => Partial<Pick<TraceEntry, 'ok' | 'args' | 'summary' | 'error'>> = () => ({}),
  ): Promise<T> {
    const started = Date.now();
    try {
      const result = await fn();
      this.add({ type, name, ok: true, durationMs: Date.now() - started, ...describe(result) });
      return result;
    } catch (err) {
      this.add({ type, name, ok: false, durationMs: Date.now() - started, error: (err as Error).message });
      throw err;
    }
  }
}
