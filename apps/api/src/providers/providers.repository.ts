/**
 * Read-only data access port for provider data. The agent's tools depend on this abstraction,
 * never on Prisma directly — tests swap in an in-memory implementation built from the seed JSON.
 * Every query is parameterised (Prisma); the model can never inject SQL.
 */
export interface DoctorRecord {
  id: string;
  nameEn: string;
  nameAr: string;
  specialtyCode: string;
  specialtyNameEn: string;
  specialtyNameAr: string;
  hospitalId: string;
  hospitalNameEn: string;
  hospitalNameAr: string;
  city: string;
  country: string;
  hospitalHasEmergency: boolean;
  yearsExperience: number;
  languages: string[];
  consultationFeeUsd: number;
  rating: number;
  offersSecondOpinion: boolean;
  offersTelemedicine: boolean;
  nextAvailableSlot: Date | null;
}

export interface HospitalRecord {
  id: string;
  nameEn: string;
  nameAr: string;
  city: string;
  country: string;
  hasEmergency: boolean;
  is24h: boolean;
  accreditation: string | null;
  phone: string;
}

export interface SymptomMapping {
  symptomKeyword: string;
  locale: string;
  specialtyCode: string;
  specialtyNameEn: string;
  specialtyNameAr: string;
  urgencyHint: string;
}

export interface DoctorSearchFilter {
  specialtyCode: string;
  city?: string;
  country?: string;
  maxFeeUsd?: number;
  language?: string;
  needsEmergency?: boolean;
  secondOpinion?: boolean;
  telemedicine?: boolean;
  limit: number;
}

export interface SlotRecord {
  id: string;
  startsAt: Date;
  endsAt: Date;
}

export abstract class ProvidersRepository {
  abstract listSymptomMappings(): Promise<SymptomMapping[]>;
  abstract listSpecialtyCodes(): Promise<string[]>;
  abstract searchDoctors(filter: DoctorSearchFilter): Promise<DoctorRecord[]>;
  abstract findEmergencyHospitals(filter: { city?: string; country?: string; limit: number }): Promise<HospitalRecord[]>;
  abstract findDoctorsByIds(ids: string[]): Promise<DoctorRecord[]>;
  abstract findHospitalsByIds(ids: string[]): Promise<HospitalRecord[]>;
  abstract doctorExists(id: string): Promise<boolean>;
  abstract findOpenSlots(doctorId: string, from: Date, to: Date, limit: number): Promise<SlotRecord[]>;
}
