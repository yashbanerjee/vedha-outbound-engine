"use client";

import { useTransition } from "react";
import type { AiVerdict } from "@prisma/client";
import { formatDistanceToNowStrict } from "date-fns";
import { AlertCircle, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AiBadge } from "@/components/leads/badges";
import { scoreLeadsAction } from "@/lib/leads/actions";

type LeadAi = {
  id: string;
  website: string | null;
  aiScore: number | null;
  aiVerdict: AiVerdict | null;
  aiSummary: string | null;
  aiReasons: string[];
  aiDetectedIndustry: string | null;
  aiScoredAt: Date | null;
  aiError: string | null;
};

export function AiPanel({ lead, pending, canScore }: { lead: LeadAi; pending: boolean; canScore: boolean }) {
  const [busy, startTransition] = useTransition();

  const rescore = () =>
    startTransition(async () => {
      const res = await scoreLeadsAction([lead.id]);
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4" />
          AI pre-filter
        </CardTitle>
        {canScore && lead.website && (
          <CardAction>
            <Button size="sm" variant="ghost" onClick={rescore} disabled={busy || pending}>
              {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              {lead.aiScoredAt ? "Re-score" : "Score now"}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!lead.website ? (
          <p className="text-muted-foreground">Add a website to this lead to enable AI scoring.</p>
        ) : pending ? (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Queued for scoring. Results appear once the worker processes it.
          </p>
        ) : lead.aiScoredAt == null && !lead.aiError ? (
          <p className="text-muted-foreground">This lead has not been scored yet.</p>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <AiBadge score={lead.aiScore} verdict={lead.aiVerdict} />
              {lead.aiScoredAt && (
                <span className="text-xs text-muted-foreground">{formatDistanceToNowStrict(lead.aiScoredAt, { addSuffix: true })}</span>
              )}
            </div>
            {lead.aiScore != null && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={
                    "h-full rounded-full " +
                    (lead.aiVerdict === "GOOD" ? "bg-emerald-500" : lead.aiVerdict === "MAYBE" ? "bg-amber-500" : "bg-rose-500")
                  }
                  style={{ width: `${lead.aiScore}%` }}
                />
              </div>
            )}
            {lead.aiSummary && <p>{lead.aiSummary}</p>}
            {lead.aiDetectedIndustry && (
              <p className="text-xs text-muted-foreground">
                Detected industry: <span className="text-foreground">{lead.aiDetectedIndustry}</span>
              </p>
            )}
            {lead.aiReasons.length > 0 && (
              <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                {lead.aiReasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            )}
            {lead.aiError && (
              <p className="flex items-start gap-2 rounded-lg bg-destructive/10 p-2 text-xs text-destructive">
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                {lead.aiError}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
