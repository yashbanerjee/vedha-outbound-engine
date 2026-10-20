import type { PrismaClient } from "@prisma/client";
import { claimJobs, processJob } from "@/lib/ai/process-job";
import { pollInbox } from "@/lib/mail/poll";

const CONCURRENCY = Math.max(1, Number(process.env.WORKER_CONCURRENCY) || 3);
const POLL_MS = Math.max(500, Number(process.env.WORKER_POLL_MS) || 3000);
const MAIL_POLL_MS = Math.max(15_000, Number(process.env.MAIL_POLL_MS) || 60_000);

const globalForWorker = globalThis as { __outboundWorkerStarted?: boolean };

let stopping = false;

const log = (msg: string) => console.log(`[worker ${new Date().toISOString()}] ${msg}`);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function message(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

async function recoverStaleJobs(prisma: PrismaClient) {
  const res = await prisma.aiScoringJob.updateMany({
    where: { status: "RUNNING", updatedAt: { lt: new Date(Date.now() - 10 * 60_000) } },
    data: { status: "PENDING" },
  });
  if (res.count) log(`recovered ${res.count} stale job(s)`);
}

async function aiLoop(prisma: PrismaClient) {
  await recoverStaleJobs(prisma).catch((err) => log(`recover error: ${message(err)}`));
  let lastRecovery = Date.now();

  while (!stopping) {
    try {
      const ids = await claimJobs(prisma, CONCURRENCY);
      if (ids.length) await Promise.all(ids.map((id) => processJob(prisma, id, log)));
      if (Date.now() - lastRecovery > 5 * 60_000) {
        await recoverStaleJobs(prisma);
        lastRecovery = Date.now();
      }
      if (ids.length === 0) await sleep(POLL_MS);
    } catch (err) {
      log(`scoring error: ${message(err)}`);
      await sleep(POLL_MS);
    }
  }
}

async function mailLoop(prisma: PrismaClient) {
  // Let the server finish booting before opening IMAP.
  await sleep(5_000);
  let notedDisabled = false;

  while (!stopping) {
    try {
      const result = await pollInbox(prisma, log);
      if (result.skipped === "disabled" && !notedDisabled) {
        notedDisabled = true;
        log("mail: mailbox is off or incomplete, so client replies will not be imported");
      }
      if (result.skipped !== "disabled") notedDisabled = false;
    } catch (err) {
      log(`mail error: ${message(err)}`);
    }
    await sleep(MAIL_POLL_MS);
  }
}

export function stopWorker() {
  stopping = true;
}

/** Starts AI scoring and inbox polling. Safe to call more than once. */
export function startWorker(prisma: PrismaClient): { done: Promise<void> } {
  if (globalForWorker.__outboundWorkerStarted) return { done: Promise.resolve() };
  globalForWorker.__outboundWorkerStarted = true;
  stopping = false;

  log(
    `starting (concurrency=${CONCURRENCY}, poll=${POLL_MS}ms, mail=${MAIL_POLL_MS}ms, key=${process.env.OPENAI_API_KEY ? "set" : "MISSING"})`,
  );

  const done = Promise.all([aiLoop(prisma), mailLoop(prisma)]).then(() => {
    log("stopped");
  });
  return { done };
}
