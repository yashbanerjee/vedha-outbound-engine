"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { LeadForm } from "@/components/leads/lead-form";
import { createLeadAction } from "@/lib/leads/actions";

export function AddLeadDialog({ sources }: { sources: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus />
          Add lead
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add a lead</DialogTitle>
          <DialogDescription>Manually add a single lead to the archive. Duplicates (same domain or email) are rejected.</DialogDescription>
        </DialogHeader>
        <LeadForm
          sources={sources}
          action={createLeadAction}
          submitLabel="Add lead"
          onCancel={() => setOpen(false)}
          onSuccess={() => {
            setOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
