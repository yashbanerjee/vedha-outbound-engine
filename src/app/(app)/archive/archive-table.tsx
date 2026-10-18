"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { ExternalLink, Loader2, MailCheck, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AiBadge, EmailBadge, StatusBadge } from "@/components/leads/badges";
import { AllocateDialog, type AssignableUser } from "@/components/leads/allocate-dialog";
import { deleteLeadsAction, scoreLeadsAction, verifyLeadEmailsAction } from "@/lib/leads/actions";
import type { ArchiveLead } from "@/lib/leads/queries";
import { weekLabel } from "@/lib/week";

type Props = {
  leads: ArchiveLead[];
  total: number;
  users: AssignableUser[];
  allMatchingIds: string[] | null;
  perms: { canAllocate: boolean; canEdit: boolean; canScore: boolean; canDelete: boolean };
  aiEnabled: boolean;
};

export function ArchiveTable({ leads, total, users, allMatchingIds, perms, aiEnabled }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  const pageIds = useMemo(() => leads.map((l) => l.id), [leads]);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const somePageSelected = pageIds.some((id) => selected.has(id));
  const selectedIds = Array.from(selected);

  const togglePage = (checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of pageIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };
  const toggle = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const afterAction = () => {
    setSelected(new Set());
  };

  const checkEmails = () =>
    startTransition(async () => {
      const res = await verifyLeadEmailsAction(selectedIds);
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
      afterAction();
    });

  const score = () =>
    startTransition(async () => {
      const res = await scoreLeadsAction(selectedIds);
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
      if (res.ok) afterAction();
    });

  const remove = () => {
    if (!confirm(`Delete ${selectedIds.length} lead${selectedIds.length === 1 ? "" : "s"}? This cannot be undone.`)) return;
    startTransition(async () => {
      const res = await deleteLeadsAction(selectedIds);
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
      if (res.ok) afterAction();
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex min-h-9 flex-wrap items-center gap-2">
        <p className="text-sm text-muted-foreground">
          {selected.size > 0 ? (
            <>
              <span className="font-medium text-foreground">{selected.size}</span> selected
              {allMatchingIds && allMatchingIds.length > selected.size && allPageSelected && (
                <>
                  {" "}
                  &middot;{" "}
                  <button className="text-primary underline-offset-2 hover:underline" onClick={() => setSelected(new Set(allMatchingIds))}>
                    select all {allMatchingIds.length} matching
                  </button>
                </>
              )}
              {" "}&middot;{" "}
              <button className="underline-offset-2 hover:underline" onClick={() => setSelected(new Set())}>
                clear
              </button>
            </>
          ) : (
            <>
              {total.toLocaleString()} lead{total === 1 ? "" : "s"}
            </>
          )}
        </p>
        {selected.size > 0 && (
          <div className="ml-auto flex items-center gap-2">
            {perms.canAllocate && <AllocateDialog leadIds={selectedIds} users={users} onDone={afterAction} />}
            {perms.canEdit && (
              <Button size="sm" variant="outline" onClick={checkEmails} disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : <MailCheck />}
                Check emails
              </Button>
            )}
            {aiEnabled && perms.canScore && (
              <Button size="sm" variant="outline" onClick={score} disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : <Sparkles />}
                Score with AI
              </Button>
            )}
            {perms.canDelete && (
              <Button size="sm" variant="destructive" onClick={remove} disabled={pending}>
                <Trash2 />
                Delete
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allPageSelected ? true : somePageSelected ? "indeterminate" : false}
                  onCheckedChange={(v) => togglePage(v === true)}
                  aria-label="Select all on page"
                />
              </TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Industry / Location</TableHead>
              <TableHead>Status</TableHead>
              {aiEnabled && <TableHead>AI fit</TableHead>}
              <TableHead>Assigned</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Added</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.length === 0 && (
              <TableRow>
                <TableCell colSpan={aiEnabled ? 9 : 8} className="h-32 text-center text-muted-foreground">
                  No leads match these filters.
                </TableCell>
              </TableRow>
            )}
            {leads.map((lead) => (
              <TableRow key={lead.id} data-state={selected.has(lead.id) ? "selected" : undefined}>
                <TableCell>
                  <Checkbox
                    checked={selected.has(lead.id)}
                    onCheckedChange={(v) => toggle(lead.id, v === true)}
                    aria-label={`Select ${lead.companyName}`}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <Link href={`/leads/${lead.id}`} className="font-medium hover:underline">
                      {lead.companyName}
                    </Link>
                    {lead.website && (
                      <a
                        href={lead.website}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        {lead.domain ?? lead.website}
                        <ExternalLink className="size-3" />
                      </a>
                    )}
                    {lead.tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {lead.tags.slice(0, 3).map((t) => (
                          <Badge key={t} variant="secondary" className="h-4 px-1.5 text-[10px]">
                            {t}
                          </Badge>
                        ))}
                        {lead.tags.length > 3 && <span className="text-[10px] text-muted-foreground">+{lead.tags.length - 3}</span>}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col text-sm">
                    <span>{lead.contactName ?? <span className="text-muted-foreground">-</span>}</span>
                    {lead.email && (
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {lead.email}
                        <EmailBadge status={lead.emailStatus} detail={lead.emailStatusDetail} />
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col text-sm">
                    <span>{lead.industry ?? <span className="text-muted-foreground">-</span>}</span>
                    {(lead.city || lead.country) && (
                      <span className="text-xs text-muted-foreground">{[lead.city, lead.country].filter(Boolean).join(", ")}</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge status={lead.status} />
                </TableCell>
                {aiEnabled && (
                  <TableCell>
                    <AiBadge score={lead.aiScore} verdict={lead.aiVerdict} pending={lead.aiJobs.length > 0} />
                  </TableCell>
                )}
                <TableCell>
                  {lead.assignments.length === 0 ? (
                    <span className="text-xs text-muted-foreground">Unassigned</span>
                  ) : (
                    <div className="flex flex-col gap-0.5">
                      {lead.assignments.map((a) => (
                        <span key={a.id} className="text-xs">
                          <span className="font-medium">{a.user.name}</span>
                          <span className="text-muted-foreground"> &middot; {weekLabel(a.weekStart)}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{lead.source?.name ?? "-"}</TableCell>
                <TableCell className="text-right text-xs whitespace-nowrap text-muted-foreground">
                  {formatDistanceToNowStrict(lead.createdAt, { addSuffix: true })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
