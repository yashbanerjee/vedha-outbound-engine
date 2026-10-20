import { promises as dns } from "node:dns";
import type { EmailStatus } from "@prisma/client";
import { newProbeBudget, probeMailbox, type ProbeBudget } from "@/lib/leads/smtp-probe";

/**
 * Email check, without sending a message:
 *  1. syntax
 *  2. disposable domain, or a mail server that belongs to a disposable provider
 *  3. a real, resolvable MX record (a website alone does not count)
 *  4. an SMTP delivery check against that mail server, when port 25 can be reached
 *
 * VALID means the server accepted this address and refused a fake one.
 * DOMAIN means the domain has mail servers but this inbox was not confirmed,
 * so it can still bounce. REJECTED means the server refused this address.
 */
export type EmailCheck = {
  status: EmailStatus;
  detail: string;
};

const DNS_TIMEOUT_MS = 4000;

const DISPOSABLE_DOMAINS = new Set<string>([
  "mailinator.com", "guerrillamail.com", "guerrillamail.net", "guerrillamail.org", "guerrillamailblock.com",
  "sharklasers.com", "grr.la", "guerrillamail.biz", "guerrillamail.de", "spam4.me", "10minutemail.com",
  "10minutemail.net", "tempmail.com", "temp-mail.org", "tempmailo.com", "tempmailaddress.com", "throwawaymail.com",
  "trashmail.com", "trashmail.net", "trashmail.de", "yopmail.com", "yopmail.fr", "yopmail.net", "cool.fr.nf",
  "jetable.fr.nf", "nospam.ze.tc", "nomail.xl.cx", "mega.zik.dj", "speed.1s.fr", "courriel.fr.nf", "moncourrier.fr.nf",
  "monemail.fr.nf", "monmail.fr.nf", "getnada.com", "nada.email", "dispostable.com", "mailnesia.com", "maildrop.cc",
  "mailcatch.com", "mintemail.com", "mytemp.email", "tempinbox.com", "fakeinbox.com", "fakemail.net", "fakemailgenerator.com",
  "emailondeck.com", "moakt.com", "moakt.cc", "mailsac.com", "inboxkitten.com", "discard.email", "discardmail.com",
  "discardmail.de", "spamgourmet.com", "spamgourmet.net", "spamgourmet.org", "spamex.com", "getairmail.com",
  "dropmail.me", "emltmp.com", "tmpmail.org", "tmpmail.net", "tmail.ws", "harakirimail.com", "mailnull.com",
  "spambox.us", "spamfree24.org", "trash-mail.com", "trash-mail.de", "wegwerfmail.de", "wegwerfmail.net",
  "byom.de", "trashmail.at", "spamthisplease.com", "mailforspam.com", "safetymail.info", "binkmail.com",
  "bobmail.info", "devnullmail.com", "letthemeatspam.com", "mailexpire.com", "mailmoat.com", "mailzilla.com",
  "meltmail.com", "nobulk.com", "noclickemail.com", "nogmailspam.info", "nomail.pw", "nomorespamemails.com",
  "notmailinator.com", "nowmymail.com", "objectmail.com", "obobbo.com", "oneoffemail.com", "onewaymail.com",
  "owlpic.com", "pjjkp.com", "politikerclub.de", "proxymail.eu", "rcpt.at", "reallymymail.com", "recode.me",
  "regbypass.com", "rmqkr.net", "rppkn.com", "s0ny.net", "safe-mail.net", "safersignup.de", "saynotospams.com",
  "selfdestructingmail.com", "sendspamhere.com", "shieldedmail.com", "shitmail.me", "smellfear.com", "snakemail.com",
  "sneakemail.com", "sofort-mail.de", "sogetthis.com", "soodonims.com", "spam.la", "spamavert.com", "spambob.com",
  "spambob.net", "spambob.org", "spambog.com", "spambog.de", "spambog.ru", "spamcannon.com", "spamcannon.net",
  "spamcero.com", "spamcorptastic.com", "spamcowboy.com", "spamcowboy.net", "spamcowboy.org", "spamday.com",
  "spameater.com", "spameater.org", "spamfree.eu", "spamhole.com", "spamify.com", "spaminator.de", "spamkill.info",
  "spaml.com", "spaml.de", "spammotel.com", "spamobox.com", "spamoff.de", "spamslicer.com", "spamspot.com",
  "spamthis.co.uk", "spamtrail.com", "speed.1s.fr", "supergreatmail.com", "supermailer.jp", "suremail.info",
  "teewars.org", "teleworm.com", "teleworm.us", "tempalias.com", "tempe-mail.com", "tempemail.biz", "tempemail.com",
  "tempemail.net", "tempinbox.co.uk", "tempmail.eu", "tempmail.it", "tempomail.fr", "temporaryemail.net",
  "temporaryforwarding.com", "temporaryinbox.com", "thanksnospam.info", "thankyou2010.com", "thisisnotmyrealemail.com",
  "throwawayemailaddress.com", "tilien.com", "tmailinator.com", "tradermail.info", "trash2009.com", "trashemail.de",
  "trashymail.com", "trashymail.net", "trillianpro.com", "turual.com", "twinmail.de", "tyldd.com", "uggsrock.com",
  "upliftnow.com", "venompen.com", "veryrealemail.com", "viditag.com", "viewcastmedia.com", "viewcastmedia.net",
  "viewcastmedia.org", "webm4il.info", "wh4f.org", "whyspam.me", "willselfdestruct.com", "winemaven.info",
  "wronghead.com", "wuzup.net", "wuzupmail.net", "www.e4ward.com", "www.mailinator.com", "xagloo.com", "xemaps.com",
  "xents.com", "xmaily.com", "xoxy.net", "yep.it", "yogamaven.com", "yopmail.pp.ua", "yuurok.com", "zippymail.info",
  "zoaxe.com", "zoemail.org", "deadaddress.com", "despam.it", "despammed.com", "dodgeit.com", "dodgit.com",
  "dontreg.com", "dontsendmespam.de", "dumpmail.de", "dumpyemail.com", "e4ward.com", "emailias.com", "emailmiser.com",
  "emailsensei.com", "emailtemporario.com.br", "emailto.de", "emailwarden.com", "enterto.com", "ephemail.net",
  "etranquil.com", "etranquil.net", "etranquil.org", "evopo.com", "explodemail.com", "fastacura.com", "filzmail.com",
  "fizmail.com", "frapmail.com", "friendlymail.co.uk", "fux0ringduh.com", "garliclife.com", "get1mail.com",
  "getonemail.com", "ghosttexter.de", "girlsundertheinfluence.com", "gishpuppy.com", "great-host.in", "greensloth.com",
  "haltospam.com", "hatespam.org", "hidemail.de", "hochsitze.com", "ieatspam.eu", "ieatspam.info", "imails.info",
  "inboxalias.com", "incognitomail.com", "incognitomail.net", "incognitomail.org", "ipoo.org", "irish2me.com",
  "jetable.com", "jetable.net", "jetable.org", "kasmail.com", "kaspop.com", "keepmymail.com", "killmail.com",
  "killmail.net", "klassmaster.com", "klzlk.com", "koszmail.pl", "kulturbetrieb.info", "kurzepost.de", "lifebyfood.com",
  "link2mail.net", "litedrop.com", "lol.ovpn.to", "lookugly.com", "lopl.co.cc", "lr78.com", "m4ilweb.info", "maboard.com",
  "mail-temporaire.fr", "mail.by", "mail.mezimages.net", "mail2rss.org", "mail333.com", "mailbidon.com", "mailblocks.com",
  "mailbucket.org", "mailcat.biz", "mailde.de", "mailde.info", "maileater.com", "mailexpire.com", "mailfreeonline.com",
  "mailguard.me", "mailimate.com", "mailin8r.com", "mailinater.com", "mailinator.net", "mailinator.org", "mailinator2.com",
  "mailincubator.com", "mailme.lv", "mailmetrash.com", "mailnator.com", "mailshell.com", "mailsiphon.com", "mailslite.com",
  "mailtemp.info", "mailzilla.org", "mbx.cc", "meltmail.com", "messagebeamer.de", "mierdamail.com", "mintemail.com",
  "mt2009.com", "mx0.wwwnew.eu", "mypartyclip.de", "myphantomemail.com", "mysamp.de", "myspaceinc.com", "myspaceinc.net",
  "myspaceinc.org", "myspacepimpedup.com", "myspamless.com", "mytrashmail.com", "neomailbox.com", "nepwk.com",
  "nervmich.net", "nervtmich.net", "netmails.com", "netmails.net", "netzidiot.de", "neverbox.com", "no-spam.ws",
  "noblepioneer.com", "nomail2me.com", "nospamfor.us", "nospamthanks.info", "notsharingmy.info", "nowmymail.com",
  "nurfuerspam.de", "nus.edu.sg", "oneoffmail.com", "oopi.org", "ordinaryamerican.net", "otherinbox.com",
  "ourklips.com", "outlawspam.com", "ovpn.to", "pimpedupmyspace.com", "pookmail.com", "privacy.net", "privatdemail.net",
  "proxymail.eu", "punkass.com", "putthisinyourspamdatabase.com", "quickinbox.com", "rcpt.at", "receiveee.com",
  "recode.me", "recursor.net", "regbypass.comsafe-mail.net", "rejectmail.com", "rklips.com", "sandelf.de",
  "schafmail.de", "selfdestructingmail.org", "sendspamhere.com", "shiftmail.com", "shortmail.net", "sibmail.com",
  "skeefmail.com", "slopsbox.com", "smellfear.com", "snkmail.com", "sofimail.com", "sofortmail.de", "spam.su",
  "spamherelots.com", "spamhereplease.com", "spamstack.net", "tempemailaddress.com", "tempmailer.com", "tempmailer.de",
  "thankyou2010.com", "thismail.net", "throwam.com", "tilien.com", "tmail.com", "toomail.biz", "topranklist.de",
  "tradermail.info", "trashmailer.com", "trashymail.com", "trialmail.de", "tyldd.com", "uggsrock.com", "upliftnow.com",
  "venompen.com", "veryreallyfakeemailaddress.com", "vidchart.com", "vubby.com", "walkmail.net", "wetrainbayarea.com",
  "wetrainbayarea.org", "wh4f.org", "whopy.com", "wilemail.com", "willhackforfood.biz", "willselfdestruct.com",
  "winemaven.info", "wronghead.com", "wuzup.net", "wwwnew.eu", "xagloo.com", "xemaps.com", "xents.com", "xmaily.com",
  "xoxy.net", "yep.it", "yogamaven.com", "yopmail.com", "yopmail.fr", "yopmail.net", "ypmail.webnetic.fr", "yuurok.com",
  "zehnminutenmail.de", "zippymail.info", "zoemail.net", "zoemail.org",
]);

