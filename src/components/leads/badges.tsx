"use client";

import type { AiVerdict, EmailStatus, LeadStatus } from "@prisma/client";
import { Check, HelpCircle, Sparkles, TriangleAlert, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AI_VERDICT_CLASS, AI_VERDICT_LABEL, LEAD_STATUS_CLASS } from "@/lib/leads/constants";
import { useStatusLabel } from "@/components/leads/status-label-context";

export function StatusBadge({ status, className }: { status: LeadStatus; className?: string }) {
  const label = useStatusLabel(status);
  return (
    <Badge variant="outline" className={cn(LEAD_STATUS_CLASS[status], className)}>
      {label}
    </Badge>
  );
}

export function AiBadge({
  score,
  verdict,
  pending,
  className,
}: {
  score: number | null;
  verdict: AiVerdict | null;
  pending?: boolean;
  className?: string;
}) {
  if (pending) {
    return (
      <Badge variant="outline" className={cn("border-dashed text-muted-foreground", className)}>
        <Sparkles className="animate-pulse" />
        Scoring...
      </Badge>
    );
  }
  if (score == null || !verdict) {
    return (
      <Badge variant="outline" className={cn("text-muted-foreground", className)}>
        Unscored
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className={cn(AI_VERDICT_CLASS[verdict], "tabular-nums", className)}>
      <Sparkles />
      {score} &middot; {AI_VERDICT_LABEL[verdict]}
    </Badge>
  );
}

const EMAIL_STATUS_META: Record<EmailStatus, { label: string; className: string; Icon: typeof Check }> = {
  VALID: { label: "Deliverable", className: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: Check },
  DOMAIN: { label: "Unconfirmed", className: "bg-sky-50 text-sky-800 border-sky-200", Icon: HelpCircle },
  REJECTED: { label: "Not accepting", className: "bg-rose-50 text-rose-700 border-rose-200", Icon: X },
  INVALID: { label: "Invalid", className: "bg-rose-50 text-rose-700 border-rose-200", Icon: X },
  DISPOSABLE: { label: "Disposable", className: "bg-amber-50 text-amber-700 border-amber-200", Icon: TriangleAlert },
  NO_MX: { label: "No mail server", className: "bg-rose-50 text-rose-700 border-rose-200", Icon: X },
  UNVERIFIED: { label: "Unverified", className: "bg-muted text-muted-foreground", Icon: HelpCircle },
};

export function EmailBadge({ status, detail, className }: { status: EmailStatus | null; detail?: string | null; className?: string }) {
  if (!status) return null;
  const meta = EMAIL_STATUS_META[status];
  return (
    <Badge variant="outline" title={detail ?? undefined} className={cn(meta.className, className)}>
      <meta.Icon />
      {meta.label}
    </Badge>
  );
}
