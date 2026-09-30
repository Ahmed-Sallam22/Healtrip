/**
 * Idempotent seed: loads the fictional sample data from /data/seed (shared with the RAG ingester).
 * Reference data is upserted; availability slots are regenerated for the next 14 days.
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const prisma = new PrismaClient();

function seedDir(): string {
  const candidates = [process.env.SEED_DATA_DIR, join(__dirname, '../../../data/seed'), join(process.cwd(), 'data/seed')];
  const found = candidates.find((p) => p && existsSync(join(p, 'doctors.json')));
  if (!found) throw new Error(`Seed data not found. Tried: ${candidates.filter(Boolean).join(', ')}`);
  return found;
}

const load = <T>(file: string): T => JSON.parse(readFileSync(join(seedDir(), file), 'utf8')) as T;

interface SpecialtySeed { id: string; code: string; nameEn: string; nameAr: string }
interface HospitalSeed {
  id: string; nameEn: string; nameAr: string; city: string; country: string; hasEmergency: boolean;
  is24h: boolean; accreditation: string | null; lat: number; lng: number; phone: string;
}
interface DoctorSeed {
  id: string; nameEn: string; nameAr: string; specialtyCode: string; hospitalId: string; yearsExperience: number;
  languages: string[]; consultationFeeUsd: number; rating: number; offersSecondOpinion: boolean; offersTelemedicine: boolean;
}
interface SymptomSeed { symptomKeyword: string; locale: string; specialtyCode: string; urgencyHint: string }

/** Small deterministic PRNG so slot layouts are reproducible between seeds. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  const specialties = load<SpecialtySeed[]>('specialties.json');
  const hospitals = load<HospitalSeed[]>('hospitals.json');
  const doctors = load<DoctorSeed[]>('doctors.json');
  const symptoms = load<SymptomSeed[]>('symptom-map.json');
  const specialtyByCode = new Map(specialties.map((s) => [s.code, s]));

  for (const s of specialties) {
    await prisma.specialty.upsert({ where: { id: s.id }, create: s, update: s });
  }
  for (const h of hospitals) {
    const data = {
      id: h.id, nameEn: h.nameEn, nameAr: h.nameAr, city: h.city, country: h.country, hasEmergency: h.hasEmergency,
      is24h: h.is24h, accreditation: h.accreditation, lat: h.lat, lng: h.lng, phone: h.phone,
    };
    await prisma.hospital.upsert({ where: { id: h.id }, create: data, update: data });
  }
  for (const d of doctors) {
    const specialty = specialtyByCode.get(d.specialtyCode);
    if (!specialty) throw new Error(`Unknown specialty ${d.specialtyCode} for ${d.id}`);
    const data = {
      id: d.id, nameEn: d.nameEn, nameAr: d.nameAr, specialtyId: specialty.id, hospitalId: d.hospitalId,
      yearsExperience: d.yearsExperience, languages: d.languages, consultationFeeUsd: d.consultationFeeUsd,
      rating: d.rating, offersSecondOpinion: d.offersSecondOpinion, offersTelemedicine: d.offersTelemedicine,
    };
    await prisma.doctor.upsert({ where: { id: d.id }, create: data, update: data });
  }
  for (const s of symptoms) {
    await prisma.symptomSpecialtyMap.upsert({
      where: { symptomKeyword_specialtyCode: { symptomKeyword: s.symptomKeyword, specialtyCode: s.specialtyCode } },
      create: s,
      update: { locale: s.locale, urgencyHint: s.urgencyHint },
    });
  }

  // Availability: regenerate open slots for the next 14 days (09:00–16:00 UTC, 30 min each).
  await prisma.availabilitySlot.deleteMany({});
  const rand = mulberry32(42);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const slots: { doctorId: string; startsAt: Date; endsAt: Date; isBooked: boolean }[] = [];
  for (const d of doctors) {
    for (let day = 1; day <= 14; day++) {
      if (rand() < 0.45) continue; // doctor not in clinic that day
      const perDay = 1 + Math.floor(rand() * 3);
      const hours = new Set<number>();
      while (hours.size < perDay) hours.add(9 + Math.floor(rand() * 8));
      for (const hour of hours) {
        const startsAt = new Date(today.getTime() + day * 86_400_000 + hour * 3_600_000);
        slots.push({ doctorId: d.id, startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60_000), isBooked: rand() < 0.3 });
      }
    }
  }
  await prisma.availabilitySlot.createMany({ data: slots });

  console.log(
    `Seeded ${specialties.length} specialties, ${hospitals.length} hospitals, ${doctors.length} doctors, ` +
      `${symptoms.length} symptom mappings, ${slots.length} slots (all fictional).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
