export const MERGE_FIELDS = [
  { token: "contactName", label: "Contact name", fallback: "there" },
  { token: "companyName", label: "Company" },
  { token: "senderName", label: "Your name" },
] as const;

export type MergeContext = {
  contactName?: string | null;
  companyName?: string | null;
  senderName?: string | null;
};

/** Replaces {{token}} placeholders. Unknown tokens are left untouched. */
export function applyMerge(input: string, ctx: MergeContext): string {
  return input.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, key: string) => {
    const value = ctx[key as keyof MergeContext];
    if (value && value.trim()) return value.trim();
    if (key === "contactName") return "there";
    return whole;
  });
}

/** Strips tags for the plain-text part and for rendering untrusted inbound mail. */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** True when the body is a designed email, not a few paragraphs from the visual editor. */
export function isRichHtml(html: string) {
  return /<!doctype|<html\b|<style\b|<table\b/i.test(html);
}

/** Drops scripts and event handlers. Style blocks stay, so a pasted email template keeps its layout. */
export function sanitizeEmailHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<\/?(?:iframe|object|embed|form)\b[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
}
