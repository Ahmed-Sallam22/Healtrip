import { Injectable } from '@nestjs/common';
import { MAX_MESSAGE_CHARS } from '@healtrip/shared';
import { redactPii, type RedactionResult } from './pii';
import { scanForInjection, type InjectionScan } from './injection';

export interface GuardedInput {
  /** Redacted text — the only version of the message that is stored, logged or sent to the LLM. */
  text: string;
  redactions: RedactionResult['redactions'];
  injection: InjectionScan;
  truncated: boolean;
}

@Injectable()
export class GuardrailsService {
  inspect(raw: string): GuardedInput {
    // Strip control characters (except newlines/tabs) and trim to the hard limit.
    // eslint-disable-next-line no-control-regex
    const cleaned = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
    const truncated = cleaned.length > MAX_MESSAGE_CHARS;
    const limited = truncated ? cleaned.slice(0, MAX_MESSAGE_CHARS) : cleaned;
    const { text, redactions } = redactPii(limited);
    return { text, redactions, injection: scanForInjection(text), truncated };
  }
}
