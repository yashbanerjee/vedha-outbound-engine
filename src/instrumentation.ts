import { spawn, type ChildProcess } from "node:child_process";

const globalForWorker = globalThis as { __outboundWorkerChild?: ChildProcess };

/**
 * Railway only runs the web process. Inbox polling has to start with it, or
 * client replies are never filed. The worker is a separate Node process so
 * mailparser (which needs Node's stream module) is not pulled into the Next build.
 * A separate `pnpm worker` service should set EMBEDDED_WORKER=false on the web service.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (!embeddedWorkerEnabled()) return;
  if (globalForWorker.__outboundWorkerChild) return;

  let stopping = false;

  const launch = () => {
    const child = spawn("pnpm", ["worker"], { stdio: "inherit", env: process.env });
    globalForWorker.__outboundWorkerChild = child;
    child.on("exit", (code, signal) => {
      if (globalForWorker.__outboundWorkerChild === child) globalForWorker.__outboundWorkerChild = undefined;
      if (stopping || signal) return;
      console.error(`[worker] exited with code ${code ?? "unknown"}, restarting in 5s`);
      setTimeout(launch, 5000);
    });
  };

  const stop = () => {
    stopping = true;
    globalForWorker.__outboundWorkerChild?.kill("SIGTERM");
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  launch();
}

function embeddedWorkerEnabled() {
  if (process.env.EMBEDDED_WORKER === "false") return false;
  if (process.env.EMBEDDED_WORKER === "true") return true;
  return Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID);
}
