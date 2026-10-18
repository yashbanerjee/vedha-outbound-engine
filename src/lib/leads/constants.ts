import type { AiVerdict, AssignmentStatus, LeadStatus } from "@prisma/client";

export const LEAD_STATUSES: LeadStatus[] = ["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL", "WON", "LOST", "NOT_INTERESTED"];

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  QUALIFIED: "Qualified",
  PROPOSAL: "Proposal sent",
  WON: "Won",
  LOST: "Lost",
  NOT_INTERESTED: "Not interested",
};

/** Tailwind classes for status badges. */
export const LEAD_STATUS_CLASS: Record<LeadStatus, string> = {
  NEW: "bg-slate-100 text-slate-700 border-slate-200",
  CONTACTED: "bg-blue-50 text-blue-700 border-blue-200",
  QUALIFIED: "bg-violet-50 text-violet-700 border-violet-200",
  PROPOSAL: "bg-amber-50 text-amber-700 border-amber-200",
  WON: "bg-emerald-50 text-emerald-700 border-emerald-200",
  LOST: "bg-rose-50 text-rose-700 border-rose-200",
  NOT_INTERESTED: "bg-neutral-100 text-neutral-600 border-neutral-200",
};

export const AI_VERDICTS: AiVerdict[] = ["GOOD", "MAYBE", "BAD"];

export const AI_VERDICT_LABEL: Record<AiVerdict, string> = {
  GOOD: "Good fit",
  MAYBE: "Maybe",
  BAD: "Poor fit",
};

export const AI_VERDICT_CLASS: Record<AiVerdict, string> = {
  GOOD: "bg-emerald-50 text-emerald-700 border-emerald-200",
  MAYBE: "bg-amber-50 text-amber-700 border-amber-200",
  BAD: "bg-rose-50 text-rose-700 border-rose-200",
};

export const ASSIGNMENT_STATUS_LABEL: Record<AssignmentStatus, string> = {
  PENDING: "To do",
  IN_PROGRESS: "In progress",
  DONE: "Done",
};

/** Fields a CSV column can be mapped onto. */
export const LEAD_IMPORT_FIELDS = [
  { key: "companyName", label: "Company name", required: true },
  { key: "website", label: "Website" },
  { key: "contactName", label: "Contact name" },
  { key: "contactLastName", label: "Contact last name (joined to first)" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "industry", label: "Industry" },
  { key: "country", label: "Country" },
  { key: "city", label: "City" },
  { key: "tags", label: "Tags (comma/semicolon separated)" },
  { key: "notes", label: "Notes" },
] as const;

export type LeadImportField = (typeof LEAD_IMPORT_FIELDS)[number]["key"];
