/**
 * Canonical cities in scope (Egypt + Turkey medical-tourism angle) with EN/AR aliases.
 * Used by the fact extractor and by tool handlers to normalise model/user input.
 */
export interface CityInfo {
  code: string;
  nameEn: string;
  nameAr: string;
  country: 'EG' | 'TR';
  aliases: string[];
}

export const CITIES: CityInfo[] = [
  { code: 'Cairo', nameEn: 'Cairo', nameAr: 'القاهرة', country: 'EG', aliases: ['cairo', 'القاهرة', 'القاهره', 'مصر الجديدة', 'nasr city', 'مدينة نصر'] },
  { code: 'Giza', nameEn: 'Giza', nameAr: 'الجيزة', country: 'EG', aliases: ['giza', 'الجيزة', 'الجيزه', '6th of october', 'october', 'اكتوبر', 'أكتوبر', 'sheikh zayed', 'الشيخ زايد'] },
  { code: 'Alexandria', nameEn: 'Alexandria', nameAr: 'الإسكندرية', country: 'EG', aliases: ['alexandria', 'alex', 'الإسكندرية', 'الاسكندرية', 'اسكندرية', 'إسكندرية'] },
  { code: 'Istanbul', nameEn: 'Istanbul', nameAr: 'إسطنبول', country: 'TR', aliases: ['istanbul', 'إسطنبول', 'اسطنبول', 'استانبول'] },
];

export function normalizeCity(input: string | undefined | null): CityInfo | undefined {
  if (!input) return undefined;
  const needle = input.trim().toLowerCase();
  return CITIES.find((c) => c.code.toLowerCase() === needle || c.aliases.includes(needle));
}

/** Finds the first in-scope city mentioned anywhere in free text (EN or AR). */
export function findCityInText(text: string): CityInfo | undefined {
  const lower = text.toLowerCase();
  let best: { city: CityInfo; idx: number } | undefined;
  for (const city of CITIES) {
    for (const alias of city.aliases) {
      const idx = lower.indexOf(alias);
      if (idx >= 0 && (!best || idx < best.idx)) best = { city, idx };
    }
  }
  return best?.city;
}

export const EMERGENCY_NUMBERS: Record<'EG' | 'TR' | 'DEFAULT', { labelEn: string; labelAr: string; number: string }[]> = {
  EG: [
    { labelEn: 'Egypt ambulance', labelAr: 'الإسعاف في مصر', number: '123' },
    { labelEn: 'International emergency', labelAr: 'رقم الطوارئ الدولي', number: '112' },
  ],
  TR: [{ labelEn: 'Türkiye emergency', labelAr: 'الطوارئ في تركيا', number: '112' }],
  DEFAULT: [
    { labelEn: 'Egypt ambulance', labelAr: 'الإسعاف في مصر', number: '123' },
    { labelEn: 'International emergency', labelAr: 'رقم الطوارئ الدولي', number: '112' },
  ],
};
