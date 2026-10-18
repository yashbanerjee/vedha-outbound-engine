"use server";

import { revalidatePath } from "next/cache";
import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertPermission, requireUser } from "@/lib/auth/session";
import { canAccessLead } from "@/lib/auth/lead-access";
import { fail, ok, safeAction, type ActionResult } from "@/lib/action-result";
import { encryptSecret, decryptSecret } from "@/lib/mail/crypto";
import { htmlToText, sanitizeEmailHtml } from "@/lib/mail/merge";
import { getMailSettings } from "@/lib/mail/settings";
import { MailSendError, sendLeadEmail } from "@/lib/mail/send";
import { pollInbox } from "@/lib/mail/poll";

const mailboxSchema = z.object({
  enabled: z.boolean(),
  fromAddress: z.string().trim().max(200),
  fromName: z.string().trim().max(120),
  smtpHost: z.string().trim().max(200),
  smtpPort: z.coerce.number().int().min(1).max(65535),
  smtpSecure: z.boolean(),
  imapHost: z.string().trim().max(200),
  imapPort: z.coerce.number().int().min(1).max(65535),
  imapSecure: z.boolean(),
  username: z.string().trim().max(200),
  password: z.string().max(500).optional(),
  sentFolder: z.string().trim().max(200),
});

export type MailboxInput = z.input<typeof mailboxSchema>;

function revalidateMail() {
  revalidatePath("/admin/email");
  revalidatePath("/follow-ups");
}

export async function saveMailboxAction(input: MailboxInput): Promise<ActionResult> {
  return safeAction(async () => {
    await assertPermission("email.manage");
    const parsed = mailboxSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0].message);
    const data = parsed.data;

    if (data.enabled && (!data.fromAddress || !data.smtpHost || !data.imapHost || !data.username || !data.sentFolder)) {
      return fail("Host, username, from address and sent folder are all required to turn sending on.");
    }
    if (data.fromAddress && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.fromAddress)) return fail("The from address is not a valid email.");

    const existing = await getMailSettings();
    let passwordEnc = existing.passwordEnc;
    if (data.password && data.password.trim()) passwordEnc = encryptSecret(data.password.trim());
    if (data.enabled && !passwordEnc) return fail("Enter the mailbox password. For Gmail and Microsoft 365 this is an app password.");

    await prisma.mailSettings.update({
      where: { id: "default" },
      data: {
        enabled: data.enabled,
        fromAddress: data.fromAddress,
        fromName: data.fromName,
        smtpHost: data.smtpHost,
        smtpPort: data.smtpPort,
        smtpSecure: data.smtpSecure,
        imapHost: data.imapHost,
        imapPort: data.imapPort,
        imapSecure: data.imapSecure,
        username: data.username,
        passwordEnc,
        sentFolder: data.sentFolder || "Sent",
        // Connection details changed, so the old inbox cursor no longer applies.
        ...(existing.imapHost !== data.imapHost || existing.username !== data.username ? { lastImapUid: null, imapUidValidity: null } : {}),
      },
    });
    revalidateMail();
    return ok(undefined, "Mailbox saved.");
  });
}

/** Checks the details typed into the form, before or after saving. */
export async function testMailboxAction(input: MailboxInput): Promise<ActionResult<{ smtp: string; imap: string }>> {
  return safeAction(async () => {
    await assertPermission("email.manage");
    const parsed = mailboxSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0].message);
    const data = parsed.data;
    if (!data.smtpHost || !data.imapHost || !data.username) return fail("Fill in the host and username first.");

    let password = data.password?.trim() ?? "";
    if (!password) {
      const existing = await getMailSettings();
      if (!existing.passwordEnc) return fail("Enter the mailbox password to test the connection.");
      password = decryptSecret(existing.passwordEnc);
    }

    const transport = nodemailer.createTransport({
      host: data.smtpHost,
      port: data.smtpPort,
      secure: data.smtpSecure,
      auth: { user: data.username, pass: password },
    });
    try {
      await transport.verify();
    } catch (err) {
      return fail(`Sending failed: ${err instanceof Error ? err.message : "could not connect"}.`);
    }

    const client = new ImapFlow({
      host: data.imapHost,
      port: data.imapPort,
      secure: data.imapSecure,
      auth: { user: data.username, pass: password },
      logger: false,
    });
    try {
      await client.connect();
      await client.logout();
    } catch (err) {
      return fail(`Sending works, but reading the inbox failed: ${err instanceof Error ? err.message : "could not connect"}.`);
    }

    return ok({ smtp: "ok", imap: "ok" }, "Connected. Sending and inbox reading both work.");
  });
}

export async function checkRepliesNowAction(): Promise<ActionResult<{ imported: number }>> {
  return safeAction(async () => {
    await assertPermission("email.manage");
    const result = await pollInbox(prisma);
    revalidatePath("/notifications");
    if (result.error) return fail(result.error);
    return ok({ imported: result.imported }, result.imported ? `${result.imported} new repl${result.imported === 1 ? "y" : "ies"} filed.` : "No new replies.");
  });
}

const templateSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Name the template.").max(80),
  subject: z.string().trim().min(1, "Add a subject.").max(200),
  bodyHtml: z.string().trim().min(1, "Write the email body.").max(200_000),
});

export async function saveTemplateAction(input: z.input<typeof templateSchema>): Promise<ActionResult> {
  return safeAction(async () => {
    await assertPermission("email.manage");
    const parsed = templateSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0].message);
    const data = { ...parsed.data, bodyHtml: sanitizeEmailHtml(parsed.data.bodyHtml) };
    if (data.id) {
      await prisma.emailTemplate.update({ where: { id: data.id }, data: { name: data.name, subject: data.subject, bodyHtml: data.bodyHtml } });
    } else {
      await prisma.emailTemplate.create({ data: { name: data.name, subject: data.subject, bodyHtml: data.bodyHtml } });
    }
    revalidateMail();
    return ok(undefined, "Template saved.");
  });
}

export async function deleteTemplateAction(id: string): Promise<ActionResult> {
  return safeAction(async () => {
    await assertPermission("email.manage");
    await prisma.emailTemplate.delete({ where: { id } });
    revalidateMail();
    return ok(undefined, "Template deleted.");
  });
}

export async function sendLeadEmailAction(leadId: string, subject: string, html: string): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await assertPermission("email.send");
    if (!(await canAccessLead(user, leadId))) return fail("Lead not found.");
    const cleanSubject = subject.trim().slice(0, 200);
    const cleanHtml = sanitizeEmailHtml(html).slice(0, 200_000);
    if (!cleanSubject) return fail("Add a subject.");
    if (!htmlToText(cleanHtml)) return fail("Write a message before sending.");

    try {
      await sendLeadEmail(prisma, { leadId, userId: user.id, userName: user.name, subject: cleanSubject, html: cleanHtml });
    } catch (err) {
      if (err instanceof MailSendError) return fail(err.message);
      throw err;
    }
    revalidatePath(`/leads/${leadId}`);
    revalidatePath("/follow-ups");
    return ok(undefined, "Email sent.");
  });
}

export async function markNotificationsReadAction(id?: string): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireUser();
    await prisma.notification.updateMany({
      where: { userId: user.id, readAt: null, ...(id ? { id } : {}) },
      data: { readAt: new Date() },
    });
    revalidatePath("/", "layout");
    return ok(undefined);
  });
}
