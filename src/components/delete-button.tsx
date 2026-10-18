"use client";

import { useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";

export function DeleteButton({
  action,
  confirmText,
  label = "Delete",
  iconOnly = true,
}: {
  action: () => Promise<ActionResult<unknown>>;
  confirmText: string;
  label?: string;
  iconOnly?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size={iconOnly ? "icon-sm" : "sm"}
      className="text-muted-foreground hover:text-destructive"
      aria-label={label}
      disabled={pending}
      onClick={() => {
        if (!confirm(confirmText)) return;
        startTransition(async () => {
          const res = await action();
          if (res.ok) toast.success(res.message ?? "Deleted.");
          else toast.error(res.error);
        });
      }}
    >
      {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
      {!iconOnly && label}
    </Button>
  );
}
