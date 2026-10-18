-- AlterEnum
ALTER TYPE "ActivityType" ADD VALUE 'FOLLOW_UP';

-- AlterTable
ALTER TABLE "AiSettings" ADD COLUMN     "followUpDays" INTEGER[] DEFAULT ARRAY[3, 5, 10]::INTEGER[];

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "contactedAt" TIMESTAMP(3),
ADD COLUMN     "followUpStage" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastFollowUpAt" TIMESTAMP(3),
ADD COLUMN     "nextFollowUpAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Lead_nextFollowUpAt_idx" ON "Lead"("nextFollowUpAt");
