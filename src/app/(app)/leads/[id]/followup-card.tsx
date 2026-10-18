"use client";

import { useState, useTransition } from "react";
import { CalendarClock, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { completeFollowUpAction } from "@/lib/leads/actions";
import { ordinal } from "@/lib/leads/followups";

export function FollowUpCard({
  leadId,
  stage,
  totalStages,
  dueDay,
  overdueDays,
  canUpdate,
}: {
  leadId: string;
  stage: number;
  totalStages: number;
  dueDay: number | null;
  overdueDays: number | null;
  canUpdate: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);
  const finished = dueDay == null;

  const markSent = () =>
    startTransition(async () => {
      const res = await completeFollowUpAction(leadId);
      if (res.ok) {
        setSent(true);
        toast.success(res.message);
      } else toast.error(res.error);
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="size-4" />
          Follow-up
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {finished || sent ? (
          <p className="text-muted-foreground">{sent ? "Recorded. The schedule has moved on." : `All ${totalStages} follow-ups have been sent.`}</p>
        ) : (
          <>
            <p>
              <span className="font-medium">
                {ordinal(stage + 1)} of {totalStages}
              </span>
              <span className="text-muted-foreground"> · day {dueDay} after contact</span>
            </p>
            <p className={overdueDays && overdueDays > 0 ? "font-medium text-rose-700" : "text-muted-foreground"}>
              {overdueDays == null ? "Not due yet." : overdueDays > 0 ? `${overdueDays}d overdue.` : "Due today."}
            </p>
            {canUpdate && overdueDays != null && (
              <Button size="sm" onClick={markSent} disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : <Check />}
                Mark follow-up sent
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
