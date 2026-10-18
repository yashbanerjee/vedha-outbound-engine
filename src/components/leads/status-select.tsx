"use client";

import { useOptimistic, useTransition } from "react";
import type { LeadStatus } from "@prisma/client";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LEAD_STATUSES, LEAD_STATUS_CLASS, LEAD_STATUS_LABEL } from "@/lib/leads/constants";
import { updateLeadStatusAction } from "@/lib/leads/actions";
import { cn } from "@/lib/utils";

export function StatusSelect({
  leadId,
  status,
  disabled,
  size = "sm",
  className,
}: {
  leadId: string;
  status: LeadStatus;
  disabled?: boolean;
  size?: "sm" | "default";
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(status);

  const onChange = (next: string) => {
    startTransition(async () => {
      setOptimistic(next as LeadStatus);
      const res = await updateLeadStatusAction(leadId, next);
      if (!res.ok) toast.error(res.error);
      else if (res.message) toast.success(res.message);
    });
  };

  return (
    <Select value={optimistic} onValueChange={onChange} disabled={disabled || pending}>
      <SelectTrigger size={size} className={cn("h-7 w-[150px] border font-medium", LEAD_STATUS_CLASS[optimistic], className)}>
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {LEAD_STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            {LEAD_STATUS_LABEL[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
