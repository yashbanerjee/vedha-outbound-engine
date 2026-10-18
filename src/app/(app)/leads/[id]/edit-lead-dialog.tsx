"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { LeadForm, type LeadFormValues } from "@/components/leads/lead-form";
import { updateLeadAction } from "@/lib/leads/actions";

export function EditLeadDialog({ lead, sources }: { lead: LeadFormValues & { id: string }; sources: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const action = updateLeadAction.bind(null, lead.id);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Pencil />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit lead</DialogTitle>
          <DialogDescription>Changes are recorded in the activity log.</DialogDescription>
        </DialogHeader>
        <LeadForm
          initial={lead}
          sources={sources}
          action={action}
          submitLabel="Save changes"
          onCancel={() => setOpen(false)}
          onSuccess={() => {
            setOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
