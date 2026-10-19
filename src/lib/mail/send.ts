import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { htmlToText } from "@/lib/mail/merge";
import { getMailboxCredentials } from "@/lib/mail/settings";
import { getFollowUpDays, nextFollowUpDate } from "@/lib/leads/followups";
import { logActivity } from "@/lib/leads/activity";

type Db = PrismaClient | typeof prisma;

export class MailSendError extends Error {}

function normalizeMessageId(id: string): string {
  return id.replace(/[<>]/g, "").trim().toLowerCase();
}

/**
 * Sends from the shared mailbox and records the message on the lead.
 * The From display name is the employee, the address is the shared one, so
 * replies land back in the inbox the poller reads.
 */
export async function sendLeadEmail(
  db: Db,
  input: { leadId: string; userId: string; userName: string; subject: string; html: string },
): Promise<{ messageId: string }> {
  const mailbox = await getMailboxCredentials(db);
  if (!mailbox) throw new MailSendError("The shared mailbox is not set up yet. An admin needs to connect it under Email.");

  const lead = await db.lead.findUnique({
    where: { id: input.leadId },
    select: { id: true, email: true, companyName: true, status: true, contactedAt: true, followUpStage: true, nextFollowUpAt: true },
  });
  if (!lead) throw new MailSendError("Lead not found.");
  if (!lead.email) throw new MailSendError("This lead has no email address.");

  const domain = mailbox.fromAddress.split("@")[1] || "localhost";
  const messageId = `${randomUUID()}@${domain}`;
  const text = htmlToText(input.html);
  const fromHeader = `${input.userName} <${mailbox.fromAddress}>`;

  const transport = nodemailer.createTransport({
    host: mailbox.smtpHost,
    port: mailbox.smtpPort,
    secure: mailbox.smtpSecure,
    auth: { user: mailbox.username, pass: mailbox.password },
  });

  try {
    await transport.sendMail({
      from: fromHeader,
      to: lead.email,
      replyTo: mailbox.fromAddress,
      subject: input.subject,
      html: input.html,
      text,
      messageId: `<${messageId}>`,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Could not send.";
    await db.emailMessage.create({
      data: {
        leadId: lead.id,
        direction: "OUTBOUND",
        status: "FAILED",
        sentById: input.userId,
        subject: input.subject,
        bodyHtml: input.html,
        bodyText: text,
        fromAddress: mailbox.fromAddress,
        toAddress: lead.email,
        messageId,
        error: reason.slice(0, 500),
      },
    });
    throw new MailSendError(`The mailbox rejected the message: ${reason}`);
  }

  // Best effort: keep the shared mailbox's Sent folder in sync. Sending already succeeded.
  await appendToSent(mailbox, { from: fromHeader, to: lead.email, subject: input.subject, messageId, html: input.html }).catch(() => undefined);

  const days = lead.status === "CONTACTED" && lead.contactedAt && lead.nextFollowUpAt && lead.nextFollowUpAt <= new Date() ? await getFollowUpDays() : null;

  await db.$transaction(async (tx) => {
    await tx.emailMessage.create({
      data: {
        leadId: lead.id,
        direction: "OUTBOUND",
        status: "SENT",
        sentById: input.userId,
        subject: input.subject,
        bodyHtml: input.html,
        bodyText: text,
        fromAddress: mailbox.fromAddress,
        toAddress: lead.email!,
        messageId,
      },
    });
    await logActivity(tx, {
      leadId: lead.id,
      userId: input.userId,
      type: "EMAIL_SENT",
      message: `Emailed ${lead.email}: ${input.subject}`,
    });
    if (days && lead.contactedAt) {
      const completed = lead.followUpStage + 1;
      await tx.lead.update({
        where: { id: lead.id },
        data: { followUpStage: completed, nextFollowUpAt: nextFollowUpDate(lead.contactedAt, days, completed), lastFollowUpAt: new Date() },
      });
      await logActivity(tx, {
        leadId: lead.id,
        userId: input.userId,
        type: "FOLLOW_UP",
        message: `Sent the day-${days[lead.followUpStage]} follow-up email (${completed} of ${days.length}).`,
      });
    }
  });

  return { messageId };
}

async function appendToSent(
  mailbox: { imapHost: string; imapPort: number; imapSecure: boolean; username: string; password: string; sentFolder: string },
  msg: { from: string; to: string; subject: string; messageId: string; html: string },
) {
  const client = new ImapFlow({
    host: mailbox.imapHost,
    port: mailbox.imapPort,
    secure: mailbox.imapSecure,
    auth: { user: mailbox.username, pass: mailbox.password },
    logger: false,
  });
  await client.connect();
  try {
    const raw = Buffer.from(
      [`From: ${msg.from}`, `To: ${msg.to}`, `Subject: ${msg.subject}`, `Message-ID: <${msg.messageId}>`, `Date: ${new Date().toUTCString()}`, `MIME-Version: 1.0`, `Content-Type: text/html; charset=utf-8`, ``, msg.html].join("\r\n"),
    );
    await client.append(mailbox.sentFolder, raw, ["\\Seen"]);
  } finally {
    await client.logout().catch(() => undefined);
  }
}

export { normalizeMessageId };
