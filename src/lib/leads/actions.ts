"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { LeadStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { assertPermission, getCurrentUser } from "@/lib/auth/session";
import { canAccessLead, leadAccessWhere } from "@/lib/auth/lead-access";
import { can } from "@/lib/auth/permissions";
import { fail, ok, safeAction, type ActionResult } from "@/lib/action-result";
import { LEAD_STATUSES } from "@/lib/leads/constants";
import { getStatusLabels } from "@/lib/leads/status-labels";
import { emptyToNull, normalizeDomain, normalizeEmail, normalizeWebsite, parseTags } from "@/lib/leads/normalize";
import { logActivities, logActivity } from "@/lib/leads/activity";
import { enqueueScoringJobs, getAiSettings } from "@/lib/ai/queue";
import { verifyEmails } from "@/lib/leads/email-verify";
import { getFollowUpDays, nextFollowUpDate } from "@/lib/leads/followups";
import { parseWeekKey, weekLabel } from "@/lib/week";

const leadInputSchema = z.object({
  companyName: z.string().trim().min(1, "Company name is required").max(200),
  website: z.string().trim().max(500).optional().or(z.literal("")),
  contactName: z.string().trim().max(200).optional().or(z.literal("")),
  email: z.string().trim().max(200).optional().or(z.literal("")),
  phone: z.string().trim().max(60).optional().or(z.literal("")),
  industry: z.string().trim().max(120).optional().or(z.literal("")),
  country: z.string().trim().max(120).optional().or(z.literal("")),
  city: z.string().trim().max(120).optional().or(z.literal("")),
  tags: z.string().trim().max(500).optional().or(z.literal("")),
  notes: z.string().trim().max(5000).optional().or(z.literal("")),
  sourceId: z.string().trim().optional().or(z.literal("")),
});

function formToObject(formData: FormData) {
  const obj: Record<string, string> = {};
  formData.forEach((v, k) => {
    if (typeof v === "string") obj[k] = v;
  });
  return obj;
}

function revalidateLeadPaths(leadId?: string) {
  revalidatePath("/archive");
  revalidatePath("/my-leads");
  revalidatePath("/follow-ups");
  revalidatePath("/");
  if (leadId) revalidatePath(`/leads/${leadId}`);
}

export async function createLeadAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return safeAction(async () => {
    const user = await assertPermission("leads.create");
    const parsed = leadInputSchema.safeParse(formToObject(formData));
    if (!parsed.success) return fail("Please fix the highlighted fields.", parsed.error.flatten().fieldErrors);
    const d = parsed.data;

    const domain = normalizeDomain(d.website);
    const email = normalizeEmail(d.email);

    if (domain) {
      const dup = await prisma.lead.findUnique({ where: { domain }, select: { id: true, companyName: true } });
      if (dup) return fail(`A lead with the domain ${domain} already exists (${dup.companyName}).`);
    }
    if (email) {
      const dup = await prisma.lead.findFirst({ where: { email }, select: { id: true, companyName: true } });
      if (dup) return fail(`A lead with the email ${email} already exists (${dup.companyName}).`);
    }

    const lead = await prisma.$transaction(async (tx) => {
      const created = await tx.lead.create({
        data: {
          companyName: d.companyName,
          website: normalizeWebsite(d.website),
          domain,
          contactName: emptyToNull(d.contactName),
          email,
          phone: emptyToNull(d.phone),
          industry: emptyToNull(d.industry),
          country: emptyToNull(d.country),
          city: emptyToNull(d.city),
          tags: parseTags(d.tags),
          notes: emptyToNull(d.notes),
          sourceId: emptyToNull(d.sourceId),
        },
      });
      await logActivity(tx, { leadId: created.id, userId: user.id, type: "CREATED", message: "Lead created manually" });
      return created;
    });

    const settings = await getAiSettings();
    if (settings.enabled && settings.autoScoreOnImport && lead.website) await enqueueScoringJobs([lead.id]);

    revalidateLeadPaths(lead.id);
    return ok({ id: lead.id }, "Lead created.");
  });
}