/** RFC-ish, pragmatic: local part, one @, domain with at least one dot and a 2+ letter TLD. */
const SYNTAX_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export function emailDomain(email: string): string {
  return email.slice(email.lastIndexOf("@") + 1).toLowerCase();
}

export function isDisposableDomain(domain: string): boolean {
  const d = domain.toLowerCase();
  if (DISPOSABLE_DOMAINS.has(d)) return true;
  // Also catch subdomains of known providers, e.g. "x.mailinator.com".
  for (const known of ["mailinator.com", "guerrillamail.com", "yopmail.com", "tempmail.com"]) {
    if (d.endsWith("." + known)) return true;
  }
  return false;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("DNS lookup timed out")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

const DISPOSABLE_MX = ["generator.email", "mailinator.com", "guerrillamail.com", "yopmail.com", "tempmail.com", "trashmail.com", "moakt.com", "10minutemail.com", "maildrop.cc", "mailnesia.com", "getnada.com", "dispostable.com"];

function isDisposableMx(host: string) {
  const name = host.toLowerCase().replace(/\.$/, "");
  return DISPOSABLE_MX.some((known) => name === known || name.endsWith("." + known));
}

type DomainMail =
  | { kind: "mx"; host: string }
  | { kind: "disposable-mx"; host: string }
  | { kind: "no"; detail: string }
  | { kind: "unknown" };

/** A published, resolvable MX host. A website with only an A record is not a mail server. */
async function lookupMailServer(domain: string): Promise<DomainMail> {
  let records: { exchange: string; priority: number }[] = [];
  try {
    records = await withTimeout(dns.resolveMx(domain), DNS_TIMEOUT_MS);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOTFOUND" || code === "ENODATA") {
      return { kind: "no", detail: `${domain} has no mail servers. Emails to this address will bounce.` };
    }
    return { kind: "unknown" };
  }

  const hosts = records
    .map((record) => ({ host: record.exchange.replace(/\.$/, "").toLowerCase(), priority: record.priority }))
    .filter((record) => record.host && record.host !== ".")
    .sort((a, b) => a.priority - b.priority);
  if (records.length > 0 && hosts.length === 0) {
    return { kind: "no", detail: `${domain} is set up to reject all email.` };
  }
  if (hosts.length === 0) {
    return { kind: "no", detail: `${domain} has no mail servers. Emails to this address will bounce.` };
  }
  if (isDisposableMx(hosts[0].host)) return { kind: "disposable-mx", host: hosts[0].host };

  for (const candidate of hosts.slice(0, 3)) {
    const addresses = await Promise.allSettled([
      withTimeout(dns.resolve4(candidate.host), DNS_TIMEOUT_MS),
      withTimeout(dns.resolve6(candidate.host), DNS_TIMEOUT_MS),
    ]);
    const resolvable = addresses.some((result) => result.status === "fulfilled" && result.value.length > 0);
    if (resolvable) return { kind: "mx", host: candidate.host };
  }
  return { kind: "no", detail: `${domain} lists a mail server that does not exist. Emails to this address will bounce.` };
}

