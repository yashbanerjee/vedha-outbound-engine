import Link from "next/link";
import { format } from "date-fns";
import { CalendarClock } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { leadAccessWhere } from "@/lib/auth/lead-access";
import { followUpLeadSelect, followUpWhere, getFollowUpDays, ordinal, type FollowUpBucket, type FollowUpLead } from "@/lib/leads/followups";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FollowUpTable } from "./followup-table";

export const dynamic = "force-dynamic";

const LIMIT = 300;

export default async function FollowUpsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser();
  const { tab } = await searchParams;
  const current: FollowUpBucket = tab === "upcoming" || tab === "done" ? tab : "due";

  const [access, days] = await Promise.all([leadAccessWhere(user), getFollowUpDays()]);
  const scope = (bucket: FollowUpBucket) => ({ AND: [access, followUpWhere(bucket)] });

  const [dueCount, upcomingCount, doneCount, leads] = await Promise.all([
    prisma.lead.count({ where: scope("due") }),
    prisma.lead.count({ where: scope("upcoming") }),
    prisma.lead.count({ where: scope("done") }),
    prisma.lead.findMany({
      where: scope(current),
      orderBy: current === "done" ? { lastFollowUpAt: "desc" } : { nextFollowUpAt: "asc" },
      take: LIMIT,
      select: followUpLeadSelect,
    }),
  ]);

  const showAssignee = can(user, "leads.view_archive") || can(user, "leads.view_all");

  return (
    <>
      <PageHeader title="Follow-ups" description="Leads marked Contacted, queued for their next outreach email.">
        {can(user, "ai.settings") && (
          <Link href="/admin/ai-settings" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <CalendarClock className="size-4" />
            Schedule: {days.map((d, i) => `${ordinal(i + 1)} at day ${d}`).join(", ")}
          </Link>
        )}
      </PageHeader>

      <Tabs value={current}>
        <TabsList>
          <TabsTrigger value="due" asChild>
            <Link href="/follow-ups">Due now ({dueCount})</Link>
          </TabsTrigger>
          <TabsTrigger value="upcoming" asChild>
            <Link href="/follow-ups?tab=upcoming">Upcoming ({upcomingCount})</Link>
          </TabsTrigger>
          <TabsTrigger value="done" asChild>
            <Link href="/follow-ups?tab=done">Cycle complete ({doneCount})</Link>
          </TabsTrigger>
        </TabsList>
        <TabsContent value={current} className="mt-4">
          <FollowUpTable
            bucket={current}
            days={days}
            showAssignee={showAssignee}
            leads={leads.map((l) => toRow(l, days.length))}
            truncated={leads.length >= LIMIT}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}

function toRow(l: FollowUpLead, totalStages: number) {
  return {
    id: l.id,
    companyName: l.companyName,
    domain: l.domain,
    contactName: l.contactName,
    email: l.email,
    emailStatus: l.emailStatus,
    emailStatusDetail: l.emailStatusDetail,
    industry: l.industry,
    country: l.country,
    stage: l.followUpStage,
    totalStages,
    contactedAt: l.contactedAt ? format(l.contactedAt, "d MMM") : null,
    nextFollowUpAt: l.nextFollowUpAt?.toISOString() ?? null,
    assignees: l.assignments.map((a) => a.user.name),
  };
}

export type FollowUpRow = ReturnType<typeof toRow>;
