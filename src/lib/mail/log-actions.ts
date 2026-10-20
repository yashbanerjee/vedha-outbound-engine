"use server";

import { prisma } from "@/lib/db";
import { assertPermission } from "@/lib/auth/session";
import { fail, ok, safeAction, type ActionResult } from "@/lib/action-result";

export type MailLogMessage = {
  id: string;
  direction: "OUTBOUND" | "INBOUND";
  status: "SENT" | "FAILED" | "RECEIVED";
  subject: string;
  bodyHtml: string;
  bodyText: string;
  fromAddress: string;
  toAddress: string;
  senderName: string | null;
  companyName: string;
  leadId: string;
  error: string | null;
  createdAt: string;
};

export async function getMailLogMessageAction(id: string): Promise<ActionResult<MailLogMessage>> {
  return safeAction(async () => {
    await assertPermission("email.manage");
    const row = await prisma.emailMessage.findUnique({
      where: { id },
      select: {
        id: true,
        direction: true,
        status: true,
        subject: true,
        bodyHtml: true,
        bodyText: true,
        fromAddress: true,
        toAddress: true,
        error: true,
        createdAt: true,
        lead: { select: { id: true, companyName: true } },
        sentBy: { select: { name: true } },
      },
    });
    if (!row) return fail("That email is no longer in the log.");
    return ok({
      id: row.id,
      direction: row.direction,
      status: row.status,
      subject: row.subject,
      bodyHtml: row.bodyHtml,
      bodyText: row.bodyText,
      fromAddress: row.fromAddress,
      toAddress: row.toAddress,
      senderName: row.sentBy?.name ?? null,
      companyName: row.lead.companyName,
      leadId: row.lead.id,
      error: row.error,
      createdAt: row.createdAt.toISOString(),
    });
  });
}
