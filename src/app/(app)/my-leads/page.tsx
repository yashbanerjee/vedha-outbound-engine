import Link from "next/link";
import { Suspense } from "react";
import { ExternalLink, Inbox } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { currentWeekStart, parseWeekKey, weekKey } from "@/lib/week";
import { getAiSettings } from "@/lib/ai/queue";
import { PageHeader } from "@/components/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AiBadge, EmailBadge } from "@/components/leads/badges";
import { StatusSelect } from "@/components/leads/status-select";
import { QuickCommentDialog } from "@/components/leads/comment-form";
import { ASSIGNMENT_STATUS_LABEL } from "@/lib/leads/constants";
import { WeekPicker } from "./week-picker";

export const dynamic = "force-dynamic";

export default async function MyLeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const weekParam = Array.isArray(sp.week) ? sp.week[0] : sp.week;
  const weekStart = parseWeekKey(weekParam) ?? currentWeekStart();
  const week = weekKey(weekStart);

  const [assignments, counts, aiSettings] = await Promise.all([
    prisma.assignment.findMany({
      where: { userId: user.id, weekStart },
      orderBy: [{ status: "asc" }, { lead: { aiScore: { sort: "desc", nulls: "last" } } }, { createdAt: "asc" }],
      include: {
        lead: {
          select: {
            id: true,
            companyName: true,
            website: true,
            domain: true,
            contactName: true,
            email: true,
            emailStatus: true,
            emailStatusDetail: true,
            phone: true,
            industry: true,
            country: true,
            city: true,
            status: true,
            aiScore: true,
            aiVerdict: true,
            aiSummary: true,
            tags: true,
            _count: { select: { comments: true } },
          },
        },
        assignedBy: { select: { name: true } },
      },
    }),
    prisma.assignment.groupBy({
      by: ["status"],
      where: { userId: user.id, weekStart },
      _count: { _all: true },
    }),
    getAiSettings(),
  ]);
  const aiEnabled = aiSettings.enabled;

  const countOf = (s: "PENDING" | "IN_PROGRESS" | "DONE") => counts.find((c) => c.status === s)?._count._all ?? 0;
  const canUpdate = can(user, "leads.update_status");
  const canComment = can(user, "leads.comment");

  return (
    <>
      <PageHeader title="My leads" description="Leads allocated to you, grouped by work week.">
        <Suspense>
          <WeekPicker week={week} />
        </Suspense>
      </PageHeader>

      <div className="mb-4 grid grid-cols-3 gap-3 sm:max-w-md">
        <Stat label="To do" value={countOf("PENDING")} />
        <Stat label="In progress" value={countOf("IN_PROGRESS")} />
        <Stat label="Done" value={countOf("DONE")} />
      </div>

      {assignments.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <Inbox className="size-8 text-muted-foreground" />
            <p className="font-medium">Nothing allocated for this week</p>
            <p className="text-sm text-muted-foreground">When a manager allocates leads to you for this week they will show up here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Contact</TableHead>
                {aiEnabled && <TableHead>AI fit</TableHead>}
                <TableHead>Lead status</TableHead>
                <TableHead>Work item</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <Link href={`/leads/${a.lead.id}`} className="font-medium hover:underline">
                        {a.lead.companyName}
                      </Link>
                      {a.lead.website && (
                        <a href={a.lead.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                          {a.lead.domain ?? a.lead.website}
                          <ExternalLink className="size-3" />
                        </a>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {[a.lead.industry, a.lead.city, a.lead.country].filter(Boolean).join(" · ")}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col text-sm">
                      <span>{a.lead.contactName ?? <span className="text-muted-foreground">-</span>}</span>
                      {a.lead.email && (
                        <span className="flex items-center gap-1.5">
                          <a href={`mailto:${a.lead.email}`} className="text-xs text-muted-foreground hover:text-foreground">
                            {a.lead.email}
                          </a>
                          <EmailBadge status={a.lead.emailStatus} detail={a.lead.emailStatusDetail} />
                        </span>
                      )}
                      {a.lead.phone && <span className="text-xs text-muted-foreground">{a.lead.phone}</span>}
                    </div>
                  </TableCell>
                  {aiEnabled && (
                    <TableCell>
                      <div className="flex max-w-[260px] flex-col gap-1">
                        <AiBadge score={a.lead.aiScore} verdict={a.lead.aiVerdict} />
                        {a.lead.aiSummary && <p className="line-clamp-2 text-xs text-muted-foreground">{a.lead.aiSummary}</p>}
                      </div>
                    </TableCell>
                  )}
                  <TableCell>
                    <StatusSelect leadId={a.lead.id} status={a.lead.status} disabled={!canUpdate} />
                  </TableCell>
                  <TableCell>
                    <Badge variant={a.status === "DONE" ? "secondary" : "outline"}>{ASSIGNMENT_STATUS_LABEL[a.status]}</Badge>
                    {a.assignedBy && <p className="mt-1 text-[11px] text-muted-foreground">by {a.assignedBy.name}</p>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {canComment && <QuickCommentDialog leadId={a.lead.id} companyName={a.lead.companyName} />}
                      <Link href={`/leads/${a.lead.id}`} className="text-xs text-muted-foreground hover:text-foreground">
                        {a.lead._count.comments} note{a.lead._count.comments === 1 ? "" : "s"}
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
