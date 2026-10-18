import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { can, type SessionUser } from "@/lib/auth/permissions";

/**
 * Builds a Prisma `where` clause restricting leads to those the user may see.
 *
 * - `leads.view_all`  -> no restriction.
 * - Otherwise: leads assigned to the user are always visible, plus leads they
 *   were notified about (a reply on a lead outside their archive rules), plus
 *   any lead matching at least one LeadAccessRule attached to their role or team.
 *   Within one rule all non-empty filters must match (AND); rules are OR'd.
 * - If the user has `leads.view_archive` but no rules exist for them, they see
 *   the whole archive (rules narrow access; absence of rules means no narrowing).
 */
export async function leadAccessWhere(user: SessionUser): Promise<Prisma.LeadWhereInput> {
  if (can(user, "leads.view_all")) return {};

  const assignedToMe: Prisma.LeadWhereInput = { assignments: { some: { userId: user.id } } };
  const notified = await prisma.notification.findMany({
    where: { userId: user.id, leadId: { not: null } },
    select: { leadId: true },
  });
  const notifiedIds = Array.from(new Set(notified.map((n) => n.leadId).filter((id): id is string => Boolean(id))));
  const visible: Prisma.LeadWhereInput[] = notifiedIds.length ? [assignedToMe, { id: { in: notifiedIds } }] : [assignedToMe];

  if (!can(user, "leads.view_archive")) return visible.length === 1 ? visible[0] : { OR: visible };

  const rules = await prisma.leadAccessRule.findMany({
    where: {
      OR: [{ roleId: user.roleId }, ...(user.teamId ? [{ teamId: user.teamId }] : [])],
    },
  });

  if (rules.length === 0) return {};

  const ruleClauses: Prisma.LeadWhereInput[] = rules.map((r) => {
    const and: Prisma.LeadWhereInput[] = [];
    if (r.sourceIds.length) and.push({ sourceId: { in: r.sourceIds } });
    if (r.industries.length) and.push({ industry: { in: r.industries, mode: "insensitive" } });
    if (r.countries.length) and.push({ country: { in: r.countries, mode: "insensitive" } });
    if (r.tags.length) and.push({ tags: { hasSome: r.tags } });
    if (r.minAiScore != null) and.push({ aiScore: { gte: r.minAiScore } });
    return and.length ? { AND: and } : {};
  });

  // A rule with no filters grants everything.
  if (ruleClauses.some((c) => !c.AND)) return {};

  return { OR: [...visible, ...ruleClauses] };
}

/** True if the user can see this specific lead. */
export async function canAccessLead(user: SessionUser, leadId: string) {
  const where = await leadAccessWhere(user);
  const lead = await prisma.lead.findFirst({ where: { AND: [{ id: leadId }, where] }, select: { id: true } });
  return !!lead;
}
