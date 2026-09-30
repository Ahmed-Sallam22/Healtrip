import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { type ChatRequest, ChatRequestSchema, type ChatResponse, ChatResponseSchema, type ChatStreamEvent } from '@healtrip/shared';
import type { Request, Response } from 'express';
import { toApiError } from '../common/all-exceptions.filter';
import { openApi } from '../common/openapi';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ChatService } from './chat.service';

const chatThrottle = { default: { limit: Number(process.env.RATE_LIMIT_PER_MIN ?? 20), ttl: 60_000 } };

@ApiTags('chat')
@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Post()
  @HttpCode(200)
  @Throttle(chatThrottle)
  @ApiOperation({ summary: 'Send a patient message; returns the assistant turn (reply, next step, DB-backed provider cards, citations, trace)' })
  @ApiBody({ schema: openApi(ChatRequestSchema) })
  @ApiOkResponse({ schema: openApi(ChatResponseSchema) })
  async send(@Body(new ZodValidationPipe(ChatRequestSchema)) body: ChatRequest, @Req() req: Request): Promise<ChatResponse> {
    return this.chat.handle(body, { requestId: String(req.id) });
  }

  @Post('stream')
  @Throttle(chatThrottle)
  @ApiOperation({ summary: 'Same as POST /chat but streams agent trace steps as Server-Sent Events, then a final event' })
  @ApiBody({ schema: openApi(ChatRequestSchema) })
  @ApiProduces('text/event-stream')
  async stream(@Body(new ZodValidationPipe(ChatRequestSchema)) body: ChatRequest, @Req() req: Request, @Res() res: Response): Promise<void> {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = (event: ChatStreamEvent) => {
      if (!res.writableEnded) res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    };
    try {
      const response = await this.chat.handle(body, { requestId: String(req.id), onTrace: (entry) => send({ type: 'trace', entry }) });
      send({ type: 'final', response });
    } catch (err) {
      send({ type: 'error', error: toApiError(err, String(req.id)).body });
    } finally {
      res.end();
    }
  }
}
