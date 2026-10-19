export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (!embeddedWorkerEnabled()) return;

  try {
    const { prisma } = await import("@/lib/db");
    const { startWorker } = await import("@/lib/worker/loop");
    startWorker(prisma);
  } catch (err) {
    console.error("[worker] failed to start", err);
  }
}

/**
 * Railway only runs the web process (`pnpm start`). Inbox polling has to live
 * in that process, or client replies are never filed.
 * A separate `pnpm worker` service should set EMBEDDED_WORKER=false on the web service.
 */
function embeddedWorkerEnabled() {
  if (process.env.EMBEDDED_WORKER === "false") return false;
  if (process.env.EMBEDDED_WORKER === "true") return true;
  return Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID);
}
