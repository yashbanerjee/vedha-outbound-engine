"use client";

import { useRef, useState, useTransition } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { Loader2, Mail, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmailEditor } from "@/components/mail/email-editor";
import { sendLeadEmailAction } from "@/lib/mail/actions";
import { MERGE_FIELDS, applyMerge, isRichHtml, sanitizeEmailHtml } from "@/lib/mail/merge";

type Template = { id: string; name: string; subject: string; bodyHtml: string };
type Message = {
  id: string;
  direction: "OUTBOUND" | "INBOUND";
  status: "SENT" | "FAILED" | "RECEIVED";
  subject: string;
  bodyHtml: string;
  bodyText: string;
  fromAddress: string;
  toAddress: string;
  senderName: string | null;
  createdAt: string;
  error: string | null;
};

function HtmlFrame({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const fit = () => {
    const frame = ref.current;
    const doc = frame?.contentDocument;
    if (!frame || !doc) return;
    frame.style.height = `${doc.documentElement.scrollHeight}px`;
  };
  return (
    <iframe
      ref={ref}
      title="Email"
      sandbox="allow-same-origin"
      srcDoc={html}
      onLoad={fit}
      className="mt-2 w-full min-h-24 border-0 bg-white"
    />
  );
}

function EmailBody({ html, text }: { html: string; text: string }) {
  if (html.trim() && isRichHtml(html)) {
    return <HtmlFrame html={sanitizeEmailHtml(html)} />;
  }
  if (html.trim()) {
    return (
      <div
        className="mt-2 space-y-2 text-sm leading-relaxed text-foreground [&_a]:text-primary [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_p+p]:mt-3 [&_ul]:list-disc [&_ul]:pl-5"
        dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(html) }}
      />
    );
  }
  if (!text.trim()) return null;
  return <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{text}</p>;
}

export function EmailPanel({
  leadId,
  leadEmail,
  canSend,
  mailboxReady,
  templates,
  messages,
  merge,
}: {
  leadId: string;
  leadEmail: string | null;
  canSend: boolean;
  mailboxReady: boolean;
  templates: Template[];
  messages: Message[];
  merge: { contactName: string; companyName: string; senderName: string };
}) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("<p></p>");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const useTemplate = (id: string) => {
    setTemplateId(id);
    const template = templates.find((t) => t.id === id);
    if (!template) return;
    setSubject(applyMerge(template.subject, merge));
    setHtml(applyMerge(template.bodyHtml, merge));
    setOpen(true);
  };

  const toggleCompose = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const template = templates.find((t) => t.id === templateId) ?? templates[0];
    if (template) useTemplate(template.id);
    else setOpen(true);
  };

  const insertField = (token: string) => {
    const value = merge[token as keyof typeof merge] || "";
    setHtml((h) => `${h}<p>${value}</p>`);
  };

  const send = () =>
    startTransition(async () => {
      const res = await sendLeadEmailAction(leadId, subject, html);
      if (res.ok) {
        toast.success(res.message);
        setOpen(false);
        setSubject("");
        setHtml("<p></p>");
      } else toast.error(res.error);
    });

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="size-4" />
            Email
          </CardTitle>
          <CardDescription>{leadEmail ? `Sent from the shared mailbox to ${leadEmail}.` : "This lead has no email address."}</CardDescription>
        </div>
        {canSend && leadEmail && (
          <Button size="sm" variant={open ? "secondary" : "default"} onClick={toggleCompose} disabled={!mailboxReady}>
            <Send />
            Compose
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {canSend && !mailboxReady && <p className="text-sm text-muted-foreground">Sending is not set up yet. An admin connects the mailbox under Email in the admin menu.</p>}

        {open && (
          <div className="space-y-3 rounded-lg border p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Template</Label>
                <Select value={templateId} onValueChange={useTemplate}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Start from a template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Insert</Label>
                <div className="flex flex-wrap gap-1">
                  {MERGE_FIELDS.map((f) => (
                    <Button key={f.token} type="button" variant="outline" size="sm" onClick={() => insertField(f.token)}>
                      {f.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email-subject">Subject</Label>
              <Input id="email-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <EmailEditor key={templateId || "blank"} value={html} onChange={setHtml} />
            <div className="flex justify-end">
              <Button onClick={send} disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : <Send />}
                Send
              </Button>
            </div>
          </div>
        )}

        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing sent yet.</p>
        ) : (
          <ul className="space-y-3">
            {messages.map((m) => (
              <li key={m.id} className="rounded-lg border px-3 py-2 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-medium">
                    {m.direction === "INBOUND" ? "Reply" : m.status === "FAILED" ? "Failed" : "Sent"}
                    <span className="font-normal text-muted-foreground"> · {m.subject}</span>
                  </p>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDistanceToNowStrict(new Date(m.createdAt), { addSuffix: true })}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {m.direction === "INBOUND" ? `From ${m.fromAddress}` : `By ${m.senderName ?? "someone"} to ${m.toAddress}`}
                </p>
                {m.error && <p className="mt-1 text-xs text-destructive">{m.error}</p>}
                <EmailBody html={m.bodyHtml} text={m.bodyText} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