function fromProbe(domain: string, probe: Awaited<ReturnType<typeof probeMailbox>>): EmailCheck {
  if (probe === "accept") {
    return { status: "VALID", detail: `The mail server for ${domain} accepted this address.` };
  }
  if (probe === "reject") {
    return { status: "REJECTED", detail: `The mail server for ${domain} refused this address. It is not accepting email.` };
  }
  return {
    status: "DOMAIN",
    detail: `${domain} has mail servers, but this inbox was not confirmed. The address can still bounce.`,
  };
}

async function checkDomain(domain: string, email: string, budget: ProbeBudget): Promise<EmailCheck> {
  const mail = await lookupMailServer(domain);
  if (mail.kind === "unknown") return { status: "UNVERIFIED", detail: `Could not reach a DNS server to check ${domain}. Try again later.` };
  if (mail.kind === "no") return { status: "NO_MX", detail: mail.detail };
  if (mail.kind === "disposable-mx") {
    return { status: "DISPOSABLE", detail: `${domain} uses ${mail.host}, a disposable mail service. These addresses are throwaway and rarely worth contacting.` };
  }
  return fromProbe(domain, await probeMailbox(email, mail.host, budget));
}

export async function verifyEmail(email: string): Promise<EmailCheck> {
  const value = email.trim().toLowerCase();
  if (!SYNTAX_RE.test(value) || value.length > 254) {
    return { status: "INVALID", detail: "Not a valid email address." };
  }
  const domain = emailDomain(value);
  if (isDisposableDomain(domain)) {
    return { status: "DISPOSABLE", detail: `${domain} is a disposable email provider. These addresses are throwaway and rarely worth contacting.` };
  }
  return checkDomain(domain, value, newProbeBudget());
}

