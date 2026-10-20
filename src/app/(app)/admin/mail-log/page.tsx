import Link from "next/link";
import { Suspense } from "react";
import { requirePermission } from "@/lib/auth/session";
import { getMailLog, MAIL_LOG_PAGE_SIZE, parseMailLogKind } from "@/lib/mail/log";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { cn } from "@/lib/utils";
import { LogFilters } from "./log-filters";
import { LogTable } from "./log-table";

export const dynamic = "force-dynamic";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function MailLogPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermission("email.manage");
  const sp = await searchParams;
  const kind = parseMailLogKind(first(sp.kind));
  const q = (first(sp.q) ?? "").trim();
  const page = Math.max(1, Number(first(sp.page)) || 1);
  const log = await getMailLog({ kind, q, page });

  return (
    <>
      <PageHeader title="Mail log" description="Every email sent from the shared mailbox, and every reply caught in the inbox." />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat href="/admin/mail-log?kind=sent" label="Sent" value={log.sent} active={kind === "sent"} />
        <Stat href="/admin/mail-log?kind=replies" label="Replies" value={log.replies} active={kind === "replies"} />
        <Stat href="/admin/mail-log?kind=failed" label="Failed" value={log.failed} active={kind === "failed"} />
      </div>
      <div className="mb-4">
        <Suspense>
          <LogFilters />
        </Suspense>
      </div>
      <LogTable rows={log.rows} />
      <div className="mt-4">
        <Pagination page={log.page} pageCount={log.pageCount} total={log.total} pageSize={MAIL_LOG_PAGE_SIZE} />
      </div>
    </>
  );
}

function Stat({ href, label, value, active }: { href: string; label: string; value: number; active: boolean }) {
  return (
    <Link href={href} className={cn("rounded-xl border bg-background px-4 py-3 transition-colors hover:bg-muted/40", active && "border-primary")}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="font-heading text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p>
    </Link>
  );
}
