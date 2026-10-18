"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertPermission } from "@/lib/auth/session";
import { fail, ok, safeAction, type ActionResult } from "@/lib/action-result";
import { LEAD_IMPORT_FIELDS, type LeadImportField } from "@/lib/leads/constants";
import { MAP_EXTRA, MAP_SKIP, isLeadField } from "@/lib/leads/auto-map";
import { emptyToNull, normalizeDomain, normalizeEmail, normalizeWebsite, parseTags } from "@/lib/leads/normalize";
import { verifyEmails, type EmailCheck } from "@/lib/leads/email-verify";
import { enqueueScoringJobs, getAiSettings } from "@/lib/ai/queue";

const fieldKeys = LEAD_IMPORT_FIELDS.map((f) => f.key) as [LeadImportField, ...LeadImportField[]];

const importSchema = z.object({
  fileName: z.string().min(1).max(200),
  sourceId: z.string().optional().nullable(),
  tags: z.string().optional(),
  /** CSV header -> lead field, "__extra__" (keep as additional field) or "" (skip) */
  mapping: z.record(z.string(), z.enum(fieldKeys).or(z.literal(MAP_EXTRA)).or(z.literal(MAP_SKIP))),
  rows: z.array(z.record(z.string(), z.string().nullable())).min(1).max(20000),
  autoScore: z.boolean().optional(),
  /** Check every email (syntax, disposable provider, live mail-server lookup). */
  verifyEmails: z.boolean().optional(),
});

export type ImportInput = z.input<typeof importSchema>;

export type ImportSummary = {
  importJobId: string;
  total: number;
  imported: number;
  skippedDuplicates: number;
  skippedInvalid: number;
  errors: { row: number; reason: string }[];
  queuedForAi: number;
  emailsChecked: number;
  emailsInvalid: number;
};

type NormalizedRow = {
  row: number;
  companyName: string;
  website: string | null;
  domain: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  industry: string | null;
  country: string | null;
  city: string | null;
  tags: string[];
  notes: string | null;
  customFields: Record<string, string> | null;
  emailCheck: EmailCheck | null;
  rawData: Record<string, string | null>;
};

/** "Jane" + "Doe" -> "Jane Doe"; avoids doubling when the first column already holds the full name. */
function joinName(first: string | null, last: string | null): string | null {
  if (!first) return last;
  if (!last) return first;
  return first.toLowerCase().split(/\s+/).includes(last.toLowerCase()) ? first : `${first} ${last}`;
}

export async function checkDuplicatesAction(input: { domains: string[]; emails: string[] }): Promise<ActionResult<{ domains: string[]; emails: string[] }>> {
  return safeAction(async () => {
    await assertPermission("leads.import");
    const domains = Array.from(new Set(input.domains.filter(Boolean))).slice(0, 20000);
    const emails = Array.from(new Set(input.emails.filter(Boolean))).slice(0, 20000);
    const [d, e] = await Promise.all([
      domains.length
        ? prisma.lead.findMany({
            where: { domain: { in: domains } },
            select: { domain: true },
          })
        : [],
      emails.length
        ? prisma.lead.findMany({
            where: { email: { in: emails } },
            select: { email: true },
          })
        : [],
    ]);
    return ok({
      domains: d.map((x) => x.domain!).filter(Boolean),
      emails: e.map((x) => x.email!).filter(Boolean),
    });
  });
}

