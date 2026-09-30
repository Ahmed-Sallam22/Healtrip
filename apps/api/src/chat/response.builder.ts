import { Injectable } from '@nestjs/common';
import {
  type Citation,
  type DoctorCard,
  type HospitalCard,
  type Locale,
  type ProviderCard,
  type SubmitRecommendationArgs,
} from '@healtrip/shared';
import { truncate } from '../common/text';
import type { TurnEvidence } from '../agent/grounding.validator';
import { type DoctorRecord, type HospitalRecord, ProvidersRepository } from '../providers/providers.repository';

/**
 * Turns validated agent output into UI payload pieces.
 * Provider cards are re-fetched from the database by id — the model's text never becomes a card,
 * so even a model that misspells a name or price cannot change what the patient sees.
 */
@Injectable()
export class ResponseBuilder {
  constructor(private readonly repo: ProvidersRepository) {}

  async providerCards(providers: SubmitRecommendationArgs['providers'], locale: Locale): Promise<ProviderCard[]> {
    const ids = providers.map((p) => p.providerId);
    const [doctors, hospitals] = await Promise.all([this.repo.findDoctorsByIds(ids), this.repo.findHospitalsByIds(ids)]);
    const byId = new Map<string, ProviderCard>([
      ...doctors.map((d) => [d.id, doctorCard(d, locale, '')] as const),
      ...hospitals.map((h) => [h.id, hospitalCard(h, locale, '')] as const),
    ]);
    return providers.flatMap((p) => {
      const card = byId.get(p.providerId);
      return card ? [{ ...card, matchReason: p.matchReason }] : [];
    });
  }

  hospitalCards(hospitals: HospitalRecord[], locale: Locale, matchReason: string): HospitalCard[] {
    return hospitals.map((h) => hospitalCard(h, locale, matchReason));
  }

  citations(chunkIds: string[], evidence: TurnEvidence): Citation[] {
    return chunkIds.flatMap((id) => {
      const c = evidence.chunks.get(id);
      return c ? [{ chunkId: c.chunkId, sourceType: c.sourceType, sourceId: c.sourceId, title: c.title, snippet: truncate(c.text, 240) }] : [];
    });
  }
}

function doctorCard(d: DoctorRecord, locale: Locale, matchReason: string): DoctorCard {
  const ar = locale === 'ar';
  return {
    kind: 'doctor',
    id: d.id,
    name: ar ? d.nameAr : d.nameEn,
    specialty: { code: d.specialtyCode, name: ar ? d.specialtyNameAr : d.specialtyNameEn },
    hospital: { id: d.hospitalId, name: ar ? d.hospitalNameAr : d.hospitalNameEn, city: d.city, country: d.country },
    yearsExperience: d.yearsExperience,
    languages: d.languages,
    consultationFeeUsd: d.consultationFeeUsd,
    rating: d.rating,
    offersSecondOpinion: d.offersSecondOpinion,
    offersTelemedicine: d.offersTelemedicine,
    nextAvailableSlot: d.nextAvailableSlot?.toISOString() ?? null,
    matchReason,
  };
}

function hospitalCard(h: HospitalRecord, locale: Locale, matchReason: string): HospitalCard {
  return {
    kind: 'hospital',
    id: h.id,
    name: locale === 'ar' ? h.nameAr : h.nameEn,
    city: h.city,
    country: h.country,
    hasEmergency: h.hasEmergency,
    is24h: h.is24h,
    accreditation: h.accreditation,
    phone: h.phone,
    matchReason,
  };
}
