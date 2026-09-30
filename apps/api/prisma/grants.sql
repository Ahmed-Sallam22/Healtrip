-- Least-privilege grants, applied by the migrate job after `prisma migrate deploy`.
-- healtrip_api: read reference data, write only chat/audit tables. No DDL, no DELETE.
GRANT USAGE ON SCHEMA public TO healtrip_api;
GRANT SELECT ON "Specialty", "Hospital", "Doctor", "AvailabilitySlot", "SymptomSpecialtyMap" TO healtrip_api;
GRANT SELECT, INSERT, UPDATE ON "ChatSession", "ChatMessage" TO healtrip_api;
GRANT SELECT, INSERT ON "ToolCallLog", "AgentRunLog" TO healtrip_api;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO healtrip_api;
-- healtrip_rag: may only read provider ids (ingestion orphan check). Owns the rag schema.
GRANT USAGE ON SCHEMA public TO healtrip_rag;
GRANT SELECT ("id") ON "Doctor", "Hospital" TO healtrip_rag;
