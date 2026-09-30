import { CITIES, type DoctorHit, normalizeCity, SearchProvidersArgsSchema, TOOL_NAMES } from '@healtrip/shared';
import type { DoctorRecord, ProvidersRepository } from '../../providers/providers.repository';
import { fail, ok, type ToolDefinition } from '../tool.types';

export const MAX_PROVIDER_RESULTS = 5;

export function toDoctorHit(d: DoctorRecord, locale: 'ar' | 'en'): DoctorHit {
  return {
    id: d.id,
    kind: 'doctor',
    name: locale === 'ar' ? d.nameAr : d.nameEn,
    specialtyCode: d.specialtyCode,
    hospitalId: d.hospitalId,
    hospitalName: locale === 'ar' ? d.hospitalNameAr : d.hospitalNameEn,
    city: d.city,
    country: d.country,
    yearsExperience: d.yearsExperience,
    languages: d.languages,
    consultationFeeUsd: d.consultationFeeUsd,
    rating: d.rating,
    offersSecondOpinion: d.offersSecondOpinion,
    offersTelemedicine: d.offersTelemedicine,
    hospitalHasEmergency: d.hospitalHasEmergency,
    nextAvailableSlot: d.nextAvailableSlot?.toISOString() ?? null,
  };
}

export function searchProvidersTool(repo: ProvidersRepository): ToolDefinition<typeof SearchProvidersArgsSchema> {
  return {
    name: TOOL_NAMES.searchProviders,
    description:
      'Search HealTrip\'s database of doctors by specialty and optional filters (city, max fee in USD, spoken language, ' +
      'second opinion, telemedicine, emergency-capable hospital). Returns at most 5 doctors with hospital, fee, rating and ' +
      'next open slot. These results are the ONLY doctors you may recommend.',
    schema: SearchProvidersArgsSchema,
    terminal: false,
    handler: async (args, ctx) => {
      const specialties = await repo.listSpecialtyCodes();
      if (!specialties.includes(args.specialtyCode)) {
        return fail('INVALID_ARGS', `Unknown specialtyCode "${args.specialtyCode}". Use map_symptoms_to_specialty.`, {
          validSpecialtyCodes: specialties,
        });
      }
      let city: string | undefined;
      if (args.city) {
        const known = normalizeCity(args.city);
        if (!known) {
          // Out-of-scope city: answer truthfully with nothing rather than guessing.
          return ok({
            providers: [],
            note: `CITY_NOT_IN_SCOPE: HealTrip has no providers in "${args.city}".`,
            citiesInScope: CITIES.map((c) => c.nameEn),
          });
        }
        city = known.code;
      }
      const limit = Math.min(args.limit ?? MAX_PROVIDER_RESULTS, MAX_PROVIDER_RESULTS);
      const records = await repo.searchDoctors({
        specialtyCode: args.specialtyCode,
        city,
        country: args.country?.toUpperCase(),
        maxFeeUsd: args.maxFeeUsd,
        language: args.language?.toLowerCase(),
        needsEmergency: args.needsEmergency,
        secondOpinion: args.secondOpinion,
        telemedicine: args.telemedicine,
        limit,
      });
      return ok(
        {
          providers: records.map((r) => toDoctorHit(r, ctx.locale)),
          note: records.length
            ? undefined
            : 'NO_MATCH: no doctors match all filters. Tell the user and suggest widening filters (e.g. remove maxFeeUsd, language or city). Never invent providers.',
        },
        { doctors: records },
      );
    },
  };
}
