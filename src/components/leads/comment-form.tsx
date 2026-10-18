"use client";

import { useRef, useState, useTransition } from "react";
import { Loader2, MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { addCommentAction } from "@/lib/leads/actions";

export function CommentForm({ leadId, onDone, autoFocus }: { leadId: string; onDone?: () => void; autoFocus?: boolean }) {
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLTextAreaElement>(null);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const body = ref.current?.value ?? "";
    if (!body.trim()) return;
    startTransition(async () => {
      const res = await addCommentAction(leadId, body);
      if (res.ok) {
        if (ref.current) ref.current.value = "";
        toast.success("Comment added.");
        onDone?.();
      } else toast.error(res.error);
    });
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      <Textarea
        ref={ref}
        autoFocus={autoFocus}
        rows={3}
        placeholder="Add a note about this lead: who you spoke to, what they said, next step..."
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") e.currentTarget.form?.requestSubmit();
        }}
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Cmd/Ctrl + Enter to post</span>
        <Button type="submit" size="sm" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          Post comment
        </Button>
      </div>
    </form>
  );
}

export function QuickCommentDialog({ leadId, companyName }: { leadId: string; companyName: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" aria-label={`Comment on ${companyName}`}>
          <MessageSquarePlus />
          Comment
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Comment on {companyName}</DialogTitle>
          <DialogDescription>Visible to everyone who can see this lead.</DialogDescription>
        </DialogHeader>
        <CommentForm leadId={leadId} autoFocus onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
