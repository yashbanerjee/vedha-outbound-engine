import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { getAiSettings } from "@/lib/ai/queue";
import { PageHeader } from "@/components/page-header";
import { AiSettingsForm } from "./ai-settings-form";
import { FollowUpSettings } from "./followup-settings";
import { QueueStatus } from "./queue-status";

export const dynamic = "force-dynamic";

export default async function AiSettingsPage() {
  await requirePermission("ai.settings");
  const [settings, jobCounts, scored, verdicts, recentFailures] = await Promise.all([
    getAiSettings(),
    prisma.aiScoringJob.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.lead.count({ where: { aiScoredAt: { not: null } } }),
    prisma.lead.groupBy({ by: ["aiVerdict"], _count: { _all: true }, where: { aiVerdict: { not: null } } }),
    prisma.aiScoringJob.findMany({
      where: { status: "FAILED" },
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: { lead: { select: { id: true, companyName: true, website: true } } },
    }),
  ]);

  const count = (s: string) => jobCounts.find((j) => j.status === s)?._count._all ?? 0;
  const verdictCount = (v: string) => verdicts.find((x) => x.aiVerdict === v)?._count._all ?? 0;

  return (
    <>
      <PageHeader
        title="AI pre-filter"
        description="A small language model reads each lead's website and scores it against your ideal customer profile. Tune the criteria here."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <AiSettingsForm
          initial={{
            enabled: settings.enabled,
            model: settings.model,
            idealCustomerProfile: settings.idealCustomerProfile,
            scoringCriteria: settings.scoringCriteria,
            goodThreshold: settings.goodThreshold,
            badThreshold: settings.badThreshold,
            autoScoreOnImport: settings.autoScoreOnImport,
            maxChars: settings.maxChars,
            maxPages: settings.maxPages,
          }}
          hasApiKey={!!process.env.OPENAI_API_KEY}
        />
        <QueueStatus
          pending={count("PENDING")}
          running={count("RUNNING")}
          done={count("DONE")}
          failed={count("FAILED")}
          scored={scored}
          good={verdictCount("GOOD")}
          maybe={verdictCount("MAYBE")}
          bad={verdictCount("BAD")}
          recentFailures={recentFailures.map((f) => ({
            id: f.id,
            leadId: f.lead.id,
            companyName: f.lead.companyName,
            error: f.lastError ?? "Unknown error",
          }))}
        />
      </div>
      <div className="mt-6">
        <FollowUpSettings initialDays={settings.followUpDays} />
      </div>
    </>
  );
}
