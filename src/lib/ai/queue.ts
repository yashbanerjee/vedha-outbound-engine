import { prisma } from "@/lib/db";

/**
 * Queues AI scoring for the given leads. Leads that already have a pending or
 * running job are skipped. Returns the number of jobs created.
 */
export async function enqueueScoringJobs(leadIds: string[]): Promise<number> {
  if (leadIds.length === 0) return 0;

  const busy = await prisma.aiScoringJob.findMany({
    where: { leadId: { in: leadIds }, status: { in: ["PENDING", "RUNNING"] } },
    select: { leadId: true },
  });
  const busySet = new Set(busy.map((b) => b.leadId));
  const toCreate = leadIds.filter((id) => !busySet.has(id));
  if (toCreate.length === 0) return 0;

  const result = await prisma.aiScoringJob.createMany({
    data: toCreate.map((leadId) => ({ leadId })),
  });
  return result.count;
}

export async function getAiSettings() {
  return prisma.aiSettings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });
}
