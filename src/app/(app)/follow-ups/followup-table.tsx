"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmailBadge } from "@/components/leads/badges";
import { completeFollowUpAction } from "@/lib/leads/actions";
import { daysUntil, ordinal } from "@/lib/leads/followups";
import { cn } from "@/lib/utils";
import type { FollowUpBucket } from "@/lib/leads/followups";
import type { FollowUpRow } from "./page";

export function FollowUpTable({
  bucket,
  days,
  showAssignee,
  leads,
  truncated,
}: {
  bucket: FollowUpBucket;
  days: number[];
  showAssignee: boolean;
  leads: FollowUpRow[];
  truncated: boolean;
}) {
  if (leads.length === 0) {
    return (
      <div className="rounded-xl border bg-background p-10 text-center">
        <p className="font-medium">{bucket === "due" ? "Nothing due right now" : bucket === "upcoming" ? "No follow-ups scheduled" : "No completed cycles yet"}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {bucket === "due"
            ? "Leads appear here once they have been marked Contacted and their next follow-up date arrives."
            : "Mark a lead as Contacted and it joins the follow-up cycle automatically."}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Company</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Follow-up</TableHead>
            <TableHead>{bucket === "done" ? "Last sent" : "Due"}</TableHead>
            {showAssignee && <TableHead>Assigned to</TableHead>}
            {bucket === "due" && <TableHead className="text-right">Action</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.map((l) => (
            <Row key={l.id} lead={l} bucket={bucket} days={days} showAssignee={showAssignee} />
          ))}
        </TableBody>
      </Table>
      {truncated && <p className="border-t p-2 text-center text-xs text-muted-foreground">Showing the first {leads.length}. Work through these and refresh for more.</p>}
    </div>
  );
}

function Row({ lead, bucket, days, showAssignee }: { lead: FollowUpRow; bucket: FollowUpBucket; days: number[]; showAssignee: boolean }) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const dueDay = days[lead.stage];
  const overdue = lead.nextFollowUpAt ? daysUntil(new Date(lead.nextFollowUpAt)) : 0;

  const markSent = () =>
    startTransition(async () => {
      const res = await completeFollowUpAction(lead.id);
      if (res.ok) {
        setDone(true);
        toast.success(res.message);
      } else toast.error(res.error);
    });

  return (
    <TableRow className={done ? "opacity-50" : undefined}>
      <TableCell>
        <Link href={`/leads/${lead.id}`} className="font-medium hover:underline">
          {lead.companyName}
        </Link>
        {lead.domain && <p className="text-xs text-muted-foreground">{lead.domain}</p>}
      </TableCell>
      <TableCell>
        <div className="flex flex-col text-sm">
          <span>{lead.contactName ?? <span className="text-muted-foreground">-</span>}</span>
          {lead.email ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <a href={`mailto:${lead.email}`} className="hover:text-foreground">
                {lead.email}
              </a>
              <EmailBadge status={lead.emailStatus} detail={lead.emailStatusDetail} />
            </span>
          ) : (
            <span className="text-xs text-amber-700">No email on file</span>
          )}
        </div>
      </TableCell>
      <TableCell>
        {bucket === "done" ? (
          <span className="text-sm text-muted-foreground">All {lead.totalStages} sent</span>
        ) : (
          <span className="text-sm">
            {ordinal(lead.stage + 1)} of {lead.totalStages}
            {dueDay != null && <span className="text-muted-foreground"> · day {dueDay}</span>}
          </span>
        )}
      </TableCell>
      <TableCell>
        {bucket === "done" ? (
          <span className="text-sm text-muted-foreground">Contacted {lead.contactedAt}</span>
        ) : lead.nextFollowUpAt ? (
          <span className={cn("text-sm", overdue < 0 && "font-medium text-rose-700")}>
            {overdue < 0 ? `${Math.abs(overdue)}d overdue` : overdue === 0 ? "Today" : `In ${overdue}d`}
          </span>
        ) : (
          "-"
        )}
      </TableCell>
      {showAssignee && <TableCell className="text-sm text-muted-foreground">{lead.assignees.join(", ") || "Unassigned"}</TableCell>}
      {bucket === "due" && (
        <TableCell className="text-right">
          {done ? (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
              <Check className="size-3.5" /> Sent
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              {lead.email && (
                <Button size="sm" variant="outline" asChild>
                  <a href={`mailto:${lead.email}?subject=${encodeURIComponent(`Following up, ${lead.companyName}`)}`}>
                    <Mail />
                    Email
                  </a>
                </Button>
              )}
              <Button size="sm" onClick={markSent} disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : <Check />}
                Mark sent
              </Button>
            </span>
          )}
        </TableCell>
      )}
    </TableRow>
  );
}
