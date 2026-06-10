-- CreateEnum
CREATE TYPE "CallDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "CallOutcome" AS ENUM ('ANSWERED', 'MISSED', 'VOICEMAIL', 'ABANDONED');

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "tags" TEXT[],
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallLog" (
    "id" TEXT NOT NULL,
    "twilioCallSid" TEXT NOT NULL,
    "direction" "CallDirection" NOT NULL DEFAULT 'INBOUND',
    "fromNumber" TEXT NOT NULL,
    "toNumber" TEXT NOT NULL,
    "ivrSelection" TEXT,
    "routedTo" TEXT,
    "status" TEXT NOT NULL,
    "durationSeconds" INTEGER,
    "outcome" "CallOutcome",
    "recordingSid" TEXT,
    "recordingUrl" TEXT,
    "recordingStatus" TEXT,
    "transcript" TEXT,
    "summary" TEXT,
    "summaryModel" TEXT,
    "summaryGeneratedAt" TIMESTAMP(3),
    "actionItems" TEXT[],
    "contactId" TEXT,
    "agentName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Contact_phone_key" ON "Contact"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "CallLog_twilioCallSid_key" ON "CallLog"("twilioCallSid");

-- CreateIndex
CREATE INDEX "CallLog_fromNumber_idx" ON "CallLog"("fromNumber");

-- CreateIndex
CREATE INDEX "CallLog_status_idx" ON "CallLog"("status");

-- CreateIndex
CREATE INDEX "CallLog_createdAt_idx" ON "CallLog"("createdAt");

-- AddForeignKey
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
