#!/bin/sh
# Runs once on first container start (docker-entrypoint-initdb.d), as the superuser.
# Three roles with least privilege:
#   healtrip_migrator — owns the public schema; used only by the one-shot migrate/seed job
#   healtrip_api      — runtime API: reads reference data, writes chat/audit rows (see prisma/grants.sql)
#   healtrip_rag      — RAG service: owns the rag schema, reads Doctor/Hospital ids only
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
CREATE EXTENSION IF NOT EXISTS vector;
CREATE ROLE healtrip_migrator LOGIN PASSWORD '${MIGRATOR_PASSWORD}';
CREATE ROLE healtrip_api LOGIN PASSWORD '${API_DB_PASSWORD}';
CREATE ROLE healtrip_rag LOGIN PASSWORD '${RAG_DB_PASSWORD}';
ALTER SCHEMA public OWNER TO healtrip_migrator;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE SCHEMA IF NOT EXISTS rag AUTHORIZATION healtrip_rag;
REVOKE ALL ON SCHEMA rag FROM PUBLIC;
SQL
