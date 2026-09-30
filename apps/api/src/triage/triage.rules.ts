/**
 * Deterministic red-flag rules. These run BEFORE the LLM and cannot be overridden downward by it.
 *
 * Rules are data (reviewable by a clinician, versioned with TRIAGE_RULES_VERSION) and deliberately
 * conservative: a false positive sends someone to the ER; a false negative could be fatal.
 * All phrases are matched on normalizeText() output, so Arabic spelling variants collapse together.
 *
 * NOTE: sample rules for a prototype — not clinically validated.
 */
import type { NextStep } from '@healtrip/shared';

export const TRIAGE_RULES_VERSION = 'triage-2026-09-30.1';

export type TriageLevel = 'EMERGENCY' | 'URGENT';

/** A concept = any of these phrases/regexes. Arabic phrases are normalised at load time. */
export interface Concept {
  id: string;
  phrases?: string[];
  patterns?: RegExp[];
}

export interface RedFlagRule {
  id: string;
  level: TriageLevel;
  labelEn: string;
  labelAr: string;
  /** Every concept in the list must be present (AND). Each concept is an OR of phrases. */
  allOf: Concept[];
}

// ---------- concepts ----------

export const CHEST_PAIN: Concept = {
  id: 'chest_pain',
  phrases: ['chest pain', 'pain in my chest', 'chest tightness', 'tight chest', 'chest pressure', 'pressure in my chest',
    'ألم في الصدر', 'الم في صدري', 'ألم الصدر', 'وجع في الصدر', 'وجع في صدري', 'ضيق في الصدر', 'صدري بيوجعني', 'ألم بالصدر'],
  patterns: [/\bchest (?:hurts|is hurting|feels tight|discomfort)\b/],
};

const CARDIAC_RED_FLAG: Concept = {
  id: 'cardiac_red_flag',
  phrases: [
    'left arm', 'my arm', 'to the arm', 'jaw', 'sweating', 'sweaty', 'cold sweat', 'shortness of breath', 'short of breath',
    'can\'t breathe', 'cannot breathe', 'hard to breathe', 'difficulty breathing', 'fainted', 'fainting', 'passed out',
    'crushing', 'elephant on my chest', 'nausea and sweating',
    'الذراع', 'دراعي', 'ذراعي', 'الفك', 'فكي', 'عرق', 'تعرق', 'عرقان', 'ضيق في التنفس', 'ضيق تنفس', 'صعوبة في التنفس',
    'مش قادر اتنفس', 'لا استطيع التنفس', 'اغمي علي', 'اغماء', 'دوخة شديدة', 'ضاغط',
  ],
  patterns: [/\b(?:spread|spreading|radiat\w*|going|goes|moving)\b[^.]{0,20}\b(?:arm|jaw|neck|back|shoulder)\b/],
};

