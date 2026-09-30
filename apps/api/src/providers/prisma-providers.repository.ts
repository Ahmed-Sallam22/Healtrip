import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  type DoctorRecord,
  type DoctorSearchFilter,
  type HospitalRecord,
  ProvidersRepository,
  type SlotRecord,
  type SymptomMapping,
} from './providers.repository';

const doctorInclude = (now: Date) =>
  ({
    specialty: true,
    hospital: true,
    slots: { where: { isBooked: false, startsAt: { gt: now } }, orderBy: { startsAt: 'asc' }, take: 1 },
  }) satisfies Prisma.DoctorInclude;

type DoctorRow = Prisma.DoctorGetPayload<{ include: ReturnType<typeof doctorInclude> }>;

@Injectable()
export class PrismaProvidersRepository extends ProvidersRepository {
  private symptomCache?: { at: number; rows: SymptomMapping[] };

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listSymptomMappings(): Promise<SymptomMapping[]> {
    // Curated reference data changes rarely: cache for 5 minutes.
    if (this.symptomCache && Date.now() - this.symptomCache.at < 300_000) return this.symptomCache.rows;
    const rows = await this.prisma.symptomSpecialtyMap.findMany({ include: { specialty: true } });
    const mapped = rows.map((r) => ({
      symptomKeyword: r.symptomKeyword,
      locale: r.locale,
      specialtyCode: r.specialtyCode,
      specialtyNameEn: r.specialty.nameEn,
      specialtyNameAr: r.specialty.nameAr,
      urgencyHint: r.urgencyHint,
    }));
    this.symptomCache = { at: Date.now(), rows: mapped };
    return mapped;
  }

  async listSpecialtyCodes(): Promise<string[]> {
    const rows = await this.prisma.specialty.findMany({ select: { code: true }, orderBy: { code: 'asc' } });
    return rows.map((r) => r.code);
  }

  async searchDoctors(f: DoctorSearchFilter): Promise<DoctorRecord[]> {
    const now = new Date();
    const rows = await this.prisma.doctor.findMany({
      where: {
        specialty: { code: f.specialtyCode },
        consultationFeeUsd: f.maxFeeUsd !== undefined ? { lte: f.maxFeeUsd } : undefined,
        languages: f.language ? { has: f.language } : undefined,
        offersSecondOpinion: f.secondOpinion ? true : undefined,
        offersTelemedicine: f.telemedicine ? true : undefined,
        hospital: {
          city: f.city ? { equals: f.city, mode: 'insensitive' } : undefined,
          country: f.country ?? undefined,
          hasEmergency: f.needsEmergency ? true : undefined,
        },
      },
      include: doctorInclude(now),
      orderBy: [{ rating: 'desc' }, { consultationFeeUsd: 'asc' }, { id: 'asc' }],
      take: f.limit,
    });
    return rows.map(toDoctorRecord);
  }

  async findEmergencyHospitals(f: { city?: string; country?: string; limit: number }): Promise<HospitalRecord[]> {
    const rows = await this.prisma.hospital.findMany({
      where: {
        hasEmergency: true,
        is24h: true,
        city: f.city ? { equals: f.city, mode: 'insensitive' } : undefined,
        country: f.country ?? undefined,
      },
      orderBy: [{ city: 'asc' }, { id: 'asc' }],
      take: f.limit,
    });
    return rows.map(toHospitalRecord);
  }

  async findDoctorsByIds(ids: string[]): Promise<DoctorRecord[]> {
    if (!ids.length) return [];
    const rows = await this.prisma.doctor.findMany({ where: { id: { in: ids } }, include: doctorInclude(new Date()) });
    return rows.map(toDoctorRecord);
  }

  async findHospitalsByIds(ids: string[]): Promise<HospitalRecord[]> {
    if (!ids.length) return [];
    const rows = await this.prisma.hospital.findMany({ where: { id: { in: ids } } });
    return rows.map(toHospitalRecord);
  }

  async doctorExists(id: string): Promise<boolean> {
    return (await this.prisma.doctor.count({ where: { id } })) > 0;
  }

  async findOpenSlots(doctorId: string, from: Date, to: Date, limit: number): Promise<SlotRecord[]> {
    return this.prisma.availabilitySlot.findMany({
      where: { doctorId, isBooked: false, startsAt: { gte: from, lt: to } },
      orderBy: { startsAt: 'asc' },
      take: limit,
      select: { id: true, startsAt: true, endsAt: true },
    });
  }
}

function toDoctorRecord(d: DoctorRow): DoctorRecord {
  return {
    id: d.id,
    nameEn: d.nameEn,
    nameAr: d.nameAr,
    specialtyCode: d.specialty.code,
    specialtyNameEn: d.specialty.nameEn,
    specialtyNameAr: d.specialty.nameAr,
    hospitalId: d.hospital.id,
    hospitalNameEn: d.hospital.nameEn,
    hospitalNameAr: d.hospital.nameAr,
    city: d.hospital.city,
    country: d.hospital.country,
    hospitalHasEmergency: d.hospital.hasEmergency,
    yearsExperience: d.yearsExperience,
    languages: d.languages,
    consultationFeeUsd: d.consultationFeeUsd,
    rating: d.rating,
    offersSecondOpinion: d.offersSecondOpinion,
    offersTelemedicine: d.offersTelemedicine,
    nextAvailableSlot: d.slots[0]?.startsAt ?? null,
  };
}

function toHospitalRecord(h: {
  id: string; nameEn: string; nameAr: string; city: string; country: string; hasEmergency: boolean; is24h: boolean;
  accreditation: string | null; phone: string;
}): HospitalRecord {
  return {
    id: h.id, nameEn: h.nameEn, nameAr: h.nameAr, city: h.city, country: h.country, hasEmergency: h.hasEmergency,
    is24h: h.is24h, accreditation: h.accreditation, phone: h.phone,
  };
}
