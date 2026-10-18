"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertPermission } from "@/lib/auth/session";
import { fail, ok, safeAction, type ActionResult } from "@/lib/action-result";
import { getAiSettings } from "@/lib/ai/queue";
import { AiScoringError, scoreLeadWebsite, type ScoreResult } from "@/lib/ai/score-lead";
import { normalizeWebsite } from "@/lib/leads/normalize";

const settingsSchema = z
  .object({
    enabled: z.boolean(),
    model: z.string().trim().min(1).max(80),
    idealCustomerProfile: z.string().trim().max(6000),
    scoringCriteria: z.string().trim().max(6000),
    goodThreshold: z.coerce.number().int().min(1).max(100),
    badThreshold: z.coerce.number().int().min(0).max(99),
    autoScoreOnImport: z.boolean(),
    maxChars: z.coerce.number().int().min(1000).max(30000),
    maxPages: z.coerce.number().int().min(1).max(5),
  })
  .refine((s) => s.badThreshold < s.goodThreshold, { message: "The 'poor fit' threshold must be lower than the 'good fit' threshold.", path: ["badThreshold"] });

export type AiSettingsInput = z.input<typeof settingsSchema>;

const followUpSchema = z
  .array(z.coerce.number().int().min(1, "Each follow-up must be at least 1 day.").max(365))
  .min(1, "Add at least one follow-up.")
  .max(6, "Six follow-ups is the maximum.")
  .refine((days) => days.every((d, i) => i === 0 || d > days[i - 1]), { message: "Each follow-up must be more days after contact than the one before it." });

/** The follow-up schedule: days after a lead is marked Contacted. */
export async function saveFollowUpSettingsAction(days: number[]): Promise<ActionResult> {
  return safeAction(async () => {
    await assertPermission("ai.settings");
    const parsed = followUpSchema.safeParse(days);
    if (!parsed.success) return fail(parsed.error.issues[0].message);

    await prisma.aiSettings.upsert({
      where: { id: "default" },
      update: { followUpDays: parsed.data },
      create: { id: "default", followUpDays: parsed.data },
    });

    // Re-schedule leads that are still waiting, so the new timing applies immediately.
    // Leads with a follow-up already due are left alone so nobody misses one.
    const waiting = await prisma.lead.findMany({
      where: { status: "CONTACTED", contactedAt: { not: null }, nextFollowUpAt: { gt: new Date() } },
      select: { id: true, contactedAt: true, followUpStage: true },
    });
    const day = 24 * 60 * 60 * 1000;
    await prisma.$transaction(
      waiting.flatMap((l) => {
        const offset = parsed.data[l.followUpStage];
        if (offset == null || !l.contactedAt) return [];
        return [prisma.lead.update({ where: { id: l.id }, data: { nextFollowUpAt: new Date(l.contactedAt.getTime() + offset * day) } })];
      }),
    );

    revalidatePath("/admin/ai-settings");
    revalidatePath("/follow-ups");
    return ok(undefined, "Follow-up schedule saved.");
  });
}

export async function saveAiSettingsAction(input: AiSettingsInput): Promise<ActionResult> {
  return safeAction(async () => {
    await assertPermission("ai.settings");
    const parsed = settingsSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0].message, parsed.error.flatten().fieldErrors);
    await prisma.aiSettings.upsert({ where: { id: "default" }, update: parsed.data, create: { id: "default", ...parsed.data } });
    revalidatePath("/admin/ai-settings");
    revalidatePath("/archive");
    return ok(undefined, "AI settings saved.");
  });
}

export type TestScoreResult = ScoreResult & { durationMs: number };

/** Scores an arbitrary URL with the given (possibly unsaved) settings. Does not touch any lead. */
export async function testScoreAction(url: string, draft: AiSettingsInput): Promise<ActionResult<TestScoreResult>> {
  return safeAction(async () => {
    await assertPermission("ai.settings");
    const website = normalizeWebsite(url);
    if (!website) return fail("Enter a website URL to test.");
    const parsed = settingsSchema.safeParse(draft);
    if (!parsed.success) return fail(parsed.error.issues[0].message);
    const saved = await getAiSettings();
    const settings = { ...saved, ...parsed.data };

    const started = Date.now();
    try {
      let host = website;
      try {
        host = new URL(website).hostname.replace(/^www\./, "");
      } catch {}
      const result = await scoreLeadWebsite({ companyName: host, website }, settings);
      return ok({ ...result, durationMs: Date.now() - started });
    } catch (err) {
      if (err instanceof AiScoringError) return fail(err.message);
      throw err;
    }
  });
}

export async function retryFailedJobsAction(): Promise<ActionResult<{ count: number }>> {
  return safeAction(async () => {
    await assertPermission("ai.settings");
    const res = await prisma.aiScoringJob.updateMany({
      where: { status: "FAILED" },
      data: { status: "PENDING", attempts: 0, runAfter: new Date(), lastError: null },
    });
    revalidatePath("/admin/ai-settings");
    return ok({ count: res.count }, `${res.count} failed job${res.count === 1 ? "" : "s"} re-queued.`);
  });
}

export async function scoreAllUnscoredAction(): Promise<ActionResult<{ count: number }>> {
  return safeAction(async () => {
    await assertPermission("ai.settings");
    const settings = await getAiSettings();
    if (!settings.enabled) return fail("Enable the AI pre-filter first.");
    const leads = await prisma.lead.findMany({
      where: { website: { not: null }, aiScoredAt: null, aiJobs: { none: { status: { in: ["PENDING", "RUNNING"] } } } },
      select: { id: true },
      take: 5000,
    });
    if (leads.length === 0) return ok({ count: 0 }, "Every lead with a website is already scored or queued.");
    await prisma.aiScoringJob.createMany({ data: leads.map((l) => ({ leadId: l.id })) });
    revalidatePath("/admin/ai-settings");
    revalidatePath("/archive");
    return ok({ count: leads.length }, `${leads.length} lead${leads.length === 1 ? "" : "s"} queued for scoring.`);
  });
}
