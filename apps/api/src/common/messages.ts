import type { ApiErrorCode, Locale } from '@healtrip/shared';

type Localized<T> = { en: T; ar: T };
const L = <T>(v: Localized<T>): Localized<T> => v;

/** Server-owned patient-facing text. Safety-critical wording never comes from the model. */
export const MESSAGES = {
  disclaimer: L({
    en: 'HealTrip helps you navigate care; this is not medical advice or a diagnosis. If symptoms are severe or getting worse, call emergency services (123 in Egypt, 112) now.',
    ar: 'تساعدك هيلتريب في الوصول إلى الرعاية المناسبة، وهذه ليست نصيحة طبية ولا تشخيصًا. إذا كانت الأعراض شديدة أو تزداد سوءًا، اتصل بالطوارئ فورًا (123 في مصر، أو 112).',
  }),
  emergency: L({
    en: 'Your symptoms may be a medical emergency. Call emergency services now or go to the nearest emergency department — do not drive yourself and do not wait for an appointment. Nearby 24-hour emergency departments from our network are listed below.',
    ar: 'قد تكون أعراضك حالة طبية طارئة. اتصل بالطوارئ الآن أو توجّه إلى أقرب قسم طوارئ — لا تقد السيارة بنفسك ولا تنتظر موعدًا. أقسام الطوارئ العاملة على مدار 24 ساعة من شبكتنا موضحة أدناه.',
  }),
  emergencySelfHarm: L({
    en: 'You deserve support right now. Please call emergency services or go to the nearest emergency department, and if you can, contact someone you trust to stay with you.',
    ar: 'أنت تستحق الدعم الآن. من فضلك اتصل بالطوارئ أو توجّه إلى أقرب قسم طوارئ، وإن أمكن تواصل مع شخص تثق به ليبقى معك.',
  }),
  emergencyReason: L({
    en: (labels: string[]) => `Safety rules detected warning signs: ${labels.join('; ')}. This decision is made by fixed rules, not by AI.`,
    ar: (labels: string[]) => `رصدت قواعد السلامة علامات تحذيرية: ${labels.join('؛ ')}. هذا القرار صادر عن قواعد ثابتة وليس عن الذكاء الاصطناعي.`,
  }),
  fallback: L({
    en: "I couldn't produce a verified recommendation right now, so I won't guess. If you feel unwell, please call one of the 24-hour hospitals below for advice, or call emergency services if symptoms are severe.",
    ar: 'لم أتمكن من تقديم توصية موثّقة الآن، ولن أخمّن. إذا كنت تشعر بتوعك، اتصل بأحد المستشفيات العاملة على مدار 24 ساعة أدناه للاستشارة، أو اتصل بالطوارئ إذا كانت الأعراض شديدة.',
  }),
  fallbackReason: L({
    en: (reason: string) => `Safe fallback (${reason}): the assistant's answer could not be verified against our database.`,
    ar: (reason: string) => `رد احتياطي آمن (${reason}): تعذّر التحقق من إجابة المساعد مقابل قاعدة بياناتنا.`,
  }),
  hospitalMatch: L({
    en: '24-hour hospital with an emergency department',
    ar: 'مستشفى يعمل على مدار 24 ساعة وبه قسم طوارئ',
  }),
  clarifyLead: L({
    en: 'A couple of quick questions so I can guide you:',
    ar: 'سؤالان سريعان حتى أرشدك بشكل أفضل:',
  }),
};

export const t = <K extends keyof typeof MESSAGES>(key: K, locale: Locale): (typeof MESSAGES)[K]['en'] => MESSAGES[key][locale];

export const ERROR_MESSAGES: Record<ApiErrorCode, { en: string; ar: string }> = {
  VALIDATION_ERROR: { en: 'The request is invalid.', ar: 'الطلب غير صالح.' },
  RATE_LIMITED: { en: 'Too many requests. Please wait a moment and try again.', ar: 'طلبات كثيرة جدًا. انتظر قليلًا ثم حاول مرة أخرى.' },
  NOT_FOUND: { en: 'Not found.', ar: 'غير موجود.' },
  LLM_UNAVAILABLE: { en: 'The assistant is temporarily unavailable.', ar: 'المساعد غير متاح مؤقتًا.' },
  DB_UNAVAILABLE: {
    en: 'Our service is temporarily unavailable. If this is an emergency, call 123 (Egypt) or 112.',
    ar: 'الخدمة غير متاحة مؤقتًا. إذا كانت حالة طارئة، اتصل بـ 123 (مصر) أو 112.',
  },
  INTERNAL_ERROR: {
    en: 'Something went wrong. If this is an emergency, call 123 (Egypt) or 112.',
    ar: 'حدث خطأ ما. إذا كانت حالة طارئة، اتصل بـ 123 (مصر) أو 112.',
  },
};
