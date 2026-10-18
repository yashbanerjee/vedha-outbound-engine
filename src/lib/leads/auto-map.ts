import { LEAD_IMPORT_FIELDS, type LeadImportField } from "@/lib/leads/constants";

/** Special mapping targets besides the real lead fields. */
export const MAP_EXTRA = "__extra__"; // keep as an additional (custom) field
export const MAP_SKIP = ""; // drop the column

export type MappingTarget = LeadImportField | typeof MAP_EXTRA | typeof MAP_SKIP;
export type Mapping = Record<string, MappingTarget>;

export type MappingSource = "header" | "values" | "manual" | "none";
export type AutoMapResult = {
  mapping: Mapping;
  /** How each header was decided, for the UI. */
  sources: Record<string, MappingSource>;
};

type Rule = { re: RegExp; score: number };

/** Tokenise "Company_Website-URL (primary)" -> "company website url primary". */
export function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const NOT_COMPANY = /(website|url|domain|email|phone|size|industry|linkedin|address|city|country|state|description|type|revenue|employees|founded|id|logo|hq|headcount|tagline|twitter|facebook)/;
const NOT_WEBSITE = /(linkedin|facebook|twitter|instagram|youtube|crunchbase|angellist|github|profile|logo|image|photo|source|referr)/;

/**
 * Header rules per field. Higher score = stronger evidence.
 * A header is assigned to at most one field; greedy by score.
 */
