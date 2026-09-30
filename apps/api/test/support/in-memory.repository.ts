/**
 * In-memory ProvidersRepository backed by the same fictional seed JSON as the database.
 * Lets tool/agent tests run fast and offline while exercising real data shapes.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type DoctorRecord,
  type DoctorSearchFilter,
  type HospitalRecord,
  ProvidersRepository,
  type SlotRecord,
  type SymptomMapping,
} from '../../src/providers/providers.repository';

const SEED = join(__dirname, '../../../../data/seed');
const load = <T>(f: string): T => JSON.parse(readFileSync(join(SEED, f), 'utf8')) as T;

interface SeedDoctor extends Omit<DoctorRecord, 'specialtyNameEn' | 'specialtyNameAr' | 'hospitalNameEn' | 'hospitalNameAr' | 'city' | 'country' | 'hospitalHasEmergency' | 'nextAvailableSlot'> {
  specialtyCode: string;
}

export class InMemoryProvidersRepository extends ProvidersRepository {
  readonly hospitals: HospitalRecord[] = load<HospitalRecord[]>('hospitals.json').map((h) => ({
    id: h.id, nameEn: h.nameEn, nameAr: h.nameAr, city: h.city, country: h.country, hasEmergency: h.hasEmergency,
    is24h: h.is24h, accreditation: h.accreditation, phone: h.phone,
  }));
  readonly specialties = load<{ code: string; nameEn: string; nameAr: string }[]>('specialties.json');
  readonly doctors: DoctorRecord[];
  readonly slots = new Map<string, SlotRecord[]>();
  readonly symptoms: SymptomMapping[];

  constructor() {
    super();
    const spec = new Map(this.specialties.map((s) => [s.code, s]));
    const hosp = new Map(this.hospitals.map((h) => [h.id, h]));
    const tomorrow = new Date(Date.now() + 86_400_000);
    tomorrow.setUTCHours(10, 0, 0, 0);
    this.doctors = load<SeedDoctor[]>('doctors.json').map((d, i) => {
      const h = hosp.get(d.hospitalId)!;
      const s = spec.get(d.specialtyCode)!;
      const slot = new Date(tomorrow.getTime() + (i % 5) * 86_400_000);
      this.slots.set(d.id, [{ id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, startsAt: slot, endsAt: new Date(slot.getTime() + 1_800_000) }]);
      return {
        id: d.id, nameEn: d.nameEn, nameAr: d.nameAr, specialtyCode: d.specialtyCode, specialtyNameEn: s.nameEn,
        specialtyNameAr: s.nameAr, hospitalId: h.id, hospitalNameEn: h.nameEn, hospitalNameAr: h.nameAr, city: h.city,
        country: h.country, hospitalHasEmergency: h.hasEmergency, yearsExperience: d.yearsExperience, languages: d.languages,
        consultationFeeUsd: d.consultationFeeUsd, rating: d.rating, offersSecondOpinion: d.offersSecondOpinion,
        offersTelemedicine: d.offersTelemedicine, nextAvailableSlot: slot,
      };
    });
    this.symptoms = load<{ symptomKeyword: string; locale: string; specialtyCode: string; urgencyHint: string }[]>('symptom-map.json').map((m) => ({
      ...m,
      specialtyNameEn: spec.get(m.specialtyCode)!.nameEn,
      specialtyNameAr: spec.get(m.specialtyCode)!.nameAr,
    }));
  }

  async listSymptomMappings() { return this.symptoms; }
  async listSpecialtyCodes() { return this.specialties.map((s) => s.code).sort(); }

  async searchDoctors(f: DoctorSearchFilter) {
    return this.doctors
      .filter((d) => d.specialtyCode === f.specialtyCode)
      .filter((d) => !f.city || d.city.toLowerCase() === f.city.toLowerCase())
      .filter((d) => !f.country || d.country === f.country)
      .filter((d) => f.maxFeeUsd === undefined || d.consultationFeeUsd <= f.maxFeeUsd)
      .filter((d) => !f.language || d.languages.includes(f.language))
      .filter((d) => !f.secondOpinion || d.offersSecondOpinion)
      .filter((d) => !f.telemedicine || d.offersTelemedicine)
      .filter((d) => !f.needsEmergency || d.hospitalHasEmergency)
      .sort((a, b) => b.rating - a.rating || a.consultationFeeUsd - b.consultationFeeUsd || a.id.localeCompare(b.id))
      .slice(0, f.limit);
  }

  async findEmergencyHospitals(f: { city?: string; country?: string; limit: number }) {
    return this.hospitals
      .filter((h) => h.hasEmergency && h.is24h)
      .filter((h) => !f.city || h.city.toLowerCase() === f.city.toLowerCase())
      .filter((h) => !f.country || h.country === f.country)
      .slice(0, f.limit);
  }

  async findDoctorsByIds(ids: string[]) { return this.doctors.filter((d) => ids.includes(d.id)); }
  async findHospitalsByIds(ids: string[]) { return this.hospitals.filter((h) => ids.includes(h.id)); }
  async doctorExists(id: string) { return this.doctors.some((d) => d.id === id); }
  async findOpenSlots(doctorId: string, from: Date, to: Date, limit: number) {
    return (this.slots.get(doctorId) ?? []).filter((s) => s.startsAt >= from && s.startsAt < to).slice(0, limit);
  }
}
