import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/mail/crypto";
import { htmlToText } from "@/lib/mail/merge";
import { normalizeMessageId } from "@/lib/mail/send";

type Db = PrismaClient | typeof prisma;

export type PollResult = { imported: number; scanned: number; error?: string };

/**
 * Reads new mail from the shared inbox and files replies against the lead they
 * belong to. The first run looks back to the first email sent from here, so a
 * reply that arrived before the checker started is still filed. Older mail
 * that is not a reply to one of those emails is left alone.
 */
export async function pollInbox(db: Db, log: (message: string) => void = () => undefined): Promise<PollResult> {
  const settings = await db.mailSettings.findUnique({ where: { id: "default" } });
  if (!settings?.enabled || !settings.passwordEnc || !settings.imapHost || !settings.username) return { imported: 0, scanned: 0 };

  let password: string;
  try {
    password = decryptSecret(settings.passwordEnc);
  } catch (err) {
    const error = err instanceof Error ? err.message : "Could not read the saved mailbox password.";
    await db.mailSettings.update({ where: { id: "default" }, data: { lastPollError: error, lastPolledAt: new Date() } });
    return { imported: 0, scanned: 0, error };
  }

  const client = new ImapFlow({
    host: settings.imapHost,
    port: settings.imapPort,
    secure: settings.imapSecure,
    auth: { user: settings.username, pass: password },
    logger: false,
  });
  // A dropped connection emits "error". Without a listener that kills the worker.
  client.on("error", (err) => {
    log(`mail: ${err instanceof Error ? err.message : String(err)}`);
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const box = client.mailbox;
      if (!box) throw new Error("Could not open the inbox.");
      const validity = String(box.uidValidity);
      const uidNext = box.uidNext;
      const own = new Set([settings.fromAddress.toLowerCase(), settings.username.toLowerCase()]);

      // UIDs are only meaningful within one uidValidity. On the first connect, catch replies to mail we already sent.
      if (settings.lastImapUid == null || settings.imapUidValidity !== validity) {
        const caught = await catchUpReplies(db, client, validity, own, log);
        await db.mailSettings.update({
          where: { id: "default" },
          data: { lastImapUid: Math.max(0, uidNext - 1), imapUidValidity: validity, lastPolledAt: new Date(), lastPollError: null },
        });
        return caught;
      }

      const start = settings.lastImapUid + 1;
      if (start >= uidNext) {
        await db.mailSettings.update({ where: { id: "default" }, data: { lastPolledAt: new Date(), lastPollError: null } });
        return { imported: 0, scanned: 0 };
      }

      let maxUid = settings.lastImapUid;
      let imported = 0;
      let scanned = 0;

      for await (const msg of client.fetch(`${start}:*`, { uid: true, source: true }, { uid: true })) {
        scanned++;
        if (msg.uid > maxUid) maxUid = msg.uid;
        if (!msg.source) continue;
        try {
          if (await fileReply(db, msg.source, `imap-${validity}-${msg.uid}`, own)) imported++;
        } catch (err) {
          log(`mail: skipped uid ${msg.uid}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      await db.mailSettings.update({
        where: { id: "default" },
        data: { lastImapUid: maxUid, lastPolledAt: new Date(), lastPollError: null },
      });
      if (imported) log(`mail: filed ${imported} repl${imported === 1 ? "y" : "ies"}`);
      return { imported, scanned };
    } finally {
      lock.release();
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : "Could not read the inbox.";
    await db.mailSettings.update({ where: { id: "default" }, data: { lastPollError: error.slice(0, 500), lastPolledAt: new Date() } }).catch(() => undefined);
    log(`mail: ${error}`);
    return { imported: 0, scanned: 0, error };
  } finally {
    await client.logout().catch(() => undefined);
  }
}

async function catchUpReplies(db: Db, client: ImapFlow, validity: string, own: Set<string>, log: (message: string) => void): Promise<PollResult> {
  const first = await db.emailMessage.findFirst({
    where: { direction: "OUTBOUND", status: "SENT" },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });
  if (!first) return { imported: 0, scanned: 0 };

  const since = new Date(first.createdAt.getTime() - 24 * 60 * 60 * 1000);
  const found = await client.search({ since }, { uid: true });
  const uids = Array.isArray(found) ? found : [];
  if (uids.length === 0) return { imported: 0, scanned: 0 };

  let imported = 0;
  let scanned = 0;
  for await (const msg of client.fetch(uids, { uid: true, source: true }, { uid: true })) {
    scanned++;
    if (!msg.source) continue;
    try {
      if (await fileReply(db, msg.source, `imap-${validity}-${msg.uid}`, own)) imported++;
    } catch (err) {
      log(`mail: skipped uid ${msg.uid}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (imported) log(`mail: filed ${imported} repl${imported === 1 ? "y" : "ies"}`);
  return { imported, scanned };
}

async function fileReply(db: Db, source: Buffer, fallbackId: string, ownAddresses: Set<string>): Promise<boolean> {
  const parsed = await simpleParser(source);
  const from = parsed.from?.value?.[0]?.address?.toLowerCase();
  if (!from || ownAddresses.has(from)) return false;

  const references = parsed.references;
  const referenceIds = Array.isArray(references) ? references : references ? [references] : [];
  const headerIds = [parsed.inReplyTo, ...referenceIds]
    .filter((id): id is string => typeof id === "string" && id.length > 0)
    .map(normalizeMessageId);

  let leadId: string | null = null;
  if (headerIds.length) {
    const prior = await db.emailMessage.findFirst({ where: { messageId: { in: headerIds } }, select: { leadId: true } });
    leadId = prior?.leadId ?? null;
  }
  if (!leadId) {
    const candidates = await db.lead.findMany({
      where: { email: { equals: from, mode: "insensitive" } },
      select: { id: true },
      orderBy: { updatedAt: "desc" },
      take: 5,
    });
    if (candidates.length === 1) leadId = candidates[0].id;
    else if (candidates.length > 1) {
      const threaded = await db.emailMessage.findFirst({
        where: { leadId: { in: candidates.map((c) => c.id) }, direction: "OUTBOUND" },
        orderBy: { createdAt: "desc" },
        select: { leadId: true },
      });
      leadId = threaded?.leadId ?? candidates[0].id;
    }
  }
  if (!leadId) return false;

  const messageId = parsed.messageId ? normalizeMessageId(parsed.messageId) : fallbackId;
  const already = await db.emailMessage.findUnique({ where: { messageId }, select: { id: true } });
  if (already) return false;

  const text = (parsed.text?.trim() || htmlToText(typeof parsed.html === "string" ? parsed.html : "")).slice(0, 20000);
  const subject = (parsed.subject || "(no subject)").slice(0, 500);
  const lead = await db.lead.findUnique({ where: { id: leadId }, select: { companyName: true } });

  await db.emailMessage.create({
    data: {
      leadId,
      direction: "INBOUND",
      status: "RECEIVED",
      subject,
      bodyText: text,
      fromAddress: from,
      toAddress: Array.from(ownAddresses)[0] ?? "",
      messageId,
      inReplyTo: parsed.inReplyTo ? normalizeMessageId(parsed.inReplyTo) : null,
    },
  });
  await db.leadActivity.create({
    data: { leadId, type: "EMAIL_RECEIVED", message: `Reply from ${from}: ${subject}` },
  });

  const assignees = await db.assignment.findMany({ where: { leadId }, select: { userId: true } });
  let userIds = Array.from(new Set(assignees.map((a) => a.userId)));
  if (userIds.length === 0) {
    const managers = await db.user.findMany({
      where: { isActive: true, role: { permissions: { has: "leads.allocate" } } },
      select: { id: true },
    });
    userIds = managers.map((m) => m.id);
  }
  if (userIds.length) {
    await db.notification.createMany({
      data: userIds.map((userId) => ({
        userId,
        type: "EMAIL_REPLY" as const,
        title: `${lead?.companyName ?? "A lead"} replied`,
        body: subject,
        leadId,
      })),
    });
  }
  return true;
}
