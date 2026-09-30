/**
 * PII redaction applied BEFORE text reaches the LLM, the database or the logs.
 * Conservative regexes: better to redact a harmless number than leak a phone number.
 * Ages, budgets, durations and severities (short numbers) are intentionally left intact.
 */
import { toAsciiDigits } from '../common/text';

export interface RedactionResult {
  text: string;
  redactions: { type: PiiType; count: number }[];
}

export type PiiType = 'EMAIL' | 'NATIONAL_ID' | 'CARD' | 'PHONE';

const RULES: { type: PiiType; re: RegExp }[] = [
  { type: 'EMAIL', re: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi },
  // Egyptian national ID: 14 digits starting with century digit 2 or 3.
  { type: 'NATIONAL_ID', re: /\b[23]\d{13}\b/g },
  // Payment-card-like sequences (13–19 digits, optional separators).
  { type: 'CARD', re: /\b(?:\d[ -]?){13,19}\b/g },
  // Phones: +countrycode or local mobile formats (e.g. 010xxxxxxxx), with separators.
  { type: 'PHONE', re: /(?:\+|00)\d{1,3}[\s-]?\(?\d{1,4}\)?(?:[\s-]?\d{2,4}){2,4}|\b01[0125][\s-]?\d{4}[\s-]?\d{4}\b|\b\d{3}[\s-]\d{3,4}[\s-]\d{4}\b/g },
];

export function redactPii(input: string): RedactionResult {
  let text = toAsciiDigits(input);
  const redactions: RedactionResult['redactions'] = [];
  for (const { type, re } of RULES) {
    let count = 0;
    text = text.replace(re, () => {
      count++;
      return `[${type}]`;
    });
    if (count) redactions.push({ type, count });
  }
  return { text, redactions };
}