export async function importLeadsAction(input: ImportInput): Promise<ActionResult<ImportSummary>> {
  return safeAction(async () => {
    const user = await assertPermission("leads.import");
    const parsed = importSchema.safeParse(input);
    if (!parsed.success) return fail("Invalid import payload: " + parsed.error.issues[0]?.message);
    const { fileName, sourceId, mapping, rows } = parsed.data;

    const fieldToHeader = new Map<LeadImportField, string>();
    const extraHeaders: string[] = [];
    for (const [header, target] of Object.entries(mapping)) {
      if (isLeadField(target)) fieldToHeader.set(target, header);
      else if (target === MAP_EXTRA) extraHeaders.push(header);
    }
    if (!fieldToHeader.has("companyName")) return fail("Map a column to Company name before importing.");

    const get = (row: Record<string, string | null>, field: LeadImportField) => {
      const h = fieldToHeader.get(field);
      return h ? emptyToNull(row[h]) : null;
    };
    const extrasOf = (row: Record<string, string | null>): Record<string, string> | null => {
      const out: Record<string, string> = {};
      for (const h of extraHeaders) {
        const v = emptyToNull(row[h]);
        if (v !== null) out[h.trim()] = v;
      }
      return Object.keys(out).length ? out : null;
    };

    const extraTags = parseTags(parsed.data.tags);
    const shouldVerify = parsed.data.verifyEmails !== false;
    const errors: { row: number; reason: string }[] = [];
    const normalized: NormalizedRow[] = [];
    const seenDomains = new Set<string>();
    const seenEmails = new Set<string>();
    let skippedDuplicates = 0;
    let skippedInvalid = 0;

    rows.forEach((row, idx) => {
      const rowNo = idx + 2; // 1-based, after header
      const companyName = get(row, "companyName");
      if (!companyName) {
        skippedInvalid++;
        if (errors.length < 50) errors.push({ row: rowNo, reason: "Missing company name" });
        return;
      }
      const website = get(row, "website");
      const domain = normalizeDomain(website);
      const email = normalizeEmail(get(row, "email"));

      if ((domain && seenDomains.has(domain)) || (email && seenEmails.has(email))) {
        skippedDuplicates++;
        return;
      }
      if (domain) seenDomains.add(domain);
      if (email) seenEmails.add(email);

      normalized.push({
        row: rowNo,
        companyName,
        website: normalizeWebsite(website),
        domain,
        contactName: joinName(get(row, "contactName"), get(row, "contactLastName")),
        email,
        phone: get(row, "phone"),
        industry: get(row, "industry"),
        country: get(row, "country"),
        city: get(row, "city"),
        tags: Array.from(new Set([...parseTags(get(row, "tags")), ...extraTags])),
        notes: get(row, "notes"),
        customFields: extrasOf(row),
        emailCheck: null,
        rawData: row,
      });
    });

    // Dedupe against the archive.
    const domains = normalized.map((r) => r.domain).filter((d): d is string => !!d);
    const emails = normalized.map((r) => r.email).filter((e): e is string => !!e);
    const [existingD, existingE] = await Promise.all([
      domains.length
        ? prisma.lead.findMany({
            where: { domain: { in: domains } },
            select: { domain: true },
          })
        : [],
      emails.length
        ? prisma.lead.findMany({
            where: { email: { in: emails } },
            select: { email: true },
          })
        : [],
    ]);
    const existingDomains = new Set(existingD.map((x) => x.domain));
    const existingEmails = new Set(existingE.map((x) => x.email));
    const fresh = normalized.filter((r) => {
      const dup = (r.domain && existingDomains.has(r.domain)) || (r.email && existingEmails.has(r.email));
      if (dup) skippedDuplicates++;
      return !dup;
    });

    let emailsChecked = 0;
    let emailsInvalid = 0;
    if (shouldVerify) {
      const checks = await verifyEmails(fresh.map((r) => r.email).filter((e): e is string => !!e));
      for (const r of fresh) {
        if (!r.email) continue;
        const check = checks.get(r.email);
        if (!check) continue;
        r.emailCheck = check;
        emailsChecked++;
        if (check.status !== "VALID" && check.status !== "UNVERIFIED") emailsInvalid++;
      }
    }

    const job = await prisma.importJob.create({
      data: {
        fileName,
        createdById: user.id,
        sourceId: sourceId || null,
        totalRows: rows.length,
        status: "RUNNING",
      },
    });

    const createdIds: string[] = [];
    const CHUNK = 200;
    try {
      for (let i = 0; i < fresh.length; i += CHUNK) {
        const chunk = fresh.slice(i, i + CHUNK);
        const created = await prisma.$transaction(
          chunk.map((r) =>
            prisma.lead.create({
              data: {
                companyName: r.companyName,
                website: r.website,
                domain: r.domain,
                contactName: r.contactName,
              email: r.email,
              emailStatus: r.emailCheck?.status ?? null,
              emailStatusDetail: r.emailCheck?.detail ?? null,
              emailCheckedAt: r.emailCheck ? new Date() : null,
              phone: r.phone,
                industry: r.industry,
                country: r.country,
                city: r.city,
                tags: r.tags,
                notes: r.notes,
                customFields: r.customFields ?? undefined,
                rawData: r.rawData,
                sourceId: sourceId || null,
                importJobId: job.id,
              },
              select: { id: true },
            }),
          ),
        );
        createdIds.push(...created.map((c) => c.id));
      }
    } catch (err) {
      // Keep whatever was inserted so far, but do not leave the job looking like it is still running.
      await prisma.importJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          importedCount: createdIds.length,
          errors: [
            {
              row: 0,
              reason: err instanceof Error ? err.message.slice(0, 500) : "Import failed",
            },
          ],
        },
      });
      throw err;
    }

    if (createdIds.length) {
      await prisma.leadActivity.createMany({
        data: createdIds.map((leadId) => ({
          leadId,
          userId: user.id,
          type: "IMPORTED" as const,
          message: `Imported from ${fileName}`,
        })),
      });
    }

    await prisma.importJob.update({
      where: { id: job.id },
      data: {
        importedCount: createdIds.length,
        skippedCount: skippedDuplicates,
        errorCount: skippedInvalid,
        errors: errors.length ? errors : undefined,
        status: "DONE",
      },
    });

    let queuedForAi = 0;
    const settings = await getAiSettings();
    const wantsScoring = parsed.data.autoScore ?? settings.autoScoreOnImport;
    if (settings.enabled && wantsScoring && createdIds.length) {
      const withSites = await prisma.lead.findMany({
        where: { id: { in: createdIds }, website: { not: null } },
        select: { id: true },
      });
      queuedForAi = await enqueueScoringJobs(withSites.map((l) => l.id));
    }

    revalidatePath("/archive");
    revalidatePath("/");

    return ok({
      importJobId: job.id,
      total: rows.length,
      imported: createdIds.length,
      skippedDuplicates,
      skippedInvalid,
      errors,
      queuedForAi,
      emailsChecked,
      emailsInvalid,
    });
  });
}