export async function updateLeadAction(leadId: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await assertPermission("leads.edit");
    if (!(await canAccessLead(user, leadId))) return fail("Lead not found.");
    const parsed = leadInputSchema.safeParse(formToObject(formData));
    if (!parsed.success) return fail("Please fix the highlighted fields.", parsed.error.flatten().fieldErrors);
    const d = parsed.data;

    const domain = normalizeDomain(d.website);
    if (domain) {
      const dup = await prisma.lead.findUnique({ where: { domain }, select: { id: true } });
      if (dup && dup.id !== leadId) return fail(`Another lead already uses the domain ${domain}.`);
    }

    await prisma.$transaction(async (tx) => {
      await tx.lead.update({
        where: { id: leadId },
        data: {
          companyName: d.companyName,
          website: normalizeWebsite(d.website),
          domain,
          contactName: emptyToNull(d.contactName),
          email: normalizeEmail(d.email),
          phone: emptyToNull(d.phone),
          industry: emptyToNull(d.industry),
          country: emptyToNull(d.country),
          city: emptyToNull(d.city),
          tags: parseTags(d.tags),
          notes: emptyToNull(d.notes),
          sourceId: emptyToNull(d.sourceId),
        },
      });
      await logActivity(tx, { leadId, userId: user.id, type: "UPDATED", message: "Lead details updated" });
    });

    revalidateLeadPaths(leadId);
    return ok(undefined, "Lead updated.");
  });
}

export async function deleteLeadsAction(leadIds: string[]): Promise<ActionResult<{ count: number }>> {
  return safeAction(async () => {
    const user = await assertPermission("leads.delete");
    const access = await leadAccessWhere(user);
    const result = await prisma.lead.deleteMany({ where: { AND: [{ id: { in: leadIds } }, access] } });
    revalidateLeadPaths();
    return ok({ count: result.count }, `${result.count} lead${result.count === 1 ? "" : "s"} deleted.`);
  });
}

const allocateSchema = z.object({
  leadIds: z.array(z.string()).min(1, "Select at least one lead."),
  userId: z.string().min(1, "Choose a BDE."),
  weekKey: z.string().min(1, "Choose a week."),
  replaceExisting: z.boolean().default(false),
});

export async function allocateLeadsAction(input: z.input<typeof allocateSchema>): Promise<ActionResult<{ count: number }>> {
  return safeAction(async () => {
    const user = await assertPermission("leads.allocate");
    const parsed = allocateSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
    const { leadIds, userId, replaceExisting } = parsed.data;
    const weekStart = parseWeekKey(parsed.data.weekKey);
    if (!weekStart) return fail("Invalid week.");

    const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, isActive: true } });
    if (!target || !target.isActive) return fail("That user is not active.");

    const access = await leadAccessWhere(user);
    const leads = await prisma.lead.findMany({
      where: { AND: [{ id: { in: leadIds } }, access] },
      select: { id: true, assignments: { select: { id: true, userId: true } } },
    });

    let count = 0;
    await prisma.$transaction(async (tx) => {
      const activities: Parameters<typeof logActivities>[1] = [];
      for (const lead of leads) {
        if (replaceExisting) {
          const others = lead.assignments.filter((a) => a.userId !== userId);
          if (others.length) {
            await tx.assignment.deleteMany({ where: { id: { in: others.map((a) => a.id) } } });
          }
        }
        await tx.assignment.upsert({
          where: { leadId_userId: { leadId: lead.id, userId } },
          update: { weekStart, assignedById: user.id, status: "PENDING" },
          create: { leadId: lead.id, userId, weekStart, assignedById: user.id },
        });
        activities.push({
          leadId: lead.id,
          userId: user.id,
          type: "ASSIGNED",
          message: `Assigned to ${target.name} for week of ${weekLabel(weekStart)}`,
          metadata: { assigneeId: userId, weekStart: weekStart.toISOString() },
        });
        count++;
      }
      await logActivities(tx, activities);
    });

    revalidateLeadPaths();
    return ok({ count }, `${count} lead${count === 1 ? "" : "s"} allocated to ${target.name}.`);
  });
}

