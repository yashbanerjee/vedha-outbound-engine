import type { ActivityType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

type Tx = Prisma.TransactionClient | typeof prisma;

export async function logActivity(
  db: Tx,
  input: { leadId: string; userId?: string | null; type: ActivityType; message: string; metadata?: Prisma.InputJsonValue },
) {
  return db.leadActivity.create({
    data: {
      leadId: input.leadId,
      userId: input.userId ?? null,
      type: input.type,
      message: input.message,
      metadata: input.metadata,
    },
  });
}

export async function logActivities(
  db: Tx,
  rows: { leadId: string; userId?: string | null; type: ActivityType; message: string; metadata?: Prisma.InputJsonValue }[],
) {
  if (!rows.length) return;
  await db.leadActivity.createMany({
    data: rows.map((r) => ({
      leadId: r.leadId,
      userId: r.userId ?? null,
      type: r.type,
      message: r.message,
      metadata: r.metadata,
    })),
  });
}
