import Link from "next/link";
import { notFound } from "next/navigation";
import { format, formatDistanceToNowStrict } from "date-fns";
import { ArrowLeft, ExternalLink, Globe, Mail, MapPin, Phone, Tag, User } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { leadAccessWhere } from "@/lib/auth/lead-access";
import { getAssignableUsers } from "@/lib/leads/queries";
import { getAiSettings } from "@/lib/ai/queue";
import { weekLabel } from "@/lib/week";
import { ASSIGNMENT_STATUS_LABEL } from "@/lib/leads/constants";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { EmailBadge, StatusBadge } from "@/components/leads/badges";
import { RecheckEmailButton } from "./recheck-email-button";
import { FollowUpCard } from "./followup-card";
import { EmailPanel } from "./email-panel";
import { getFollowUpDays, daysUntil } from "@/lib/leads/followups";
import { getMailSettings } from "@/lib/mail/settings";
import { StatusSelect } from "@/components/leads/status-select";
import { CommentForm } from "@/components/leads/comment-form";
import { AllocateDialog } from "@/components/leads/allocate-dialog";
import { AiPanel } from "./ai-panel";
import { EditLeadDialog } from "./edit-lead-dialog";
import { UnassignButton } from "./unassign-button";
import { ActivityTimeline } from "./activity-timeline";

