-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('VALID', 'INVALID', 'DISPOSABLE', 'NO_MX', 'UNVERIFIED');

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "emailCheckedAt" TIMESTAMP(3),
ADD COLUMN     "emailStatus" "EmailStatus",
ADD COLUMN     "emailStatusDetail" TEXT;

-- CreateIndex
CREATE INDEX "Lead_emailStatus_idx" ON "Lead"("emailStatus");
