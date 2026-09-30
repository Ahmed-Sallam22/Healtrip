import type { Locale } from '@healtrip/shared';
import en from '@/i18n/en.json';
import ar from '@/i18n/ar.json';

export type Dictionary = typeof en;

// Typing `ar` as `Dictionary` makes a missing/renamed key in ar.json a compile error.
const dictionaries: Record<Locale, Dictionary> = { en, ar: ar satisfies Dictionary };

export const DEFAULT_LOCALE: Locale = 'en';
const LOCALE_STORAGE_KEY = 'healtrip.locale';

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}

export const dirFor = (locale: Locale): 'rtl' | 'ltr' => (locale === 'ar' ? 'rtl' : 'ltr');

const ARABIC_LETTER = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;
const LATIN_LETTER = /[A-Za-z]/g;

/** Language of free text by script: whichever of Arabic/Latin letters dominates; null if neither appears. */
export function detectLocale(text: string): Locale | null {
  const arabic = text.match(ARABIC_LETTER)?.length ?? 0;
  const latin = text.match(LATIN_LETTER)?.length ?? 0;
  if (arabic === 0 && latin === 0) return null;
  return arabic >= latin ? 'ar' : 'en';
}

/** BCP-47 tag used for Intl formatting (dates, numbers, language names). */
export const intlLocale = (locale: Locale): string => (locale === 'ar' ? 'ar-EG' : 'en-GB');

/** Replaces `{name}` placeholders: format('Call {number}', { number: '123' }). */
export function format(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match));
}

export function readStoredLocale(): Locale | null {
  try {
    const value = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return value === 'ar' || value === 'en' ? value : null;
  } catch {
    return null;
  }
}

export function storeLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Storage can be unavailable (private mode, quota); the choice just won't persist.
  }
}
