/** Normalizes a website/URL into a bare domain used for deduplication. */
export function normalizeDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  let s = input.trim().toLowerCase();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(s)) s = "https://" + s;
  try {
    const url = new URL(s);
    let host = url.hostname;
    if (host.startsWith("www.")) host = host.slice(4);
    if (!host.includes(".")) return null;
    return host;
  } catch {
    return null;
  }
}

/** Ensures a website has a protocol so it can be linked/fetched. */
export function normalizeWebsite(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = input.trim();
  if (!s) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return s;
  return "https://" + s;
}

export function normalizeEmail(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = input.trim().toLowerCase();
  return s.includes("@") ? s : null;
}

export function parseTags(input: string | null | undefined): string[] {
  if (!input) return [];
  return Array.from(
    new Set(
      input
        .split(/[,;|]/)
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  );
}

export function emptyToNull(input: string | null | undefined): string | null {
  if (input == null) return null;
  const s = String(input).trim();
  return s ? s : null;
}
