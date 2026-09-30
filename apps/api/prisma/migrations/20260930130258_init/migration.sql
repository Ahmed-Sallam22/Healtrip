-- CreateTable
CREATE TABLE "Specialty" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,

    CONSTRAINT "Specialty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hospital" (
    "id" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" CHAR(2) NOT NULL,
    "hasEmergency" BOOLEAN NOT NULL DEFAULT false,
    "is24h" BOOLEAN NOT NULL DEFAULT false,
    "accreditation" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "phone" TEXT NOT NULL,

    CONSTRAINT "Hospital_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Doctor" (
    "id" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "specialtyId" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "yearsExperience" INTEGER NOT NULL,
    "languages" TEXT[],
    "consultationFeeUsd" INTEGER NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL,
    "offersSecondOpinion" BOOLEAN NOT NULL DEFAULT false,
    "offersTelemedicine" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Doctor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilitySlot" (
    "id" UUID NOT NULL,
    "doctorId" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "isBooked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AvailabilitySlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SymptomSpecialtyMap" (
    "id" SERIAL NOT NULL,
    "symptomKeyword" TEXT NOT NULL,
    "locale" VARCHAR(2) NOT NULL,
    "specialtyCode" TEXT NOT NULL,
    "urgencyHint" TEXT NOT NULL,

    CONSTRAINT "SymptomSpecialtyMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatSession" (
    "id" UUID NOT NULL,
    "locale" VARCHAR(2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "extractedFacts" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolCallLog" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "requestId" TEXT,
    "toolName" TEXT NOT NULL,
    "args" JSONB NOT NULL,
    "resultSummary" JSONB NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToolCallLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRunLog" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "requestId" TEXT,
    "source" TEXT NOT NULL,
    "nextStep" TEXT,
    "providerIds" TEXT[],
    "citations" TEXT[],
    "validationErrors" JSONB NOT NULL DEFAULT '[]',
    "llmProvider" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "steps" INTEGER NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRunLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Specialty_code_key" ON "Specialty"("code");

-- CreateIndex
CREATE INDEX "Hospital_city_idx" ON "Hospital"("city");

-- CreateIndex
CREATE INDEX "Hospital_hasEmergency_city_idx" ON "Hospital"("hasEmergency", "city");

-- CreateIndex
CREATE INDEX "Doctor_specialtyId_idx" ON "Doctor"("specialtyId");

-- CreateIndex
CREATE INDEX "Doctor_hospitalId_idx" ON "Doctor"("hospitalId");

-- CreateIndex
CREATE INDEX "AvailabilitySlot_doctorId_startsAt_idx" ON "AvailabilitySlot"("doctorId", "startsAt");

-- CreateIndex
CREATE INDEX "SymptomSpecialtyMap_symptomKeyword_idx" ON "SymptomSpecialtyMap"("symptomKeyword");

-- CreateIndex
CREATE UNIQUE INDEX "SymptomSpecialtyMap_symptomKeyword_specialtyCode_key" ON "SymptomSpecialtyMap"("symptomKeyword", "specialtyCode");

-- CreateIndex
CREATE INDEX "ChatMessage_sessionId_createdAt_idx" ON "ChatMessage"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "ToolCallLog_sessionId_createdAt_idx" ON "ToolCallLog"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "ToolCallLog_toolName_idx" ON "ToolCallLog"("toolName");

-- CreateIndex
CREATE INDEX "AgentRunLog_sessionId_createdAt_idx" ON "AgentRunLog"("sessionId", "createdAt");

-- AddForeignKey
ALTER TABLE "Doctor" ADD CONSTRAINT "Doctor_specialtyId_fkey" FOREIGN KEY ("specialtyId") REFERENCES "Specialty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Doctor" ADD CONSTRAINT "Doctor_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilitySlot" ADD CONSTRAINT "AvailabilitySlot_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SymptomSpecialtyMap" ADD CONSTRAINT "SymptomSpecialtyMap_specialtyCode_fkey" FOREIGN KEY ("specialtyCode") REFERENCES "Specialty"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolCallLog" ADD CONSTRAINT "ToolCallLog_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRunLog" ADD CONSTRAINT "AgentRunLog_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
