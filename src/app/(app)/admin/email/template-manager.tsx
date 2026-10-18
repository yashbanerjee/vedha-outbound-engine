"use client";

import { useState, useTransition } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmailEditor } from "@/components/mail/email-editor";
import { deleteTemplateAction, saveTemplateAction } from "@/lib/mail/actions";
import { MERGE_FIELDS } from "@/lib/mail/merge";

export type TemplateItem = { id: string; name: string; subject: string; bodyHtml: string };

export function TemplateManager({ templates }: { templates: TemplateItem[] }) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-base">Templates</CardTitle>
          <CardDescription>
            Employees pick one of these on a lead and can edit it before sending. Use {MERGE_FIELDS.map((f) => `{{${f.token}}}`).join(", ")} and they are filled in from the lead.
          </CardDescription>
        </div>
        <TemplateDialog />
      </CardHeader>
      <CardContent className="space-y-2">
        {templates.length === 0 && <p className="text-sm text-muted-foreground">No templates yet.</p>}
        {templates.map((t) => (
          <div key={t.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{t.name}</p>
              <p className="truncate text-xs text-muted-foreground">{t.subject}</p>
            </div>
            <div className="flex shrink-0 gap-1">
              <TemplateDialog template={t} />
              <DeleteTemplate id={t.id} name={t.name} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function TemplateDialog({ template }: { template?: TemplateItem }) {
  const [open, setOpen] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const [name, setName] = useState(template?.name ?? "");
  const [subject, setSubject] = useState(template?.subject ?? "");
  const [bodyHtml, setBodyHtml] = useState(template?.bodyHtml ?? "<p></p>");
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      const res = await saveTemplateAction({ id: template?.id, name, subject, bodyHtml });
      if (res.ok) {
        toast.success(res.message);
        setOpen(false);
      } else toast.error(res.error);
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) return;
        setName(template?.name ?? "");
        setSubject(template?.subject ?? "");
        setBodyHtml(template?.bodyHtml ?? "<p></p>");
        setEditorKey((n) => n + 1);
      }}
    >
      <DialogTrigger asChild>
        {template ? (
          <Button variant="ghost" size="icon" className="size-8" aria-label={`Edit ${template.name}`}>
            <Pencil />
          </Button>
        ) : (
          <Button size="sm" variant="outline">
            <Plus />
            New template
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{template ? "Edit template" : "New template"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="tpl-name">Name</Label>
            <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="First contact" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tpl-subject">Subject</Label>
            <Input id="tpl-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="{{companyName}} + us" />
          </div>
          <div className="space-y-1.5">
            <Label>Body</Label>
            <EmailEditor key={editorKey} value={bodyHtml} onChange={setBodyHtml} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            Save template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteTemplate({ id, name }: { id: string; name: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8 text-muted-foreground"
      disabled={pending}
      aria-label={`Delete ${name}`}
      onClick={() => {
        if (!confirm(`Delete the template "${name}"?`)) return;
        startTransition(async () => {
          const res = await deleteTemplateAction(id);
          if (res.ok) toast.success(res.message);
          else toast.error(res.error);
        });
      }}
    >
      {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
    </Button>
  );
}
