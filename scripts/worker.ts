/**
 * AI scoring worker.
 *
 * Polls the AiScoringJob table, fetches each lead's website, scores it with
 * the configured model and writes the result back to the lead.
 *
 * Run with: pnpm worker
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { claimJobs, processJob } from "../src/lib/ai/process-job";
import { pollInbox } from "../src/lib/mail/poll";

const prisma = new PrismaClient();
const CONCURRENCY = Math.max(1, Number(process.env.WORKER_CONCURRENCY) || 3);
const POLL_MS = Math.max(500, Number(process.env.WORKER_POLL_MS) || 3000);

let stopping = false;
const log = (msg: string) => console.log(`[worker ${new Date().toISOString()}] ${msg}`);

async function recoverStaleJobs() {
  // Jobs left RUNNING by a crashed worker for > 10 minutes go back to PENDING.
  const res = await prisma.aiScoringJob.updateMany({
    where: { status: "RUNNING", updatedAt: { lt: new Date(Date.now() - 10 * 60_000) } },
    data: { status: "PENDING" },
  });
  if (res.count) log(`recovered ${res.count} stale job(s)`);
}

async function tick(): Promise<number> {
  const ids = await claimJobs(prisma, CONCURRENCY);
  if (ids.length === 0) return 0;
  await Promise.all(ids.map((id) => processJob(prisma, id, log)));
  return ids.length;
}

async function main() {
  log(`starting (concurrency=${CONCURRENCY}, poll=${POLL_MS}ms, key=${process.env.OPENAI_API_KEY ? "set" : "MISSING"})`);
  await recoverStaleJobs();
  let lastRecovery = Date.now();
  let lastMailPoll = 0;

  while (!stopping) {
    try {
      const n = await tick();
      if (Date.now() - lastRecovery > 5 * 60_000) {
        await recoverStaleJobs();
        lastRecovery = Date.now();
      }
      if (Date.now() - lastMailPoll > 60_000) {
        lastMailPoll = Date.now();
        await pollInbox(prisma, log);
      }
      if (n === 0) await new Promise((r) => setTimeout(r, POLL_MS));
    } catch (err) {
      log(`loop error: ${err instanceof Error ? err.message : String(err)}`);
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  }
  await prisma.$disconnect();
  log("stopped");
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    log(`received ${sig}, finishing current batch...`);
    stopping = true;
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
