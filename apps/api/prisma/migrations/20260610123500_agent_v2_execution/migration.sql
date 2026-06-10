-- AlterEnum
ALTER TYPE "AgentActionStatus" ADD VALUE 'FAILED';

-- AlterTable
ALTER TABLE "AgentAction"
ADD COLUMN "executionAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastError" TEXT,
ADD COLUMN "nextRetryAt" TIMESTAMP(3),
ADD COLUMN "executedAt" TIMESTAMP(3),
ADD COLUMN "failedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "AgentAction_nextRetryAt_idx" ON "AgentAction"("nextRetryAt");
