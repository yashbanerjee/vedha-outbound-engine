export const VEDHA_LOGO_PATH = "/vedha-logo.png";
export const VEDHA_LOGO_CID = "vedha-logo";

/** Absolute logo URL for copies opened outside the app, such as the mailbox Sent folder. */
export function publicLogoSrc(): string {
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : "";
  const base = (process.env.AUTH_URL || railway).replace(/\/$/, "");
  return base ? `${base}${VEDHA_LOGO_PATH}` : VEDHA_LOGO_PATH;
}

export function emailLogoBlock(src: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px;"><tr><td style="background:#000000;padding:20px 24px;"><img src="${src}" alt="Vedha" width="140" style="display:block;width:140px;max-width:140px;height:auto;border:0;outline:none;text-decoration:none;" /></td></tr></table>`;
}

/** Puts the Vedha logo at the top of an email body. Leaves a body that already includes it unchanged. */
export function withEmailLogo(html: string, src: string): string {
  if (/vedha-logo/i.test(html)) return html;
  const block = emailLogoBlock(src);
  if (/<body[^>]*>/i.test(html)) return html.replace(/<body[^>]*>/i, (open) => `${open}${block}`);
  return `${block}${html}`;
}
