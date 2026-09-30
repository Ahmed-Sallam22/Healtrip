import { FindEmergencyHospitalsArgsSchema, type HospitalHit, normalizeCity, TOOL_NAMES } from '@healtrip/shared';
import type { HospitalRecord, ProvidersRepository } from '../../providers/providers.repository';
import { ok, type ToolDefinition } from '../tool.types';

export function toHospitalHit(h: HospitalRecord, locale: 'ar' | 'en'): HospitalHit {
  return {
    id: h.id,
    kind: 'hospital',
    name: locale === 'ar' ? h.nameAr : h.nameEn,
    city: h.city,
    country: h.country,
    hasEmergency: h.hasEmergency,
    is24h: h.is24h,
    accreditation: h.accreditation,
    phone: h.phone,
  };
}

export function findEmergencyHospitalsTool(repo: ProvidersRepository): ToolDefinition<typeof FindEmergencyHospitalsArgsSchema> {
  return {
    name: TOOL_NAMES.findEmergencyHospitals,
    description: 'List 24-hour hospitals with an emergency department, optionally in a given city. Use for urgent or emergency situations.',
    schema: FindEmergencyHospitalsArgsSchema,
    terminal: false,
    handler: async ({ city }, ctx) => {
      const known = normalizeCity(city);
      let records = await repo.findEmergencyHospitals({ city: known?.code, limit: 5 });
      let note: string | undefined;
      if (city && !known) note = `CITY_NOT_IN_SCOPE: "${city}" is not covered; showing all emergency hospitals in scope.`;
      if (known && !records.length) {
        records = await repo.findEmergencyHospitals({ country: known.country, limit: 5 });
        note = `No emergency hospital in ${known.nameEn}; showing others in the same country.`;
      }
      return ok({ hospitals: records.map((h) => toHospitalHit(h, ctx.locale)), note }, { hospitals: records });
    },
  };
}
