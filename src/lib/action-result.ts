export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export function ok<T>(data: T, message?: string): ActionResult<T> {
  return { ok: true, data, message };
}

export function fail<T = undefined>(error: string, fieldErrors?: Record<string, string[]>): ActionResult<T> {
  return { ok: false, error, fieldErrors };
}

/** Wraps a server action body so thrown errors become `{ ok: false }` results. */
export async function safeAction<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (err) {
    // Let Next.js redirect()/notFound() propagate.
    if (err && typeof err === "object" && "digest" in err && typeof (err as { digest?: unknown }).digest === "string") {
      throw err;
    }
    const message = err instanceof Error ? err.message : "Something went wrong.";
    return fail(message);
  }
}
