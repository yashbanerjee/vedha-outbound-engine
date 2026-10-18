"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { saveMailboxAction, testMailboxAction, checkRepliesNowAction, type MailboxInput } from "@/lib/mail/actions";
import { MAILBOX_PRESETS, type MailboxPreset } from "@/lib/mail/presets";

export function MailboxForm({
  initial,
  hasPassword,
  lastPolledAt,
  lastPollError,
}: {
  initial: MailboxInput;
  hasPassword: boolean;
  lastPolledAt: string | null;
  lastPollError: string | null;
}) {
  const [draft, setDraft] = useState<MailboxInput>(initial);
  const [preset, setPreset] = useState<MailboxPreset>("custom");
  const [pending, startTransition] = useTransition();
  const [testing, startTest] = useTransition();
  const set = <K extends keyof MailboxInput>(key: K, value: MailboxInput[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const applyPreset = (value: MailboxPreset) => {
    setPreset(value);
    if (value === "custom") return;
    const p = MAILBOX_PRESETS[value];
    setDraft((d) => ({ ...d, smtpHost: p.smtpHost, smtpPort: p.smtpPort, smtpSecure: p.smtpSecure, imapHost: p.imapHost, imapPort: p.imapPort, imapSecure: p.imapSecure, sentFolder: p.sentFolder }));
  };

  const save = () =>
    startTransition(async () => {
      const res = await saveMailboxAction(draft);
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
    });

  const test = () =>
    startTest(async () => {
      const res = await testMailboxAction(draft);
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
    });

  const checkNow = () =>
    startTest(async () => {
      const res = await checkRepliesNowAction();
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Shared mailbox</CardTitle>
        <CardDescription>
          Every employee sends from this one address, and replies are read back from its inbox. The password is stored encrypted and is never shown again.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Sending enabled</p>
            <p className="text-xs text-muted-foreground">When off, nobody can send and the inbox is not checked.</p>
          </div>
          <Switch checked={draft.enabled} onCheckedChange={(v) => set("enabled", v)} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Provider</Label>
            <Select value={preset} onValueChange={(v) => applyPreset(v as MailboxPreset)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">Custom server</SelectItem>
                <SelectItem value="gmail">Gmail / Google Workspace</SelectItem>
                <SelectItem value="microsoft">Microsoft 365 / Outlook</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Fills in the server addresses. Gmail and Microsoft 365 need an app password, with IMAP enabled.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fromName">Sender display name</Label>
            <Input id="fromName" value={draft.fromName} onChange={(e) => set("fromName", e.target.value)} placeholder="Outbound Engine" />
            <p className="text-xs text-muted-foreground">Recipients see the employee&apos;s own name, sent through this address.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fromAddress">From address</Label>
            <Input id="fromAddress" value={draft.fromAddress} onChange={(e) => set("fromAddress", e.target.value)} placeholder="hello@yourcompany.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="username">Username</Label>
            <Input id="username" value={draft.username} onChange={(e) => set("username", e.target.value)} placeholder="hello@yourcompany.com" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="password">Password {hasPassword && <span className="font-normal text-muted-foreground">(saved, leave blank to keep it)</span>}</Label>
            <Input id="password" type="password" autoComplete="new-password" value={draft.password ?? ""} onChange={(e) => set("password", e.target.value)} placeholder={hasPassword ? "••••••••" : "App password"} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="SMTP host" value={draft.smtpHost} onChange={(v) => set("smtpHost", v)} />
          <NumberField label="SMTP port" value={draft.smtpPort} onChange={(v) => set("smtpPort", v)} secure={draft.smtpSecure} onSecure={(v) => set("smtpSecure", v)} />
          <Field label="IMAP host" value={draft.imapHost} onChange={(v) => set("imapHost", v)} />
          <NumberField label="IMAP port" value={draft.imapPort} onChange={(v) => set("imapPort", v)} secure={draft.imapSecure} onSecure={(v) => set("imapSecure", v)} />
          <Field label="Sent folder" value={draft.sentFolder} onChange={(v) => set("sentFolder", v)} hint='Gmail uses "[Gmail]/Sent Mail", Microsoft 365 uses "Sent Items".' />
        </div>

        {lastPollError && <p className="text-sm text-destructive">Last inbox check failed: {lastPollError}</p>}
        {lastPolledAt && !lastPollError && <p className="text-xs text-muted-foreground">Inbox last checked {lastPolledAt}.</p>}

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={checkNow} disabled={testing || !hasPassword}>
            Check for replies now
          </Button>
          <Button variant="outline" onClick={test} disabled={testing}>
            {testing && <Loader2 className="animate-spin" />}
            Test connection
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            Save mailbox
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function NumberField({ label, value, onChange, secure, onSecure }: { label: string; value: number; onChange: (v: number) => void; secure: boolean; onSecure: (v: boolean) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-3">
        <Input type="number" className="w-28" value={value} onChange={(e) => onChange(Number(e.target.value))} />
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={secure} onCheckedChange={onSecure} />
          SSL
        </label>
      </div>
    </div>
  );
}
