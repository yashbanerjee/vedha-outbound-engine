"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { LeadStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { LEAD_STATUSES, LEAD_STATUS_CLASS, LEAD_STATUS_LABEL } from "@/lib/leads/constants";
import { saveStatusLabelsAction } from "@/lib/leads/status-actions";
import type { StatusLabels } from "@/lib/leads/status-labels";
import { cn } from "@/lib/utils";

export function StatusForm({ initial }: { initial: StatusLabels }) {
  const [labels, setLabels] = useState<StatusLabels>(initial);
  const [pending, startTransition] = useTransition();
  const dirty = LEAD_STATUSES.some((status) => labels[status] !== initial[status]);

  const save = () =>
    startTransition(async () => {
      const res = await saveStatusLabelsAction(labels);
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Status names</CardTitle>
        <CardDescription>
          These words are what everyone sees on leads, filters, and the dashboard. The pipeline steps stay the same, so renaming a status does not change any lead.
          Marking a lead as {labels.CONTACTED || LEAD_STATUS_LABEL.CONTACTED} still starts the follow-up cycle.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {LEAD_STATUSES.map((status) => (
            <StatusField key={status} status={status} value={labels[status]} onChange={(value) => setLabels((current) => ({ ...current, [status]: value }))} />
          ))}
        </div>
        <Button onClick={save} disabled={pending || !dirty}>
          {pending && <Loader2 className="animate-spin" />}
          Save status names
        </Button>
      </CardContent>
    </Card>
  );
}

function StatusField({ status, value, onChange }: { status: LeadStatus; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`status-${status}`} className="flex items-center justify-between gap-2">
        <span>{LEAD_STATUS_LABEL[status]}</span>
        <Badge variant="outline" className={cn("font-normal", LEAD_STATUS_CLASS[status])}>
          {value.trim() || LEAD_STATUS_LABEL[status]}
        </Badge>
      </Label>
      <Input id={`status-${status}`} value={value} maxLength={40} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
