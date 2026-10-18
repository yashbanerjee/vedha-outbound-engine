"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markNotificationsReadAction } from "@/lib/mail/actions";

export function MarkReadButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await markNotificationsReadAction();
        })
      }
    >
      {pending && <Loader2 className="animate-spin" />}
      Mark all read
    </Button>
  );
}
