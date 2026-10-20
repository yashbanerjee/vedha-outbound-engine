/**
 * AI scoring and inbox polling.
 *
 * Run with: pnpm worker
 * On Railway the web process starts this loop itself. Use this entrypoint for a
 * separate worker service, and set EMBEDDED_WORKER=false on the web service.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { startWorker, stopWorker } from "../src/lib/worker/loop";

const prisma = new PrismaClient();
const log = (msg: string) => console.log(`[worker ${new Date().toISOString()}] ${msg}`);

async function main() {
  const { done } = startWorker(prisma);
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, () => {
      log(`received ${sig}, finishing current batch...`);
      stopWorker();
    });
  }
  await done;
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