/**
 * Check many addresses, looking each domain up only once. Runs lookups with
 * limited concurrency so a large import does not flood the resolver.
 */
export async function verifyEmails(emails: string[], concurrency = 10): Promise<Map<string, EmailCheck>> {
  const result = new Map<string, EmailCheck>();
  const byDomain = new Map<string, string[]>();

  for (const raw of emails) {
    const value = raw.trim().toLowerCase();
    if (result.has(value)) continue;
    if (!SYNTAX_RE.test(value) || value.length > 254) {
      result.set(value, { status: "INVALID", detail: "Not a valid email address." });
      continue;
    }
    const domain = emailDomain(value);
    if (isDisposableDomain(domain)) {
      result.set(value, { status: "DISPOSABLE", detail: `${domain} is a disposable email provider. These addresses are throwaway and rarely worth contacting.` });
      continue;
    }
    const list = byDomain.get(domain) ?? [];
    list.push(value);
    byDomain.set(domain, list);
  }

  const domains = Array.from(byDomain.keys());
  let cursor = 0;
  const budget = newProbeBudget();
  const worker = async () => {
    while (cursor < domains.length) {
      const domain = domains[cursor++];
      const addresses = byDomain.get(domain)!;
      const mail = await lookupMailServer(domain);
      if (mail.kind === "unknown") {
        for (const value of addresses) result.set(value, { status: "UNVERIFIED", detail: `Could not reach a DNS server to check ${domain}. Try again later.` });
        continue;
      }
      if (mail.kind === "no") {
        for (const value of addresses) result.set(value, { status: "NO_MX", detail: mail.detail });
        continue;
      }
      if (mail.kind === "disposable-mx") {
        const detail = `${domain} uses ${mail.host}, a disposable mail service. These addresses are throwaway and rarely worth contacting.`;
        for (const value of addresses) result.set(value, { status: "DISPOSABLE", detail });
        continue;
      }
      for (const value of addresses) result.set(value, fromProbe(domain, await probeMailbox(value, mail.host, budget)));
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, domains.length) }, worker));
  return result;
}
