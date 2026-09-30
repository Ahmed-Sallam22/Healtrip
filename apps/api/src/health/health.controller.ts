import { Controller, Get, Inject, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { LLM_PROVIDER, type LlmProvider } from '../agent/llm/llm.types';
import { PROMPT_VERSION } from '../agent/prompts/system';
import { PrismaService } from '../prisma/prisma.service';
import { RagClient } from '../rag-client/rag.client';
import { TRIAGE_RULES_VERSION } from '../triage/triage.rules';

/**
 * Liveness + dependency health. DB down → 503 "error" (the API cannot work).
 * RAG down → 200 "degraded" (chat still works with SQL tools only).
 */
@ApiTags('health')
@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rag: RagClient,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Health of API, database, RAG service; LLM provider in use' })
  async health(@Res() res: Response) {
    const [db, rag] = await Promise.all([this.check(() => this.prisma.$queryRaw`SELECT 1`), this.check(() => this.rag.health())]);
    const status = db.status !== 'ok' ? 'error' : rag.status !== 'ok' ? 'degraded' : 'ok';
    res.status(status === 'error' ? 503 : 200).json({
      status,
      checks: { db, rag, llm: { status: 'ok', provider: this.llm.name, model: this.llm.model } },
      versions: { prompt: PROMPT_VERSION, triageRules: TRIAGE_RULES_VERSION },
    });
  }

  private async check(fn: () => Promise<unknown>): Promise<{ status: 'ok' | 'error'; latencyMs: number; error?: string }> {
    const started = Date.now();
    try {
      await fn();
      return { status: 'ok', latencyMs: Date.now() - started };
    } catch (err) {
      return { status: 'error', latencyMs: Date.now() - started, error: (err as Error).message.split('\n')[0].slice(0, 160) };
    }
  }
}
