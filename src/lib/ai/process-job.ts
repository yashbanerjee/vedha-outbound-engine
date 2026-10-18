import type { PrismaClient } from "@prisma/client";
import { AiScoringError, scoreLeadWebsite } from "@/lib/ai/score-lead";

/**
 * Atomically claims up to `limit` pending jobs for this worker.
 * Uses SKIP LOCKED so multiple workers can run side by side.
 */
export async function claimJobs(prisma: PrismaClient, limit: number): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "AiScoringJob" SET status = 'RUNNING', attempts = attempts + 1, "updatedAt" = NOW()
    WHERE id IN (
      SELECT id FROM "AiScoringJob"
      WHERE status = 'PENDING' AND "runAfter" <= NOW()
      ORDER BY "createdAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  `;
  return rows.map((r) => r.id);
}

export async function processJob(prisma: PrismaClient, jobId: string, log: (msg: string) => void = () => {}) {
  const job = await prisma.aiScoringJob.findUnique({ where: { id: jobId }, include: { lead: true } });
  if (!job) return;

  const settings = await prisma.aiSettings.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } });
  if (!settings.enabled) {
    await prisma.aiScoringJob.update({ where: { id: jobId }, data: { status: "FAILED", lastError: "AI pre-filter is disabled" } });
    return;
  }
  if (!job.lead.website) {
    await prisma.aiScoringJob.update({ where: { id: jobId }, data: { status: "FAILED", lastError: "Lead has no website" } });
    return;
  }

  try {
    const result = await scoreLeadWebsite(
      { companyName: job.lead.companyName, website: job.lead.website, industry: job.lead.industry, country: job.lead.country, notes: job.lead.notes },
      settings,
    );
    await prisma.$transaction([
      prisma.lead.update({
        where: { id: job.leadId },
        data: {
          aiScore: result.score,
          aiVerdict: result.verdict,
          aiSummary: result.summary,
          aiReasons: result.reasons,
          aiDetectedIndustry: result.detectedIndustry,
          aiScoredAt: new Date(),
          aiError: null,
        },
      }),
      prisma.aiScoringJob.update({ where: { id: jobId }, data: { status: "DONE", lastError: null } }),
      prisma.leadActivity.create({
        data: {
          leadId: job.leadId,
          type: "AI_SCORED",
          message: `AI scored ${result.score}/100 (${result.verdict.toLowerCase()}) using ${result.model}`,
          metadata: { score: result.score, verdict: result.verdict, pages: result.site.pagesFetched, model: result.model },
        },
      }),
    ]);
    log(`scored ${job.lead.companyName}: ${result.score} ${result.verdict}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const retryable = err instanceof AiScoringError ? err.retryable : true;
    const exhausted = job.attempts >= job.maxAttempts;
    if (retryable && !exhausted) {
      const delayMs = Math.min(10 * 60_000, 30_000 * 2 ** (job.attempts - 1));
      await prisma.aiScoringJob.update({
        where: { id: jobId },
        data: { status: "PENDING", lastError: message, runAfter: new Date(Date.now() + delayMs) },
      });
      log(`retry ${job.lead.companyName} in ${Math.round(delayMs / 1000)}s: ${message}`);
    } else {
      await prisma.$transaction([
        prisma.aiScoringJob.update({ where: { id: jobId }, data: { status: "FAILED", lastError: message } }),
        prisma.lead.update({ where: { id: job.leadId }, data: { aiError: message } }),
      ]);
      log(`failed ${job.lead.companyName}: ${message}`);
    }
  }
}
