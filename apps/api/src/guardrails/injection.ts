/**
 * Heuristic prompt-injection detector. It does NOT block the request (false positives would hurt
 * real patients); it flags it so that (1) the agent is reminded the text is untrusted data and
 * (2) the flag shows in the trace/audit log. The real protection is architectural: read-only,
 * parameterised tools and the grounding validator — an injected instruction has nothing to exploit.
 */
import { normalizeText } from '../common/text';

const PATTERNS: { id: string; re: RegExp }[] = [
  { id: 'override_instructions', re: /\b(?:ignore|disregard|forget|override|bypass)\b[^.]{0,30}\b(?:rules?|instructions?|prompt|guidelines|polic(?:y|ies)|restrictions?)\b/ },
  { id: 'role_hijack', re: /\b(?:you are now|act as|pretend (?:to be|you are)|developer mode|jailbreak|dan mode)\b/ },
  { id: 'prompt_exfiltration', re: /\b(?:system prompt|reveal your (?:prompt|instructions)|print your instructions)\b/ },
  { id: 'fabrication_request', re: /\b(?:invent|make up|fabricate|fake|hallucinate)\b[^.]{0,40}\b(?:doctor|hospital|clinic|provider|price|rating|review)s?\b/ },
  { id: 'markup_injection', re: /<\/?(?:system|user_message|assistant|tool)[^>]*>/ },
  { id: 'override_instructions_ar', re: /(?:تجاهل|انس|انسي|تخط)[^.]{0,30}(?:التعليمات|القواعد|الاوامر|التوجيهات)/ },
  { id: 'fabrication_request_ar', re: /(?:اخترع|الف|زيف|اختلق)[^.]{0,30}(?:طبيب|دكتور|مستشفي|مستشفى|سعر|تقييم)/ },
];

export interface InjectionScan {
  flagged: boolean;
  patterns: string[];
}

export function scanForInjection(text: string): InjectionScan {
  const normalized = normalizeText(text);
  const patterns = PATTERNS.filter((p) => p.re.test(normalized)).map((p) => p.id);
  return { flagged: patterns.length > 0, patterns };
}

/**
 * Wraps untrusted user text in delimiters for the model. Any delimiter-like tags inside the
 * user's text are neutralised so the user cannot "close" the envelope.
 */
export function wrapUserContent(text: string): string {
  const neutralised = text.replace(/<\/?\s*(user_message|system|assistant|tool|session_facts|guardrail_notice)[^>]*>/gi, '[tag removed]');
  return `<user_message>\n${neutralised}\n</user_message>`;
}
