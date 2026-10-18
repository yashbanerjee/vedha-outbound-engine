import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import type { AiSettings, AiVerdict } from "@prisma/client";
import { fetchSiteContent, SiteFetchError, type SiteContent } from "@/lib/ai/fetch-site";

export const scoreSchema = z.object({
  score: z.number().int().min(0).max(100).describe("0-100 fit score. 100 = perfect match for the ideal customer profile."),
  summary: z.string().max(400).describe("One or two sentences: what the company does and why it is or is not a fit."),
  reasons: z.array(z.string().max(160)).min(1).max(6).describe("Short bullet reasons for the score, most important first."),
  detectedIndustry: z.string().max(80).describe("Best guess at the company's industry, e.g. 'B2B SaaS', 'Law firm'."),
  companySize: z.enum(["solo", "small", "mid", "large", "enterprise", "unknown"]).describe("Rough size inferred from the website."),
  disqualified: z.boolean().describe("True if a hard disqualifier from the criteria applies."),
});

export type ScoreOutput = z.infer<typeof scoreSchema>;

export type ScoreResult = ScoreOutput & {
  verdict: AiVerdict;
  site: Pick<SiteContent, "finalUrl" | "title" | "pagesFetched" | "truncated">;
  model: string;
};

export function verdictFor(score: number, settings: Pick<AiSettings, "goodThreshold" | "badThreshold">, disqualified: boolean): AiVerdict {
  if (disqualified) return "BAD";
  if (score >= settings.goodThreshold) return "GOOD";
  if (score < settings.badThreshold) return "BAD";
  return "MAYBE";
}

export function buildSystemPrompt(settings: Pick<AiSettings, "idealCustomerProfile" | "scoringCriteria">) {
  return [
    "You are a strict B2B lead-qualification analyst for an outbound sales team.",
    "You will be given the text content of a prospect company's website and must score how well that company matches the ideal customer profile (ICP).",
    "Base your judgement only on the website content and the company details provided. Do not invent facts.",
    "If the content is thin, be conservative and reflect that uncertainty in a mid-to-low score.",
    "",
    "## Ideal customer profile",
    settings.idealCustomerProfile.trim() || "(not specified - use general B2B sales judgement)",
    "",
    "## Scoring criteria",
    settings.scoringCriteria.trim() || "(not specified)",
    "",
    "Scoring guide: 85-100 excellent fit, 70-84 good fit, 40-69 unclear or partial fit, 0-39 poor fit. Set disqualified=true only when a hard disqualifier clearly applies.",
  ].join("\n");
}

export function buildUserPrompt(lead: { companyName: string; industry?: string | null; country?: string | null; notes?: string | null }, site: SiteContent) {
  const meta = [
    `Company name: ${lead.companyName}`,
    lead.industry ? `Industry (from import): ${lead.industry}` : null,
    lead.country ? `Country (from import): ${lead.country}` : null,
    lead.notes ? `Notes: ${lead.notes}` : null,
    `Website: ${site.finalUrl}`,
    site.title ? `Page title: ${site.title}` : null,
    site.description ? `Meta description: ${site.description}` : null,
    `Pages read: ${site.pagesFetched.length}${site.truncated ? " (content truncated)" : ""}`,
  ]
    .filter(Boolean)
    .join("\n");
  return `${meta}\n\n## Website content\n${site.text}`;
}

export class AiScoringError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "AiScoringError";
  }
}

/**
 * Fetches the lead's website and scores it with the configured model.
 * Throws `AiScoringError` with `retryable` set appropriately.
 */
export async function scoreLeadWebsite(
  lead: { companyName: string; website: string; industry?: string | null; country?: string | null; notes?: string | null },
  settings: AiSettings,
): Promise<ScoreResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new AiScoringError("OPENAI_API_KEY is not set on the server.", false);

  let site: SiteContent;
  try {
    site = await fetchSiteContent(lead.website, { maxChars: settings.maxChars, maxPages: settings.maxPages });
  } catch (err) {
    if (err instanceof SiteFetchError) {
      throw new AiScoringError(err.message, err.code === "TIMEOUT" || err.code === "UNREACHABLE");
    }
    throw new AiScoringError(err instanceof Error ? err.message : "Failed to fetch website", true);
  }

  const openai = createOpenAI({ apiKey });
  try {
    const { object } = await generateObject({
      model: openai(settings.model || "gpt-4o-mini"),
      schema: scoreSchema,
      schemaName: "LeadFitScore",
      system: buildSystemPrompt(settings),
      prompt: buildUserPrompt(lead, site),
      temperature: 0.2,
      maxRetries: 2,
    });
    return {
      ...object,
      verdict: verdictFor(object.score, settings, object.disqualified),
      site: { finalUrl: site.finalUrl, title: site.title, pagesFetched: site.pagesFetched, truncated: site.truncated },
      model: settings.model,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Model call failed";
    const retryable = !/api key|invalid_api_key|incorrect api key|model_not_found|does not exist/i.test(message);
    throw new AiScoringError(message, retryable);
  }
}