const STROKE_SIGNS: Concept = {
  id: 'stroke_signs',
  phrases: ['face drooping', 'face is drooping', 'drooping face', 'slurred speech', 'slurring', 'can\'t speak', 'cannot speak',
    'one side of my body', 'one side of the body', 'sudden weakness', 'sudden numbness', 'sudden confusion', 'lost vision suddenly',
    'worst headache of my life', 'thunderclap headache',
    'تنميل في نص الجسم', 'تنميل في جانب واحد', 'ضعف في جانب واحد', 'شلل مفاجئ', 'ثقل في اللسان', 'تلعثم مفاجئ', 'ميلان الوجه',
    'وجهي مايل', 'اسوا صداع في حياتي'],
  patterns: [/\b(?:weak|numb|numbness|weakness)\b[^.]{0,25}\bone side\b/, /\bsudden(?:ly)? (?:can't|cannot) (?:talk|speak|see)\b/],
};

const SEVERE_BLEEDING: Concept = {
  id: 'severe_bleeding',
  phrases: ['bleeding heavily', 'heavy bleeding', 'won\'t stop bleeding', 'bleeding that won\'t stop', 'bleeding a lot', 'vomiting blood',
    'coughing up blood', 'throwing up blood', 'نزيف شديد', 'نزيف مش بيقف', 'نزيف لا يتوقف', 'نزيف حاد', 'استفراغ دم', 'قيء دم', 'كحة بدم'],
};

const SUICIDAL_IDEATION: Concept = {
  id: 'suicidal_ideation',
  phrases: ['kill myself', 'killing myself', 'suicide', 'suicidal', 'end my life', 'want to die', 'don\'t want to live', 'hurt myself',
    'انتحار', 'انتحر', 'اقتل نفسي', 'انهي حياتي', 'عايز اموت', 'اريد ان اموت', 'مش عايز اعيش', 'اذي نفسي'],
};

const ANAPHYLAXIS_OR_AIRWAY: Concept = {
  id: 'airway',
  phrases: ['throat is swelling', 'throat swelling', 'tongue swelling', 'not breathing', 'stopped breathing', 'choking', 'unconscious',
    'unresponsive', 'turning blue', 'تورم في الحلق', 'تورم اللسان', 'مش بيتنفس', 'لا يتنفس', 'فاقد الوعي', 'اختناق', 'ازرق'],
};

const FEVER: Concept = { id: 'fever', phrases: ['fever', 'high temperature', 'حمى', 'سخونيه', 'حراره عاليه', 'حرارة عالية'] };
const STIFF_NECK: Concept = { id: 'stiff_neck', phrases: ['stiff neck', 'neck stiffness', 'تيبس الرقبه', 'تيبس في الرقبه', 'رقبتي متخشبه'] };
const SEVERE_ABDOMINAL: Concept = {
  id: 'severe_abdominal',
  phrases: ['severe abdominal pain', 'severe stomach pain', 'unbearable stomach pain', 'ألم شديد في البطن', 'وجع شديد في البطن'],
};
const BLOOD_IN_OUTPUT: Concept = { id: 'blood_output', phrases: ['blood in my stool', 'blood in stool', 'blood in my urine', 'blood in urine', 'دم في البراز', 'دم في البول'] };

// ---------- rules ----------

export const RED_FLAG_RULES: RedFlagRule[] = [
  { id: 'cardiac_chest_pain_with_red_flag', level: 'EMERGENCY', labelEn: 'Chest pain with warning signs (spreading pain, sweating, breathlessness or fainting)',
    labelAr: 'ألم في الصدر مع علامات خطر (انتشار الألم أو تعرق أو ضيق تنفس أو إغماء)', allOf: [CHEST_PAIN, CARDIAC_RED_FLAG] },
  { id: 'stroke_signs', level: 'EMERGENCY', labelEn: 'Possible stroke signs', labelAr: 'علامات محتملة لسكتة دماغية', allOf: [STROKE_SIGNS] },
  { id: 'severe_bleeding', level: 'EMERGENCY', labelEn: 'Severe bleeding', labelAr: 'نزيف شديد', allOf: [SEVERE_BLEEDING] },
  { id: 'suicidal_ideation', level: 'EMERGENCY', labelEn: 'Thoughts of self-harm', labelAr: 'أفكار لإيذاء النفس', allOf: [SUICIDAL_IDEATION] },
  { id: 'airway_compromise', level: 'EMERGENCY', labelEn: 'Breathing or consciousness emergency', labelAr: 'طارئ في التنفس أو الوعي', allOf: [ANAPHYLAXIS_OR_AIRWAY] },
  { id: 'fever_stiff_neck', level: 'URGENT', labelEn: 'Fever with stiff neck', labelAr: 'حمى مع تيبس الرقبة', allOf: [FEVER, STIFF_NECK] },
  { id: 'severe_abdominal_pain', level: 'URGENT', labelEn: 'Severe abdominal pain', labelAr: 'ألم شديد في البطن', allOf: [SEVERE_ABDOMINAL] },
  { id: 'blood_in_output', level: 'URGENT', labelEn: 'Blood in stool or urine', labelAr: 'دم في البراز أو البول', allOf: [BLOOD_IN_OUTPUT] },
];

/** Severity threshold (self-reported 1–10) that escalates chest pain to an emergency on its own. */
export const CHEST_PAIN_EMERGENCY_SEVERITY = 8;

export const LEVEL_TO_FLOOR: Record<TriageLevel, NextStep> = {
  EMERGENCY: 'EMERGENCY_NOW',
  URGENT: 'URGENT_CARE_24H',
};
