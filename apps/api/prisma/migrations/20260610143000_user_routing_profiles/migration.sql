-- CreateEnum
CREATE TYPE "UserTeam" AS ENUM ('SALES', 'SUPPORT', 'ACCOUNTS');

-- AlterTable
ALTER TABLE "User"
ADD COLUMN "team" "UserTeam" NOT NULL DEFAULT 'SUPPORT',
ADD COLUMN "phoneNumber" TEXT,
ADD COLUMN "isAvailable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "lastLoginAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "User_phoneNumber_key" ON "User"("phoneNumber");
