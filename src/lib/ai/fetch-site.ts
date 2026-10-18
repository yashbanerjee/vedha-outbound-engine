import * as cheerio from "cheerio";

const UA = "Mozilla/5.0 (compatible; OutboundEngineBot/1.0; +https://example.com/bot)";
const TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 1_500_000;

/** Paths that usually carry the most signal about what a company does. */
const SECONDARY_PATH_HINTS = [/about/i, /services/i, /solutions/i, /products?/i, /pricing/i, /customers/i, /case-?stud/i, /careers?/i, /team/i];

export type SiteContent = {
  url: string;
  finalUrl: string;
  title: string | null;
  description: string | null;
  pagesFetched: string[];
  text: string;
  truncated: boolean;
};

export class SiteFetchError extends Error {
  constructor(
    message: string,
    public readonly code: "UNREACHABLE" | "TIMEOUT" | "BAD_STATUS" | "NOT_HTML" | "EMPTY",
  ) {
    super(message);
    this.name = "SiteFetchError";
  }
}

async function fetchHtml(url: string): Promise<{ html: string; finalUrl: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", "accept-language": "en" },
    });
    if (!res.ok) throw new SiteFetchError(`Site responded with HTTP ${res.status}`, "BAD_STATUS");
    const ct = res.headers.get("content-type") ?? "";
    if (ct && !/text\/html|application\/xhtml/i.test(ct)) throw new SiteFetchError(`Not an HTML page (${ct.split(";")[0]})`, "NOT_HTML");
    const buf = await res.arrayBuffer();
    const html = new TextDecoder("utf-8", { fatal: false }).decode(buf.slice(0, MAX_HTML_BYTES));
    return { html, finalUrl: res.url || url };
  } catch (err) {
    if (err instanceof SiteFetchError) throw err;
    if (err instanceof Error && err.name === "AbortError") throw new SiteFetchError("Site took too long to respond", "TIMEOUT");
    throw new SiteFetchError(err instanceof Error ? `Could not reach site: ${err.message}` : "Could not reach site", "UNREACHABLE");
  } finally {
    clearTimeout(timer);
  }
}

function extractText($: cheerio.CheerioAPI): string {
  $("script, style, noscript, svg, iframe, canvas, template, [hidden], [aria-hidden='true']").remove();
  $("nav, footer, header .cookie, .cookie, #cookie, [class*='cookie'], [id*='cookie']").remove();
  const root = $("main").length ? $("main") : $("body");
  const blocks: string[] = [];
  root.find("h1, h2, h3, h4, p, li, td, th, blockquote, [role='heading']").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t.length >= 3) blocks.push(t);
  });
  if (blocks.length < 5) {
    const t = root.text().replace(/\s+/g, " ").trim();
    if (t) blocks.push(t);
  }
  // Deduplicate repeated nav/CTA strings.
  const seen = new Set<string>();
  return blocks
    .filter((b) => {
      const k = b.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .join("\n");
}

function pickSecondaryLinks($: cheerio.CheerioAPI, base: URL, max: number): string[] {
  const found = new Map<string, number>();
  $("a[href]").each((_, a) => {
    const href = $(a).attr("href");
    if (!href) return;
    let u: URL;
    try {
      u = new URL(href, base);
    } catch {
      return;
    }
    if (u.hostname.replace(/^www\./, "") !== base.hostname.replace(/^www\./, "")) return;
    if (u.pathname === "/" || u.pathname === base.pathname) return;
    if (/\.(pdf|jpg|jpeg|png|gif|zip|mp4|webp|svg)$/i.test(u.pathname)) return;
    const score = SECONDARY_PATH_HINTS.findIndex((re) => re.test(u.pathname));
    if (score === -1) return;
    u.hash = "";
    u.search = "";
    const key = u.toString();
    if (!found.has(key) || found.get(key)! > score) found.set(key, score);
  });
  return Array.from(found.entries())
    .sort((a, b) => a[1] - b[1])
    .slice(0, max)
    .map(([k]) => k);
}

/**
 * Fetches the homepage plus up to `maxPages - 1` high-signal internal pages and
 * returns a compact plain-text representation capped at `maxChars`.
 */
export async function fetchSiteContent(url: string, opts: { maxChars: number; maxPages: number }): Promise<SiteContent> {
  const { html, finalUrl } = await fetchHtml(url);
  const $ = cheerio.load(html);
  const title = $("title").first().text().trim() || $("meta[property='og:title']").attr("content")?.trim() || null;
  const description =
    $("meta[name='description']").attr("content")?.trim() || $("meta[property='og:description']").attr("content")?.trim() || null;

  const parts: string[] = [];
  const pagesFetched = [finalUrl];
  parts.push(`# Homepage (${finalUrl})\n${extractText($)}`);

  const base = new URL(finalUrl);
  const extra = Math.max(0, Math.min(opts.maxPages - 1, 4));
  if (extra > 0) {
    const links = pickSecondaryLinks($, base, extra);
    const results = await Promise.allSettled(links.map((l) => fetchHtml(l)));
    results.forEach((r, i) => {
      if (r.status !== "fulfilled") return;
      const $$ = cheerio.load(r.value.html);
      const text = extractText($$);
      if (text.length > 100) {
        parts.push(`# ${links[i]}\n${text}`);
        pagesFetched.push(links[i]);
      }
    });
  }

  let text = parts.join("\n\n");
  const truncated = text.length > opts.maxChars;
  if (truncated) text = text.slice(0, opts.maxChars);
  if (text.replace(/\s/g, "").length < 40) throw new SiteFetchError("Page contained almost no readable text (possibly JS-only or parked)", "EMPTY");

  return { url, finalUrl, title, description, pagesFetched, text, truncated };
}
