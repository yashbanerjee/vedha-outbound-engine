"use server";

import { revalidatePath } from "next/cache";
import type { LeadStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { assertPermission } from "@/lib/auth/session";
import { fail, ok, safeAction, type ActionResult } from "@/lib/action-result";
import { LEAD_STATUSES, LEAD_STATUS_LABEL } from "@/lib/leads/constants";
import type { StatusLabels } from "@/lib/leads/status-labels";

export async function saveStatusLabelsAction(input: Record<string, string>): Promise<ActionResult> {
  return safeAction(async () => {
    await assertPermission("leads.statuses", "leads.view_all");
    const labels = {} as StatusLabels;
    for (const status of LEAD_STATUSES) {
      const value = (input[status] ?? "").trim();
      if (!value) return fail(`Enter a name for ${LEAD_STATUS_LABEL[status]}.`);
      if (value.length > 40) return fail("Status names must be 40 characters or fewer.");
      labels[status] = value;
    }
    await prisma.leadStatusSettings.upsert({
      where: { id: "default" },
      update: { labels },
      create: { id: "default", labels },
    });
    revalidatePath("/", "layout");
    return ok(undefined, "Status names saved.");
  });
}