export async function unassignLeadAction(leadId: string, userId: string): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await assertPermission("leads.allocate");
    if (!(await canAccessLead(user, leadId))) return fail("Lead not found.");
    const assignment = await prisma.assignment.findUnique({
      where: { leadId_userId: { leadId, userId } },
      include: { user: { select: { name: true } } },
    });
    if (!assignment) return fail("Assignment not found.");
    await prisma.$transaction(async (tx) => {
      await tx.assignment.delete({ where: { id: assignment.id } });
      await logActivity(tx, { leadId, userId: user.id, type: "UNASSIGNED", message: `Unassigned from ${assignment.user.name}` });
    });
    revalidateLeadPaths(leadId);
    return ok(undefined, "Assignment removed.");
  });
}

export async function updateLeadStatusAction(leadId: string, status: string): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await assertPermission("leads.update_status");
    if (!LEAD_STATUSES.includes(status as LeadStatus)) return fail("Invalid status.");
    if (!(await canAccessLead(user, leadId))) return fail("Lead not found.");

    const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { status: true, contactedAt: true } });
    if (!lead) return fail("Lead not found.");
    if (lead.status === status) return ok(undefined);

    const next = status as LeadStatus;

    // Entering "Contacted" starts the follow-up cycle. The first contact date is
    // kept, so moving away and back does not restart the schedule.
    let followUpData: { contactedAt?: Date; followUpStage?: number; nextFollowUpAt?: Date | null } = {};
    if (next === "CONTACTED") {
      const contactedAt = lead.contactedAt ?? new Date();
      const days = await getFollowUpDays();
      followUpData = { contactedAt, followUpStage: lead.contactedAt ? undefined : 0, nextFollowUpAt: nextFollowUpDate(contactedAt, days, 0) };
    }

    const labels = await getStatusLabels();
    await prisma.$transaction(async (tx) => {
      await tx.lead.update({ where: { id: leadId }, data: { status: next, ...followUpData } });
      // Keep the assignee's work item in sync.
      const assignmentStatus = next === "NEW" ? "PENDING" : ["WON", "LOST", "NOT_INTERESTED"].includes(next) ? "DONE" : "IN_PROGRESS";
      await tx.assignment.updateMany({ where: { leadId, userId: user.id }, data: { status: assignmentStatus } });
      await logActivity(tx, {
        leadId,
        userId: user.id,
        type: "STATUS_CHANGED",
        message: `Status changed from ${labels[lead.status]} to ${labels[next]}`,
        metadata: { from: lead.status, to: next },
      });
    });

    revalidateLeadPaths(leadId);
    return ok(undefined, `Status set to ${labels[next]}.`);
  });
}

export async function addCommentAction(leadId: string, body: string): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await assertPermission("leads.comment");
    const text = body.trim();
    if (!text) return fail("Comment cannot be empty.");
    if (text.length > 4000) return fail("Comment is too long.");
    if (!(await canAccessLead(user, leadId))) return fail("Lead not found.");

    await prisma.$transaction(async (tx) => {
      await tx.leadComment.create({ data: { leadId, userId: user.id, body: text } });
      await logActivity(tx, { leadId, userId: user.id, type: "COMMENTED", message: "Added a comment" });
    });

    revalidateLeadPaths(leadId);
    return ok(undefined, "Comment added.");
  });
}