export const dynamic = "force-dynamic";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const access = await leadAccessWhere(user);

  const lead = await prisma.lead.findFirst({
    where: { AND: [{ id }, access] },
    include: {
      source: true,
      importJob: { select: { id: true, fileName: true, createdAt: true } },
      assignments: { include: { user: { select: { id: true, name: true } }, assignedBy: { select: { name: true } } }, orderBy: { weekStart: "desc" } },
      comments: { include: { user: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
      emails: { orderBy: { createdAt: "desc" }, take: 30, include: { sentBy: { select: { name: true } } } },
      activities: { include: { user: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 50 },
      aiJobs: { where: { status: { in: ["PENDING", "RUNNING"] } }, select: { id: true, status: true }, take: 1 },
    },
  });
  if (!lead) notFound();

  const [sources, users, aiSettings, followUpDays, mailSettings, templates] = await Promise.all([
    can(user, "leads.edit") ? prisma.leadSource.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }) : [],
    can(user, "leads.allocate") ? getAssignableUsers() : [],
    getAiSettings(),
    getFollowUpDays(),
    getMailSettings(),
    prisma.emailTemplate.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, subject: true, bodyHtml: true } }),
  ]);

  const canUpdate = can(user, "leads.update_status");
  const canSeeArchive = can(user, "leads.view_archive") || can(user, "leads.view_all");
  const customFields: [string, string][] =
    lead.customFields && typeof lead.customFields === "object" && !Array.isArray(lead.customFields)
      ? Object.entries(lead.customFields as Record<string, unknown>)
          .filter((e): e is [string, string] => typeof e[1] === "string" && e[1].trim() !== "")
      : [];

  return (
    <>
      <Link
        href={canSeeArchive ? "/archive" : "/my-leads"}
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {canSeeArchive ? "Back to archive" : "Back to my leads"}
      </Link>
      <PageHeader title={lead.companyName} description={[lead.industry, lead.city, lead.country].filter(Boolean).join(" · ") || undefined}>
        {canUpdate ? <StatusSelect leadId={lead.id} status={lead.status} size="default" className="h-8 w-[170px]" /> : <StatusBadge status={lead.status} />}
        {can(user, "leads.allocate") && (
          <AllocateDialog leadIds={[lead.id]} users={users} trigger={<Button size="sm" variant="outline">Allocate</Button>} />
        )}
        {can(user, "leads.edit") && <EditLeadDialog lead={lead} sources={sources} />}
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
              <Detail icon={Globe} label="Website">
                {lead.website ? (
                  <a href={lead.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                    {lead.domain ?? lead.website}
                    <ExternalLink className="size-3" />
                  </a>
                ) : (
                  "-"
                )}
              </Detail>
              <Detail icon={User} label="Contact">{lead.contactName ?? "-"}</Detail>
              <Detail icon={Mail} label="Email">
                {lead.email ? (
                  <span className="flex flex-wrap items-center gap-1.5">
                    <a href={`mailto:${lead.email}`} className="text-primary hover:underline">
                      {lead.email}
                    </a>
                    <EmailBadge status={lead.emailStatus} detail={lead.emailStatusDetail} />
                    {can(user, "leads.edit") && <RecheckEmailButton leadId={lead.id} checked={lead.emailStatus !== null} />}
                  </span>
                ) : (
                  "-"
                )}
              </Detail>
              <Detail icon={Phone} label="Phone">{lead.phone ?? "-"}</Detail>
              <Detail icon={MapPin} label="Location">{[lead.city, lead.country].filter(Boolean).join(", ") || "-"}</Detail>
              <Detail icon={Tag} label="Tags">
                {lead.tags.length ? (
                  <span className="flex flex-wrap gap-1">
                    {lead.tags.map((t) => (
                      <Badge key={t} variant="secondary">
                        {t}
                      </Badge>
                    ))}
                  </span>
                ) : (
                  "-"
                )}
              </Detail>
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground">Source</p>
                <p>
                  {lead.source?.name ?? "No source"}
                  {lead.importJob && (
                    <span className="text-muted-foreground">
                      {" "}
                      &middot; imported from {lead.importJob.fileName} on {format(lead.importJob.createdAt, "d MMM yyyy")}
                    </span>
                  )}
                </p>
              </div>
              {lead.notes && (
                <div className="sm:col-span-2">
                  <p className="text-xs text-muted-foreground">Notes</p>
                  <p className="whitespace-pre-wrap">{lead.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {customFields.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Additional fields</CardTitle>
                <CardDescription>Extra columns from the imported file.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
                {customFields.map(([key, value]) => (
                  <div key={key} className="min-w-0">
                    <p className="text-xs text-muted-foreground">{key}</p>
                    <p className="break-words whitespace-pre-wrap">{/^https?:\/\//i.test(value) ? (
                      <a href={value} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                        {value}
                      </a>
                    ) : (
                      value
                    )}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <EmailPanel
            leadId={lead.id}
            leadEmail={lead.email}
            canSend={can(user, "email.send")}
            mailboxReady={mailSettings.enabled && !!mailSettings.passwordEnc}
            templates={templates}
            merge={{ contactName: lead.contactName ?? "", companyName: lead.companyName, senderName: user.name }}
            messages={lead.emails.map((m) => ({
              id: m.id,
              direction: m.direction,
              status: m.status,
              subject: m.subject,
              bodyHtml: m.bodyHtml,
              bodyText: m.bodyText,
              fromAddress: m.fromAddress,
              toAddress: m.toAddress,
              senderName: m.sentBy?.name ?? null,
              createdAt: m.createdAt.toISOString(),
              error: m.error,
            }))}
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Comments ({lead.comments.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {can(user, "leads.comment") && <CommentForm leadId={lead.id} />}
              {lead.comments.length > 0 && <Separator />}
              <ul className="space-y-4">
                {lead.comments.map((c) => (
                  <li key={c.id} className="text-sm">
                    <div className="mb-1 flex items-baseline gap-2">
                      <span className="font-medium">{c.user.name}</span>
                      <span className="text-xs text-muted-foreground" title={format(c.createdAt, "d MMM yyyy, HH:mm")}>
                        {formatDistanceToNowStrict(c.createdAt, { addSuffix: true })}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap">{c.body}</p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {aiSettings.enabled && <AiPanel lead={lead} pending={lead.aiJobs.length > 0} canScore={can(user, "ai.score")} />}
          {lead.status === "CONTACTED" && lead.contactedAt && (
            <FollowUpCard
              leadId={lead.id}
              stage={lead.followUpStage}
              totalStages={followUpDays.length}
              dueDay={followUpDays[lead.followUpStage] ?? null}
              overdueDays={lead.nextFollowUpAt && lead.nextFollowUpAt <= new Date() ? Math.abs(daysUntil(lead.nextFollowUpAt)) : null}
              canUpdate={canUpdate}
            />
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Assignments</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {lead.assignments.length === 0 && <p className="text-muted-foreground">Not allocated to anyone yet.</p>}
              {lead.assignments.map((a) => (
                <div key={a.id} className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{a.user.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Week of {weekLabel(a.weekStart)} &middot; {ASSIGNMENT_STATUS_LABEL[a.status]}
                      {a.assignedBy && ` · by ${a.assignedBy.name}`}
                    </p>
                  </div>
                  {can(user, "leads.allocate") && <UnassignButton leadId={lead.id} userId={a.user.id} />}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityTimeline
                items={lead.activities.map((a) => ({
                  id: a.id,
                  type: a.type,
                  message: a.message,
                  userName: a.user?.name ?? "System",
                  createdAt: a.createdAt.toISOString(),
                }))}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function Detail({ icon: Icon, label, children }: { icon: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="break-words">{children}</div>
      </div>
    </div>
  );
}
