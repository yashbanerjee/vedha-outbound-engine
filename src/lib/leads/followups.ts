import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export const DEFAULT_FOLLOW_UP_DAYS = [3, 5, 10];
export const MAX_FOLLOW_UP_STAGES = 6;

/** The configured follow-up schedule, in days after the lead was first contacted. */
export async function getFollowUpDays(): Promise<number[]> {
  const settings = await prisma.aiSettings.findUnique({ where: { id: "default" }, select: { followUpDays: true } });
  const days = (settings?.followUpDays ?? DEFAULT_FOLLOW_UP_DAYS).filter((d) => Number.isInteger(d) && d >= 1 && d <= 365);
  return days.length ? days : DEFAULT_FOLLOW_UP_DAYS;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** When the follow-up after `completedStage` becomes due. `null` once the cycle is finished. */
export function nextFollowUpDate(contactedAt: Date, days: number[], completedStage: number): Date | null {
  const day = days[completedStage];
  if (day == null) return null;
  return new Date(contactedAt.getTime() + day * DAY_MS);
}

export type FollowUpBucket = "due" | "upcoming" | "done";

/**
 * Leads in the follow-up cycle: status is still Contacted and a contact date is set.
 * - due: the next follow-up email should go out now
 * - upcoming: contacted, but the next follow-up is not due yet
 * - done: every configured follow-up has been sent
 */
export function followUpWhere(bucket: FollowUpBucket, now = new Date()): Prisma.LeadWhereInput {
  const base: Prisma.LeadWhereInput = { status: "CONTACTED", contactedAt: { not: null } };
  if (bucket === "due") return { ...base, nextFollowUpAt: { lte: now } };
  if (bucket === "upcoming") return { ...base, nextFollowUpAt: { gt: now } };
  return { ...base, nextFollowUpAt: null };
}

export const followUpLeadSelect = {
  id: true,
  companyName: true,
  domain: true,
  website: true,
  contactName: true,
  email: true,
  emailStatus: true,
  emailStatusDetail: true,
  industry: true,
  country: true,
  contactedAt: true,
  followUpStage: true,
  nextFollowUpAt: true,
  lastFollowUpAt: true,
  assignments: { select: { user: { select: { id: true, name: true } } } },
} satisfies Prisma.LeadSelect;

export type FollowUpLead = Prisma.LeadGetPayload<{ select: typeof followUpLeadSelect }>;

/** Whole days from now until `date` (negative when overdue). */
export function daysUntil(date: Date, now = new Date()): number {
  return Math.ceil((date.getTime() - now.getTime()) / DAY_MS);
}

/** "1st", "2nd", "3rd", "4th"... */
export function ordinal(n: number): string {
  const suffix = n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th";
  return `${n}${suffix}`;
}
