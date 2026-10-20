"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { format, formatDistanceToNowStrict } from "date-fns";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getMailLogMessageAction, type MailLogMessage } from "@/lib/mail/log-actions";
import type { MailLogRow } from "@/lib/mail/log";
import { isRichHtml, sanitizeEmailHtml } from "@/lib/mail/merge";

export function LogTable({ rows }: { rows: MailLogRow[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<MailLogMessage | null>(null);

  const openMessage = (id: string) => {
    setOpen(true);
    setMessage(null);
    startTransition(async () => {
      const res = await getMailLogMessageAction(id);
      if (!res.ok) {
        toast.error(res.error);
        setOpen(false);
        return;
      }
      setMessage(res.data);
    });
  };

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border bg-background p-10 text-center">
        <p className="font-medium">No emails in this view</p>
        <p className="mt-1 text-sm text-muted-foreground">Sent messages and replies caught from the shared inbox show up here.</p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-xl border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Lead</TableHead>
              <TableHead>From</TableHead>
              <TableHead>To</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>By</TableHead>
              <TableHead className="text-right"> </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="whitespace-nowrap">
                  <p>{format(new Date(row.createdAt), "d MMM yyyy, HH:mm")}</p>
                  <p className="text-xs text-muted-foreground">{formatDistanceToNowStrict(new Date(row.createdAt), { addSuffix: true })}</p>
                </TableCell>
                <TableCell>
                  <KindBadge row={row} />
                </TableCell>
                <TableCell>
                  <Link href={`/leads/${row.leadId}`} className="font-medium hover:underline">
                    {row.companyName}
                  </Link>
                </TableCell>
                <TableCell className="max-w-[180px] truncate">{row.fromAddress}</TableCell>
                <TableCell className="max-w-[180px] truncate">{row.toAddress}</TableCell>
                <TableCell className="max-w-[240px] truncate">{row.subject || "(no subject)"}</TableCell>
                <TableCell className="whitespace-nowrap">{row.senderName ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" size="sm" onClick={() => openMessage(row.id)}>
                    Open
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          {pending || !message ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading email
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>{message.subject || "(no subject)"}</DialogTitle>
                <DialogDescription>
                  {format(new Date(message.createdAt), "d MMM yyyy, HH:mm")} · {message.companyName}
                </DialogDescription>
              </DialogHeader>
              <dl className="grid gap-1 text-sm">
                <Meta label="From" value={message.fromAddress} />
                <Meta label="To" value={message.toAddress} />
                <Meta label="Sent by" value={message.senderName ?? "—"} />
                <Meta label="Status" value={kindLabel(message)} />
              </dl>
              {message.error && <p className="text-sm text-destructive">{message.error}</p>}
              <EmailBody html={message.bodyHtml} text={message.bodyText} />
              <div>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/leads/${message.leadId}`}>Open lead</Link>
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function KindBadge({ row }: { row: Pick<MailLogRow, "direction" | "status"> }) {
  if (row.status === "FAILED") return <Badge variant="destructive">Failed</Badge>;
  if (row.direction === "INBOUND") return <Badge variant="secondary">Reply</Badge>;
  return <Badge variant="outline">Sent</Badge>;
}

function kindLabel(message: Pick<MailLogMessage, "direction" | "status">) {
  if (message.status === "FAILED") return "Failed";
  if (message.direction === "INBOUND") return "Reply";
  return "Sent";
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-16 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-all">{value}</dd>
    </div>
  );
}

function HtmlFrame({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const fit = () => {
    const frame = ref.current;
    const doc = frame?.contentDocument;
    if (!frame || !doc) return;
    frame.style.height = `${doc.documentElement.scrollHeight}px`;
  };
  return <iframe ref={ref} title="Email" sandbox="allow-same-origin" srcDoc={html} onLoad={fit} className="w-full min-h-24 border-0 bg-white" />;
}

function EmailBody({ html, text }: { html: string; text: string }) {
  if (html.trim() && isRichHtml(html)) return <HtmlFrame html={sanitizeEmailHtml(html)} />;
  if (html.trim()) {
    return (
      <div
        className="space-y-2 text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_p+p]:mt-3 [&_ul]:list-disc [&_ul]:pl-5"
        dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(html) }}
      />
    );
  }
  if (!text.trim()) return <p className="text-sm text-muted-foreground">This message has no body.</p>;
  return <p className="whitespace-pre-wrap text-sm leading-relaxed">{text}</p>;
}
