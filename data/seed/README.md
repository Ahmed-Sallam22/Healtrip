# Seed data — ALL FICTIONAL

Every hospital, doctor, phone number, fee, rating and bio in this folder is invented for a
technical prototype. Any resemblance to real people or institutions is coincidental.

These JSON files are the single source of truth for sample data:

- `apps/api/prisma/seed.ts` loads them into the relational tables (public schema).
- `apps/rag/app/ingest.py` turns the bios/profiles into knowledge-base documents (rag schema),
  so every `doctor_bio` / `hospital_profile` document references a real DB id via `sourceId`.
