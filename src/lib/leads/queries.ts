import type { AiVerdict, LeadStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { leadAccessWhere } from "@/lib/auth/lead-access";
import type { SessionUser } from "@/lib/auth/permissions";
import { AI_VERDICTS, LEAD_STATUSES } from "@/lib/leads/constants";

export const PAGE_SIZE = 50;

export type ArchiveFilters = {
  q?: string;
  status?: string;
  source?: string;
  verdict?: string;
  industry?: string;
  country?: string;
  assigned?: string; // "yes" | "no"
  minScore?: string;
  sort?: string; // "newest" | "oldest" | "score" | "company"
  page?: string;
};

export function parseArchiveFilters(sp: Record<string, string | string[] | undefined>): ArchiveFilters {
  const pick = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
  return {
    q: pick("q"),
    status: pick("status"),
    source: pick("source"),
    verdict: pick("verdict"),
    industry: pick("industry"),
    country: pick("country"),
    assigned: pick("assigned"),
    minScore: pick("minScore"),
    sort: pick("sort"),
    page: pick("page"),
  };
}

export function buildArchiveWhere(f: ArchiveFilters): Prisma.LeadWhereInput {
  const and: Prisma.LeadWhereInput[] = [];

  if (f.q?.trim()) {
    const q = f.q.trim();
    and.push({
      OR: [
        { companyName: { contains: q, mode: "insensitive" } },
        { domain: { contains: q, mode: "insensitive" } },
        { contactName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { tags: { has: q } },
      ],
    });
  }
  if (f.status && LEAD_STATUSES.includes(f.status as LeadStatus)) and.push({ status: f.status as LeadStatus });
  if (f.source) and.push(f.source === "none" ? { sourceId: null } : { sourceId: f.source });
  if (f.verdict) {
    if (f.verdict === "unscored") and.push({ aiScoredAt: null });
    else if (AI_VERDICTS.includes(f.verdict as AiVerdict)) and.push({ aiVerdict: f.verdict as AiVerdict });
  }
  if (f.industry) and.push({ industry: { equals: f.industry, mode: "insensitive" } });
  if (f.country) and.push({ country: { equals: f.country, mode: "insensitive" } });
  if (f.assigned === "yes") and.push({ assignments: { some: {} } });
  if (f.assigned === "no") and.push({ assignments: { none: {} } });
  const min = Number(f.minScore);
  if (f.minScore && Number.isFinite(min)) and.push({ aiScore: { gte: min } });

  return and.length ? { AND: and } : {};
}

export function archiveOrderBy(sort?: string): Prisma.LeadOrderByWithRelationInput[] {
  switch (sort) {
    case "oldest":
      return [{ createdAt: "asc" }];
    case "score":
      return [{ aiScore: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }];
    case "company":
      return [{ companyName: "asc" }];
    default:
      return [{ createdAt: "desc" }];
  }
}

export const archiveLeadSelect = {
  id: true,
  companyName: true,
  website: true,
  domain: true,
  contactName: true,
  email: true,
  emailStatus: true,
  emailStatusDetail: true,
  industry: true,
  country: true,
  city: true,
  tags: true,
  status: true,
  aiScore: true,
  aiVerdict: true,
  aiScoredAt: true,
  createdAt: true,
  source: { select: { id: true, name: true } },
  assignments: {
    select: { id: true, weekStart: true, status: true, user: { select: { id: true, name: true } } },
    orderBy: { weekStart: "desc" as const },
    take: 3,
  },
  aiJobs: { where: { status: { in: ["PENDING", "RUNNING"] } }, select: { id: true }, take: 1 },
} satisfies Prisma.LeadSelect;

export type ArchiveLead = Prisma.LeadGetPayload<{ select: typeof archiveLeadSelect }>;

export async function getArchiveLeads(user: SessionUser, filters: ArchiveFilters) {
  const access = await leadAccessWhere(user);
  const where: Prisma.LeadWhereInput = { AND: [access, buildArchiveWhere(filters)] };
  const page = Math.max(1, Number(filters.page) || 1);

  const [total, leads] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.findMany({
      where,
      select: archiveLeadSelect,
      orderBy: archiveOrderBy(filters.sort),
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  return { leads, total, page, pageSize: PAGE_SIZE, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** Returns every lead id matching the filters (used by "select all matching"). */
export async function getArchiveLeadIds(user: SessionUser, filters: ArchiveFilters, limit = 5000) {
  const access = await leadAccessWhere(user);
  const rows = await prisma.lead.findMany({
    where: { AND: [access, buildArchiveWhere(filters)] },
    select: { id: true },
    take: limit,
  });
  return rows.map((r) => r.id);
}

export async function getArchiveFilterOptions(user: SessionUser) {
  const access = await leadAccessWhere(user);
  const [sources, industries, countries] = await Promise.all([
    prisma.leadSource.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.lead.findMany({
      where: { AND: [access, { industry: { not: null } }] },
      distinct: ["industry"],
      select: { industry: true },
      orderBy: { industry: "asc" },
      take: 200,
    }),
    prisma.lead.findMany({
      where: { AND: [access, { country: { not: null } }] },
      distinct: ["country"],
      select: { country: true },
      orderBy: { country: "asc" },
      take: 200,
    }),
  ]);
  return {
    sources,
    industries: industries.map((i) => i.industry!).filter(Boolean),
    countries: countries.map((c) => c.country!).filter(Boolean),
  };
}

export async function getAssignableUsers() {
  return prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, email: true, team: { select: { id: true, name: true } }, role: { select: { name: true } } },
    orderBy: [{ team: { name: "asc" } }, { name: "asc" }],
  });
}
