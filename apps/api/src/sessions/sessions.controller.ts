import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { SessionResponseSchema, type SessionResponse } from '@healtrip/shared';
import { z } from 'zod';
import { openApi } from '../common/openapi';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { SessionsRepository } from './sessions.repository';

@ApiTags('sessions')
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsRepository) {}

  @Get(':id')
  @ApiOperation({ summary: 'Conversation history + extracted facts (session memory)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ schema: openApi(SessionResponseSchema) })
  async get(@Param('id', new ZodValidationPipe(z.string().uuid())) id: string): Promise<SessionResponse> {
    const session = await this.sessions.find(id);
    if (!session) throw new NotFoundException({ code: 'NOT_FOUND' });
    const messages = await this.sessions.messages(id, 200);
    return {
      id: session.id,
      locale: session.locale,
      status: session.status,
      createdAt: session.createdAt.toISOString(),
      extractedFacts: session.facts,
      messages: messages.map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.createdAt.toISOString(), payload: m.payload })),
    };
  }
}
