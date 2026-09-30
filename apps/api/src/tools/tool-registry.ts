import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ToolResult } from '@healtrip/shared';
import type { LlmToolSpec } from '../agent/llm/llm.types';
import { fail, type ToolContext, type ToolDefinition, type ToolOutput } from './tool.types';

export interface ToolExecution {
  name: string;
  args: unknown;
  output: ToolOutput;
  durationMs: number;
}

/**
 * Typed tool registry. Single place where model-produced arguments cross into server code:
 * unknown tool → UNKNOWN_TOOL, bad args → INVALID_ARGS (with Zod issues so the model can fix them),
 * handler exceptions → INTERNAL_ERROR. Nothing here ever throws back into the agent loop.
 */
export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  constructor(definitions: ToolDefinition[]) {
    for (const d of definitions) this.tools.set(d.name, d);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  isTerminal(name: string): boolean {
    return this.tools.get(name)?.terminal ?? false;
  }

  /** Provider-neutral tool specs (JSON Schema generated from the same Zod schemas used to validate). */
  specs(filter: (d: ToolDefinition) => boolean = () => true): LlmToolSpec[] {
    return [...this.tools.values()].filter(filter).map((d) => ({
      name: d.name,
      description: d.description,
      parameters: toJsonSchema(d),
    }));
  }

  async execute(name: string, rawArgs: unknown, ctx: ToolContext): Promise<ToolExecution> {
    const started = Date.now();
    const done = (output: ToolOutput, args: unknown = rawArgs): ToolExecution => ({
      name,
      args,
      output,
      durationMs: Date.now() - started,
    });

    const def = this.tools.get(name);
    if (!def || !def.handler) return done(fail('UNKNOWN_TOOL', `Unknown or non-executable tool "${name}".`));

    const parsed = def.schema.safeParse(rawArgs ?? {});
    if (!parsed.success) {
      return done(
        fail('INVALID_ARGS', 'Arguments do not match the tool schema.', parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))),
      );
    }
    try {
      return done(await def.handler(parsed.data, ctx), parsed.data);
    } catch (err) {
      return done(fail('INTERNAL_ERROR', `Tool failed: ${(err as Error).message ?? 'unknown error'}`), parsed.data);
    }
  }
}

const schemaCache = new WeakMap<ToolDefinition, Record<string, unknown>>();
function toJsonSchema(def: ToolDefinition): Record<string, unknown> {
  let schema = schemaCache.get(def);
  if (!schema) {
    const { $schema: _ignored, ...rest } = zodToJsonSchema(def.schema, { target: 'jsonSchema7', $refStrategy: 'none' }) as Record<string, unknown>;
    schema = rest;
    schemaCache.set(def, schema);
  }
  return schema;
}

/** Compact, PII-free summary of a tool result for the audit log and the UI trace. */
export function summarizeResult(result: ToolResult<unknown>): Record<string, unknown> {
  if (!result.ok) return { ok: false, code: result.error.code, message: result.error.message };
  const data = result.data as Record<string, unknown>;
  const summary: Record<string, unknown> = { ok: true };
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      summary[`${key}Count`] = value.length;
      const ids = value
        .map((v) => (v && typeof v === 'object' ? ((v as Record<string, unknown>).id ?? (v as Record<string, unknown>).chunkId ?? (v as Record<string, unknown>).specialtyCode ?? (v as Record<string, unknown>).slotId) : undefined))
        .filter(Boolean);
      if (ids.length) summary[`${key}Ids`] = ids.slice(0, 10);
    } else if (typeof value === 'string' || typeof value === 'number') {
      summary[key] = value;
    }
  }
  return summary;
}
