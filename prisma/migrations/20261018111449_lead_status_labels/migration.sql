-- CreateTable
CREATE TABLE "LeadStatusSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "labels" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadStatusSettings_pkey" PRIMARY KEY ("id")
);
