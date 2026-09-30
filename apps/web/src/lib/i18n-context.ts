import { createContext, useContext } from 'react';
import type { Locale } from '@healtrip/shared';
import { DEFAULT_LOCALE, getDictionary, type Dictionary } from './i18n';

// Kept apart from i18n.ts so server components (layout) can import dictionaries without React context.

export interface I18nValue {
  locale: Locale;
  t: Dictionary;
}

export const I18nContext = createContext<I18nValue>({ locale: DEFAULT_LOCALE, t: getDictionary(DEFAULT_LOCALE) });

export const useI18n = (): I18nValue => useContext(I18nContext);
