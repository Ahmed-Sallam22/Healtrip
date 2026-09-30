import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ToolCallSink } from '../agent/agent.orchestrator';
import { summarizeResult, type ToolExecution } from '../tools/tool-registry';

export interface AgentRunEntry {
  sessionId: string;
  requestId?: string;
  source: 'triage' | 'agent' | 'fallback';
  nextStep: string | null;
  providerIds: string[];
  citations: string[];
  validationErrors: string[];
  llmProvider: string;
  promptVersion: string;
  steps: number;
  latencyMs: number;
}

/**
 * Audit trail: every tool call and every decision. Tool args are model-generated from redacted
 * text, and results are stored as compact summaries (ids/counts), so no raw PII lands here.
 * Audit failures are logged but never break the patient-facing request.
 */
@Injectable()
export class AuditService implements ToolCallSink {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async logToolCall({ sessionId, requestId, execution }: { sessionId: string; requestId?: string; execution: ToolExecution }): Promise<void> {
    const r = execution.output.result;
    try {
      await this.prisma.toolCallLog.create({
        data: {
          sessionId,
          requestId,
          toolName: execution.name,
          args: (execution.args ?? {}) as Prisma.InputJsonValue,
          resultSummary: summarizeResult(r) as Prisma.InputJsonValue,
          durationMs: execution.durationMs,
          error: r.ok ? null : `${r.error.code}: ${r.error.message}`,
        },
      });
    } catch (err) {
      this.logger.warn({ err: String(err), tool: execution.name }, 'failed to write tool audit log');
    }
  }

  async logAgentRun(entry: AgentRunEntry): Promise<void> {
    try {
      await this.prisma.agentRunLog.create({ data: { ...entry, validationErrors: entry.validationErrors as Prisma.InputJsonValue } });
    } catch (err) {
      this.logger.warn({ err: String(err) }, 'failed to write agent run log');
    }
  }
}