const RULES: Record<LeadImportField, Rule[]> = {
  companyName: [
    { re: /^(company|company name|organi[sz]ation|organi[sz]ation name|business|business name|biz|account|account name|employer|firm|org|org name|legal name|brand|vendor|supplier|client|customer|prospect)$/, score: 10 },
    { re: /^(company|organi[sz]ation|business|account)\b(?!.*(website|url|domain|email|phone|size|industry|linkedin|address|city|country|state|description|type|revenue|employees|founded|id|logo|hq|headcount|tagline))/, score: 7 },
    { re: /(^| )name$/, score: 2 }, // "Name" alone: company unless a company column exists
  ],
  website: [
    { re: /^(website|web|url|domain|site|homepage|web address|website url|company website|company domain|company url|primary domain|website domain|web site)$/, score: 10 },
    { re: /(website|domain|homepage|web ?site|\burl\b)/, score: 6 },
  ],
  contactName: [
    { re: /^(contact|contact name|full name|person|lead name|contact person|decision maker|owner|owner name|primary contact|poc|point of contact|contact full name)$/, score: 10 },
    { re: /^(first name|firstname|given name|contact first name|first)$/, score: 9 },
    { re: /(contact name|full name|first name|person)/, score: 5 },
    { re: /\bcontact\b(?!.*(email|phone|number|id|title|date|status|owner|count))/, score: 4 },
    { re: /(^| )name$/, score: 1 },
  ],
  contactLastName: [
    { re: /^(last name|lastname|surname|family name|contact last name|last)$/, score: 10 },
    { re: /(last name|surname)/, score: 6 },
  ],
  email: [
    { re: /^(email|e mail|email address|work email|contact email|business email|mail|primary email|email 1|email1)$/, score: 10 },
    { re: /\b(e ?mail)\b(?!.*(status|verified|valid|bounce|confidence|2|secondary|personal))/, score: 6 },
  ],
  phone: [
    { re: /^(phone|phone number|mobile|tel|telephone|cell|contact number|work phone|direct phone|company phone|mobile phone|phone 1|phone1|office phone|direct dial)$/, score: 10 },
    { re: /\b(phone|mobile|tel|telephone|cell)\b/, score: 6 },
  ],
  industry: [
    { re: /^(industry|industries|sector|vertical|category|niche|business type|company industry|primary industry|market)$/, score: 10 },
    { re: /(industry|sector|vertical)/, score: 6 },
  ],
  country: [
    { re: /^(country|nation|company country|hq country|country name|country region|location country|headquarters country)$/, score: 10 },
    { re: /\bcountry\b/, score: 6 },
  ],
  city: [
    { re: /^(city|town|location|company city|hq city|headquarters|hq|hq location|company location)$/, score: 10 },
    { re: /\b(city|town)\b/, score: 6 },
  ],
  tags: [
    { re: /^(tags?|labels?|keywords?|lists?|segment|segments|list name|campaign)$/, score: 10 },
    { re: /\b(tags?|labels?|keywords?)\b/, score: 5 },
  ],
  notes: [
    { re: /^(notes?|comments?|description|remarks?|summary|about|company description|short description|seo description|bio)$/, score: 10 },
    { re: /(notes?|description|remarks?|comments?)/, score: 5 },
  ],
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const URL_RE = /^(https?:\/\/)?(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i;
const PHONE_RE = /^\+?[\d\s().-]{7,20}$/;

/** Look at the actual values in a column to guess its type. */
function detectFromValues(values: (string | null | undefined)[]): LeadImportField | null {
  const sample = values.map((v) => v?.trim()).filter((v): v is string => !!v).slice(0, 50);
  if (sample.length < 3) return null;
  const ratio = (re: RegExp) => sample.filter((v) => re.test(v)).length / sample.length;
  if (ratio(EMAIL_RE) >= 0.7) return "email";
  if (ratio(URL_RE) >= 0.7 && !sample.some((v) => EMAIL_RE.test(v))) return "website";
  if (ratio(PHONE_RE) >= 0.7 && sample.every((v) => /\d{5,}/.test(v.replace(/\D/g, "")))) return "phone";
  return null;
}

/**
 * Decide a lead field for every CSV header.
 * 1. Header-name rules, assigned greedily by score (one header per field).
 * 2. For leftover headers, sniff the values (emails, URLs, phone numbers).
 * 3. Everything else is kept as an additional field - nothing is silently dropped.
 */
export function autoMapHeaders(headers: string[], rows: Record<string, string | null>[] = []): AutoMapResult {
  const mapping: Mapping = {};
  const sources: Record<string, MappingSource> = {};
  const usedFields = new Set<LeadImportField>();
  const usedHeaders = new Set<string>();

  const candidates: { header: string; field: LeadImportField; score: number; order: number }[] = [];
  headers.forEach((header, order) => {
    const norm = normalizeHeader(header);
    if (!norm) return;
    for (const f of LEAD_IMPORT_FIELDS) {
      let best = 0;
      for (const rule of RULES[f.key]) if (rule.re.test(norm) && rule.score > best) best = rule.score;
      if (best === 0) continue;
      if (f.key === "companyName" && best < 10 && NOT_COMPANY.test(norm)) continue;
      if (f.key === "website" && NOT_WEBSITE.test(norm)) continue;
      candidates.push({ header, field: f.key, score: best, order });
    }
  });
  // Strongest evidence first; earlier columns win ties (e.g. "Email" before "Email 2").
  candidates.sort((a, b) => b.score - a.score || a.order - b.order);
  for (const c of candidates) {
    if (usedFields.has(c.field) || usedHeaders.has(c.header)) continue;
    usedFields.add(c.field);
    usedHeaders.add(c.header);
    mapping[c.header] = c.field;
    sources[c.header] = "header";
  }

  // Leftovers: sniff the values, otherwise keep as an additional field.
  for (const header of headers) {
    if (usedHeaders.has(header)) continue;
    const guess = rows.length ? detectFromValues(rows.map((r) => r[header])) : null;
    if (guess && !usedFields.has(guess)) {
      usedFields.add(guess);
      usedHeaders.add(header);
      mapping[header] = guess;
      sources[header] = "values";
      continue;
    }
    mapping[header] = MAP_EXTRA;
    sources[header] = "none";
  }

  return { mapping, sources };
}

export function isLeadField(target: MappingTarget): target is LeadImportField {
  return target !== MAP_EXTRA && target !== MAP_SKIP;
}
