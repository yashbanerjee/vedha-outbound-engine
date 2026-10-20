import type { EmailDeliveryStatus, EmailDirection, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export const MAIL_LOG_PAGE_SIZE = 50;

export type MailLogKind = "all" | "sent" | "replies" | "failed";

export type MailLogRow = {
  id: string;
  direction: EmailDirection;
  status: EmailDeliveryStatus;
  subject: string;
  fromAddress: string;
  toAddress: string;
  senderName: string | null;
  leadId: string;
  companyName: string;
  error: string | null;
  createdAt: string;
};

export function parseMailLogKind(value: string | undefined): MailLogKind {
  if (value === "sent" || value === "replies" || value === "failed") return value;
  return "all";
}

function kindWhere(kind: MailLogKind): Prisma.EmailMessageWhereInput {
  if (kind === "sent") return { direction: "OUTBOUND", status: "SENT" };
  if (kind === "replies") return { direction: "INBOUND" };
  if (kind === "failed") return { status: "FAILED" };
  return {};
}

export async function getMailLog(input: { kind: MailLogKind; q: string; page: number }) {
  const q = input.q.trim();
  const page = Math.max(1, input.page);
  const where: Prisma.EmailMessageWhereInput = { ...kindWhere(input.kind) };
  if (q) {
    where.OR = [
      { subject: { contains: q, mode: "insensitive" } },
      { fromAddress: { contains: q, mode: "insensitive" } },
      { toAddress: { contains: q, mode: "insensitive" } },
      { lead: { companyName: { contains: q, mode: "insensitive" } } },
      { sentBy: { name: { contains: q, mode: "insensitive" } } },
    ];
  }

  const [total, rows, sent, replies, failed] = await Promise.all([
    prisma.emailMessage.count({ where }),
    prisma.emailMessage.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * MAIL_LOG_PAGE_SIZE,
      take: MAIL_LOG_PAGE_SIZE,
      select: {
        id: true,
        direction: true,
        status: true,
        subject: true,
        fromAddress: true,
        toAddress: true,
        error: true,
        createdAt: true,
        lead: { select: { id: true, companyName: true } },
        sentBy: { select: { name: true } },
      },
    }),
    prisma.emailMessage.count({ where: { direction: "OUTBOUND", status: "SENT" } }),
    prisma.emailMessage.count({ where: { direction: "INBOUND" } }),
    prisma.emailMessage.count({ where: { status: "FAILED" } }),
  ]);

  return {
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / MAIL_LOG_PAGE_SIZE)),
    sent,
    replies,
    failed,
    rows: rows.map(
      (row): MailLogRow => ({
        id: row.id,
        direction: row.direction,
        status: row.status,
        subject: row.subject,
        fromAddress: row.fromAddress,
        toAddress: row.toAddress,
        senderName: row.sentBy?.name ?? null,
        leadId: row.lead.id,
        companyName: row.lead.companyName,
        error: row.error,
        createdAt: row.createdAt.toISOString(),
      }),
    ),
  };
}
