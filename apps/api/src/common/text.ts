/**
 * Text normalisation shared by triage, fact extraction and symptom matching.
 * Deterministic and dependency-free so safety rules behave identically everywhere.
 */

const ARABIC_DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g; // harakat + tatweel
const ARABIC_INDIC_DIGITS = /[٠-٩۰-۹]/g;

/** Converts Arabic-Indic digits (٠-٩, ۰-۹) to ASCII so numbers are parsed consistently. */
export function toAsciiDigits(text: string): string {
  return text.replace(ARABIC_INDIC_DIGITS, (d) => {
    const code = d.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

/** Lowercase + Arabic orthographic normalisation (alef/yaa/taa-marbuta variants, diacritics). */
export function normalizeText(text: string): string {
  return toAsciiDigits(text)
    .toLowerCase()
    .replace(ARABIC_DIACRITICS, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