export async function scoreLeadsAction(leadIds: string[]): Promise<ActionResult<{ queued: number }>> {
  return safeAction(async () => {
    const user = await assertPermission("ai.score");
    const settings = await getAiSettings();
    if (!settings.enabled) return fail("The AI pre-filter is disabled. Enable it in AI settings.");
    const access = await leadAccessWhere(user);
    const leads = await prisma.lead.findMany({
      where: { AND: [{ id: { in: leadIds } }, access, { website: { not: null } }] },
      select: { id: true },
    });
    const queued = await enqueueScoringJobs(leads.map((l) => l.id));
    const skipped = leadIds.length - leads.length;
    revalidateLeadPaths();
    return ok(
      { queued },
      `${queued} lead${queued === 1 ? "" : "s"} queued for AI scoring${skipped > 0 ? ` (${skipped} skipped: no website)` : ""}.`,
    );
  });
}

/** Record that the current follow-up email was sent and schedule the next one. */
export async function completeFollowUpAction(leadId: string): Promise<ActionResult<{ finished: boolean }>> {
  return safeAction(async () => {
    const user = await assertPermission("leads.update_status");
    if (!(await canAccessLead(user, leadId))) return fail("Lead not found.");

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { status: true, contactedAt: true, followUpStage: true, nextFollowUpAt: true },
    });
    if (!lead || lead.status !== "CONTACTED" || !lead.contactedAt) return fail("This lead is not in the follow-up cycle.");
    if (!lead.nextFollowUpAt || lead.nextFollowUpAt > new Date()) return fail("The next follow-up is not due yet.");

    const days = await getFollowUpDays();
    const completedStage = lead.followUpStage + 1;
    const nextAt = nextFollowUpDate(lead.contactedAt, days, completedStage);
    const which = days[lead.followUpStage];

    await prisma.$transaction(async (tx) => {
      await tx.lead.update({
        where: { id: leadId },
        data: { followUpStage: completedStage, nextFollowUpAt: nextAt, lastFollowUpAt: new Date() },
      });
      await logActivity(tx, {
        leadId,
        userId: user.id,
        type: "FOLLOW_UP",
        message: nextAt
          ? `Sent the day-${which} follow-up email (${completedStage} of ${days.length}).`
          : `Sent the day-${which} follow-up email. Follow-up cycle complete.`,
        metadata: { stage: completedStage, day: which },
      });
    });

    revalidateLeadPaths(leadId);
    return ok({ finished: nextAt === null }, nextAt ? `Follow-up sent. Next one is due in ${days[completedStage] - which} days.` : "Follow-up sent. Cycle complete.");
  });
}

/** Re-run the email check (syntax, disposable provider, live mail-server lookup) for existing leads. */
export async function verifyLeadEmailsAction(leadIds: string[]): Promise<ActionResult<{ checked: number; invalid: number }>> {
  return safeAction(async () => {
    const user = await assertPermission("leads.edit");
    const access = await leadAccessWhere(user);
    const leads = await prisma.lead.findMany({
      where: { AND: [{ id: { in: leadIds.slice(0, 5000) } }, access, { email: { not: null } }] },
      select: { id: true, email: true },
    });
    const checks = await verifyEmails(leads.map((l) => l.email!));
    const now = new Date();
    let invalid = 0;
    await prisma.$transaction(
      leads.map((l) => {
        const check = checks.get(l.email!.trim().toLowerCase())!;
        if (check.status !== "VALID" && check.status !== "DOMAIN" && check.status !== "UNVERIFIED") invalid++;
        return prisma.lead.update({
          where: { id: l.id },
          data: { emailStatus: check.status, emailStatusDetail: check.detail, emailCheckedAt: now },
        });
      }),
    );
    revalidateLeadPaths();
    const skipped = leadIds.length - leads.length;
    return ok(
      { checked: leads.length, invalid },
      `Checked ${leads.length} email${leads.length === 1 ? "" : "s"}: ${invalid} look undeliverable${skipped > 0 ? ` (${skipped} skipped: no email)` : ""}.`,
    );
  });
}

export async function getMySessionPermissions() {
  const user = await getCurrentUser();
  return { canAllocate: can(user, "leads.allocate"), canScore: can(user, "ai.score"), canDelete: can(user, "leads.delete") };
}
