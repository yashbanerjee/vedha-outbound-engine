import type { LeadStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { LEAD_STATUSES, LEAD_STATUS_LABEL } from "@/lib/leads/constants";

export type StatusLabels = Record<LeadStatus, string>;

/** Saved display names, filled in with the built-in words when a label is blank. */
export async function getStatusLabels(): Promise<StatusLabels> {
  const row = await prisma.leadStatusSettings.findUnique({ where: { id: "default" } });
  const labels: StatusLabels = { ...LEAD_STATUS_LABEL };
  const stored = row?.labels;
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return labels;
  for (const status of LEAD_STATUSES) {
    const value = (stored as Record<string, unknown>)[status];
    if (typeof value === "string" && value.trim()) labels[status] = value.trim();
  }
  return labels;
}
