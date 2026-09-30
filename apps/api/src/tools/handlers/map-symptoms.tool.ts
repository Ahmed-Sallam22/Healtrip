import { MapSymptomsArgsSchema, type SpecialtyMatch, TOOL_NAMES } from '@healtrip/shared';
import { normalizeText } from '../../common/text';
import type { ProvidersRepository } from '../../providers/providers.repository';
import { ok, type ToolDefinition } from '../tool.types';

const URGENCY_ORDER = ['routine', 'soon', 'urgent-evaluate'];

export function mapSymptomsTool(repo: ProvidersRepository): ToolDefinition<typeof MapSymptomsArgsSchema> {
  return {
    name: TOOL_NAMES.mapSymptoms,
    description:
      'Map symptom keywords (English or Arabic) to medical specialty codes using HealTrip\'s curated routing table. ' +
      'Use this instead of your own medical knowledge to choose a specialtyCode for search_providers.',
    schema: MapSymptomsArgsSchema,
    terminal: false,
    handler: async ({ symptoms }, ctx) => {
      const rows = await repo.listSymptomMappings();
      const bySpecialty = new Map<string, SpecialtyMatch & { hits: number }>();
      for (const symptom of symptoms.map(normalizeText)) {
        for (const row of rows) {
          const kw = normalizeText(row.symptomKeyword);
          const matches = symptom.includes(kw) || (symptom.length >= 4 && kw.includes(symptom));
          if (!matches) continue;
          const entry = bySpecialty.get(row.specialtyCode) ?? {
            specialtyCode: row.specialtyCode,
            nameEn: row.specialtyNameEn,
            nameAr: row.specialtyNameAr,
            urgencyHint: row.urgencyHint,
            matchedKeywords: [],
            hits: 0,
          };
          entry.hits++;
          if (!entry.matchedKeywords.includes(row.symptomKeyword)) entry.matchedKeywords.push(row.symptomKeyword);
          if (URGENCY_ORDER.indexOf(row.urgencyHint) > URGENCY_ORDER.indexOf(entry.urgencyHint)) entry.urgencyHint = row.urgencyHint;
          bySpecialty.set(row.specialtyCode, entry);
        }
      }
      const matches = [...bySpecialty.values()]
        .sort((a, b) => b.hits - a.hits || a.specialtyCode.localeCompare(b.specialtyCode))
        .map(({ hits: _hits, nameEn, nameAr, ...m }) => ({ ...m, name: ctx.locale === 'ar' ? nameAr : nameEn }));
      return ok({
        matches,
        note: matches.length ? undefined : 'NO_MAPPING: no curated mapping found; GENERAL_PRACTICE is the safe default.',
      });
    },
  };
}
