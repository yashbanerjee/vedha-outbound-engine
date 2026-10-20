"use client";

import { useState, useTransition } from "react";
import { CalendarClock, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveFollowUpSettingsAction } from "@/lib/ai/actions";
import { MAX_FOLLOW_UP_STAGES, ordinal } from "@/lib/leads/followups";
import { useStatusLabels } from "@/components/leads/status-label-context";

export function FollowUpSettings({ initialDays }: { initialDays: number[] }) {
  const labels = useStatusLabels();
  const [days, setDays] = useState<number[]>(initialDays);
  const [pending, startTransition] = useTransition();
  const dirty = JSON.stringify(days) !== JSON.stringify(initialDays);

  const save = () =>
    startTransition(async () => {
      const res = await saveFollowUpSettingsAction(days);
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="size-4" />
          Follow-up schedule
        </CardTitle>
        <CardDescription>
          When a lead is marked {labels.CONTACTED} it enters the follow-up queue. Each follow-up becomes due this many days after the first contact. Changing it
          re-schedules follow-ups that are not yet due.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {days.map((d, i) => (
            <div key={i} className="space-y-1.5">
              <Label htmlFor={`fu-${i}`}>{ordinal(i + 1)} follow-up</Label>
              <div className="flex items-center gap-2">
                <Input
                  id={`fu-${i}`}
                  type="number"
                  min={1}
                  max={365}
                  value={d}
                  onChange={(e) => setDays((prev) => prev.map((x, idx) => (idx === i ? Number(e.target.value) : x)))}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">days after contact</span>
                {days.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground"
                    onClick={() => setDays((prev) => prev.filter((_, idx) => idx !== i))}
                    aria-label={`Remove ${ordinal(i + 1)} follow-up`}
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between">
          {days.length < MAX_FOLLOW_UP_STAGES ? (
            <Button variant="outline" size="sm" onClick={() => setDays((prev) => [...prev, (prev[prev.length - 1] ?? 0) + 5])}>
              <Plus />
              Add follow-up
            </Button>
          ) : (
            <span />
          )}
          <Button size="sm" onClick={save} disabled={!dirty || pending}>
            {pending && <Loader2 className="animate-spin" />}
            Save schedule
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
