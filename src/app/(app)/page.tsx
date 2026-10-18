import Link from "next/link";
import { ArrowRight, Archive, Bot, ListChecks, Upload, Users } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { can, canAny } from "@/lib/auth/permissions";
import { leadAccessWhere } from "@/lib/auth/lead-access";
import { getAiSettings } from "@/lib/ai/queue";
import { currentWeekStart, weekLabel } from "@/lib/week";
import { LEAD_STATUSES, LEAD_STATUS_CLASS, LEAD_STATUS_LABEL } from "@/lib/leads/constants";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AiBadge, StatusBadge } from "@/components/leads/badges";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const denied = sp.denied === "1";
  const weekStart = currentWeekStart();
  const seesArchive = canAny(user, "leads.view_archive", "leads.view_all");

  const [myWeek, myPendingTotal, myRecent, aiSettings, mail] = await Promise.all([
    prisma.assignment.groupBy({ by: ["status"], where: { userId: user.id, weekStart }, _count: { _all: true } }),
    prisma.assignment.count({ where: { userId: user.id, status: { not: "DONE" } } }),
    prisma.assignment.findMany({
      where: { userId: user.id, weekStart, status: { not: "DONE" } },
      take: 5,
      orderBy: [{ createdAt: "asc" }],
      include: { lead: { select: { id: true, companyName: true, domain: true, status: true, aiScore: true, aiVerdict: true } } },
    }),
    getAiSettings(),
    mailCounts(user.id, can(user, "leads.view_all")),
  ]);
  const aiEnabled = aiSettings.enabled;
  const myCount = (s: "PENDING" | "IN_PROGRESS" | "DONE") => myWeek.find((x) => x.status === s)?._count._all ?? 0;

  let archive: null | {
    total: number;
    unassigned: number;
    unscored: number;
    byStatus: { status: string; count: number }[];
    byVerdict: { verdict: string | null; count: number }[];
    queue: { pending: number; failed: number };
    team: { id: string; name: string; teamName: string | null; thisWeek: number; done: number }[];
  } = null;

  if (seesArchive) {
    const access = await leadAccessWhere(user);
    const [total, unassigned, unscored, byStatus, byVerdict, queue, assignees] = await Promise.all([
      prisma.lead.count({ where: access }),
      prisma.lead.count({ where: { AND: [access, { assignments: { none: {} } }] } }),
      prisma.lead.count({ where: { AND: [access, { website: { not: null }, aiScoredAt: null }] } }),
      prisma.lead.groupBy({ by: ["status"], where: access, _count: { _all: true } }),
      prisma.lead.groupBy({ by: ["aiVerdict"], where: access, _count: { _all: true } }),
      prisma.aiScoringJob.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.assignment.groupBy({ by: ["userId", "status"], where: { weekStart }, _count: { _all: true } }),
    ]);
    const userIds = Array.from(new Set(assignees.map((a) => a.userId)));
    const users = userIds.length
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, team: { select: { name: true } } } })
      : [];
    archive = {
      total,
      unassigned,
      unscored,
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count._all })),
      byVerdict: byVerdict.map((v) => ({ verdict: v.aiVerdict, count: v._count._all })),
      queue: {
        pending: queue.filter((q) => q.status === "PENDING" || q.status === "RUNNING").reduce((n, q) => n + q._count._all, 0),
        failed: queue.find((q) => q.status === "FAILED")?._count._all ?? 0,
      },
      team: users
        .map((u) => ({
          id: u.id,
          name: u.name,
          teamName: u.team?.name ?? null,
          thisWeek: assignees.filter((a) => a.userId === u.id).reduce((n, a) => n + a._count._all, 0),
          done: assignees.filter((a) => a.userId === u.id && a.status === "DONE").reduce((n, a) => n + a._count._all, 0),
        }))
        .sort((a, b) => b.thisWeek - a.thisWeek),
    };
  }

  return (
    <>
      <PageHeader title={`Welcome back, ${user.name.split(" ")[0]}`} description={`Week of ${weekLabel(weekStart)}`}>
        <Button size="sm" asChild>
          <Link href="/my-leads">
            <ListChecks />
            My leads
          </Link>
        </Button>
        {seesArchive && (
          <Button size="sm" variant="outline" asChild>
            <Link href="/archive">
              <Archive />
              Archive
            </Link>
          </Button>
        )}
      </PageHeader>

      {denied && (
        <Alert className="mb-6">
          <AlertTitle>No access</AlertTitle>
          <AlertDescription>You do not have permission to open that page. Ask an admin if you think you should.</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat
          label="Emails sent"
          value={mail.sent}
          hint={mail.scope === "all" ? "Sent from the shared mailbox" : "Emails you sent"}
        />
        <Stat
          label="Replies received"
          value={mail.replies}
          hint={mail.scope === "all" ? "Replies caught in the shared inbox" : "Replies on leads you handle"}
          href="/notifications"
        />
        <Stat label="To do this week" value={myCount("PENDING")} hint="Leads allocated to you, not yet started" />
        <Stat label="In progress this week" value={myCount("IN_PROGRESS")} hint="You have made contact" />
        <Stat label="Open across all weeks" value={myPendingTotal} hint="Everything allocated to you that is not done" />
      </div>

      <div className={cn("mt-6 grid gap-6", archive && "lg:grid-cols-2")}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your next leads</CardTitle>
            <CardDescription>{aiEnabled ? "Highest AI fit first." : "Allocated to you this week."}</CardDescription>
          </CardHeader>
          <CardContent>
            {myRecent.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing open for this week. Nice.</p>
            ) : (
              <ul className="divide-y">
                {myRecent.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <Link href={`/leads/${a.lead.id}`} className="font-medium hover:underline">
                        {a.lead.companyName}
                      </Link>
                      {a.lead.domain && <p className="truncate text-xs text-muted-foreground">{a.lead.domain}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {aiEnabled && <AiBadge score={a.lead.aiScore} verdict={a.lead.aiVerdict} />}
                      <StatusBadge status={a.lead.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <Button variant="ghost" size="sm" className="mt-3" asChild>
              <Link href="/my-leads">
                Open my leads
                <ArrowRight />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {archive && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Archive health</CardTitle>
                <CardDescription>{archive.total.toLocaleString()} leads visible to you</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <MiniStat label="Unassigned" value={archive.unassigned} href="/archive?assigned=no" />
                  {aiEnabled && (
                    <>
                      <MiniStat label="Not yet AI-scored" value={archive.unscored} href="/archive?verdict=unscored" />
                      <MiniStat label="Good fit" value={archive.byVerdict.find((v) => v.verdict === "GOOD")?.count ?? 0} href="/archive?verdict=GOOD" tone="good" />
                      <MiniStat label="Poor fit" value={archive.byVerdict.find((v) => v.verdict === "BAD")?.count ?? 0} href="/archive?verdict=BAD" tone="bad" />
                    </>
                  )}
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Pipeline by status</p>
                  <div className="flex flex-wrap gap-1.5">
                    {LEAD_STATUSES.map((s) => {
                      const n = archive!.byStatus.find((x) => x.status === s)?.count ?? 0;
                      return (
                        <Link key={s} href={`/archive?status=${s}`}>
                          <Badge variant="outline" className={cn(LEAD_STATUS_CLASS[s], "tabular-nums")}>
                            {LEAD_STATUS_LABEL[s]} &middot; {n}
                          </Badge>
                        </Link>
                      );
                    })}
                  </div>
                </div>
                {aiEnabled && (archive.queue.pending > 0 || archive.queue.failed > 0) && (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Bot className="size-3.5" />
                    AI queue: {archive.queue.pending} pending
                    {archive.queue.failed > 0 && (
                      <>
                        {" "}
                        &middot; <span className="text-destructive">{archive.queue.failed} failed</span>
                      </>
                    )}
                    {can(user, "ai.settings") && (
                      <Link href="/admin/ai-settings" className="underline-offset-2 hover:underline">
                        manage
                      </Link>
                    )}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {can(user, "leads.import") && (
                    <Button size="sm" variant="outline" asChild>
                      <Link href="/archive/import">
                        <Upload />
                        Import CSV
                      </Link>
                    </Button>
                  )}
                  {can(user, "leads.allocate") && archive.unassigned > 0 && (
                    <Button size="sm" variant="outline" asChild>
                      <Link href="/archive?assigned=no&sort=score">
                        <Users />
                        Allocate unassigned
                      </Link>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Team workload this week</CardTitle>
                <CardDescription>Leads allocated per person for the week of {weekLabel(weekStart)}.</CardDescription>
              </CardHeader>
              <CardContent>
                {archive.team.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No leads allocated for this week yet.</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {archive.team.map((m) => {
                      const pct = m.thisWeek ? Math.round((m.done / m.thisWeek) * 100) : 0;
                      return (
                        <div key={m.id} className="rounded-lg border p-3">
                          <div className="flex items-baseline justify-between">
                            <p className="text-sm font-medium">{m.name}</p>
                            <p className="text-xs tabular-nums text-muted-foreground">
                              {m.done}/{m.thisWeek} done
                            </p>
                          </div>
                          {m.teamName && <p className="text-xs text-muted-foreground">{m.teamName}</p>}
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </>
  );
}

async function mailCounts(userId: string, all: boolean) {
  if (all) {
    const [sent, replies] = await Promise.all([
      prisma.emailMessage.count({ where: { direction: "OUTBOUND", status: "SENT" } }),
      prisma.emailMessage.count({ where: { direction: "INBOUND", status: "RECEIVED" } }),
    ]);
    return { sent, replies, scope: "all" as const };
  }

  const notified = await prisma.notification.findMany({
    where: { userId, leadId: { not: null } },
    select: { leadId: true },
  });
  const leadIds = Array.from(new Set(notified.map((n) => n.leadId).filter((id): id is string => Boolean(id))));
  const [sent, replies] = await Promise.all([
    prisma.emailMessage.count({ where: { direction: "OUTBOUND", status: "SENT", sentById: userId } }),
    prisma.emailMessage.count({
      where: {
        direction: "INBOUND",
        status: "RECEIVED",
        OR: [
          { lead: { assignments: { some: { userId } } } },
          { lead: { emails: { some: { direction: "OUTBOUND", sentById: userId } } } },
          ...(leadIds.length ? [{ leadId: { in: leadIds } }] : []),
        ],
      },
    }),
  ]);
  return { sent, replies, scope: "mine" as const };
}

function Stat({ label, value, hint, href }: { label: string; value: number; hint: string; href?: string }) {
  const card = (
    <Card className={href ? "h-full transition-colors hover:bg-muted/40" : "h-full"}>
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{card}</Link> : card;
}

function MiniStat({ label, value, href, tone }: { label: string; value: number; href: string; tone?: "good" | "bad" }) {
  return (
    <Link href={href} className="rounded-lg border p-3 transition-colors hover:bg-muted/50">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-xl font-semibold tabular-nums", tone === "good" && "text-emerald-700", tone === "bad" && "text-rose-700")}>{value.toLocaleString()}</p>
    </Link>
  );
}
