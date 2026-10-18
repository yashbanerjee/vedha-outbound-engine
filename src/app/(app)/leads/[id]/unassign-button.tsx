"use client";

import { useTransition } from "react";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { unassignLeadAction } from "@/lib/leads/actions";

export function UnassignButton({ leadId, userId }: { leadId: string; userId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="icon-xs"
      variant="ghost"
      aria-label="Remove assignment"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await unassignLeadAction(leadId, userId);
          if (res.ok) toast.success(res.message);
          else toast.error(res.error);
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <X />}
    </Button>
  );
}
