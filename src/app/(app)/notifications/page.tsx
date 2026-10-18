import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { MarkReadButton } from "./mark-read-button";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await requireUser();
  const items = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const unread = items.filter((n) => !n.readAt).length;

  return (
    <>
      <PageHeader title="Replies" description="Emails that came back on leads you are handling.">
        {unread > 0 && <MarkReadButton />}
      </PageHeader>
      {items.length === 0 ? (
        <div className="rounded-xl border bg-background p-10 text-center">
          <p className="font-medium">No replies yet</p>
          <p className="mt-1 text-sm text-muted-foreground">When someone replies to an email sent from here, it shows up for the employee assigned to that lead.</p>
        </div>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-background">
          {items.map((n) => (
            <li key={n.id} className={n.readAt ? "px-4 py-3" : "bg-primary/5 px-4 py-3"}>
              <div className="flex items-baseline justify-between gap-3">
                {n.leadId ? (
                  <Link href={`/leads/${n.leadId}`} className="text-sm font-medium hover:underline">
                    {n.title}
                  </Link>
                ) : (
                  <p className="text-sm font-medium">{n.title}</p>
                )}
                <span className="shrink-0 text-xs text-muted-foreground">{formatDistanceToNowStrict(n.createdAt, { addSuffix: true })}</span>
              </div>
              <p className="text-sm text-muted-foreground">{n.body}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
