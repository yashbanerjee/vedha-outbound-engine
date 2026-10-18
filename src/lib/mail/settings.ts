import type { MailSettings, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/mail/crypto";

export async function getMailSettings(): Promise<MailSettings> {
  return prisma.mailSettings.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } });
}

export type MailboxCredentials = MailSettings & { password: string };

/** Settings plus the decrypted password. Server side only. */
export async function getMailboxCredentials(db: PrismaClient | typeof prisma = prisma): Promise<MailboxCredentials | null> {
  const settings = await db.mailSettings.findUnique({ where: { id: "default" } });
  if (!settings?.enabled || !settings.passwordEnc || !settings.smtpHost || !settings.imapHost || !settings.username || !settings.fromAddress) {
    return null;
  }
  return { ...settings, password: decryptSecret(settings.passwordEnc) };
}
