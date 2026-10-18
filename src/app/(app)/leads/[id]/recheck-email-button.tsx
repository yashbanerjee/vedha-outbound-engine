"use client";

import { useTransition } from "react";
import { Loader2, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { verifyLeadEmailsAction } from "@/lib/leads/actions";

export function RecheckEmailButton({ leadId, checked }: { leadId: string; checked: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-6 px-1.5 text-xs text-muted-foreground"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await verifyLeadEmailsAction([leadId]);
          if (res.ok) toast.success(res.message);
          else toast.error(res.error);
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <MailCheck />}
      {checked ? "Re-check" : "Check"}
    </Button>
  );
}
