"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { allocateLeadsAction } from "@/lib/leads/actions";
import { weekOptions } from "@/lib/week";

export type AssignableUser = {
  id: string;
  name: string;
  email: string;
  team: { id: string; name: string } | null;
  role: { name: string };
};

export function AllocateDialog({
  leadIds,
  users,
  onDone,
  trigger,
}: {
  leadIds: string[];
  users: AssignableUser[];
  onDone?: () => void;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState<string>("");
  const weeks = useMemo(() => weekOptions(1, 8), []);
  const [weekKey, setWeekKey] = useState<string>(weeks.find((w) => w.isCurrent)?.key ?? weeks[0].key);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [pending, startTransition] = useTransition();

  const grouped = useMemo(() => {
    const map = new Map<string, AssignableUser[]>();
    for (const u of users) {
      const key = u.team?.name ?? "No team";
      map.set(key, [...(map.get(key) ?? []), u]);
    }
    return Array.from(map.entries());
  }, [users]);

  const submit = () => {
    startTransition(async () => {
      const res = await allocateLeadsAction({ leadIds, userId, weekKey, replaceExisting });
      if (res.ok) {
        toast.success(res.message);
        setOpen(false);
        onDone?.();
      } else {
        toast.error(res.error);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" disabled={leadIds.length === 0}>
            <UserPlus />
            Allocate {leadIds.length > 0 ? `(${leadIds.length})` : ""}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Allocate {leadIds.length === 1 ? "lead" : `${leadIds.length} leads`}</DialogTitle>
          <DialogDescription>Choose who should work these leads and in which week they should appear.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>BDE / account</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a person" />
              </SelectTrigger>
              <SelectContent>
                {grouped.map(([team, members]) => (
                  <SelectGroup key={team}>
                    <SelectLabel>{team}</SelectLabel>
                    {members.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name} <span className="text-muted-foreground">&middot; {u.role.name}</span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Work week</Label>
            <Select value={weekKey} onValueChange={setWeekKey}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {weeks.map((w) => (
                  <SelectItem key={w.key} value={w.key}>
                    {w.label}
                    {w.isCurrent ? " (this week)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={replaceExisting} onCheckedChange={(v) => setReplaceExisting(v === true)} className="mt-0.5" />
            <span>
              Remove other people&apos;s assignments on these leads
              <span className="block text-xs text-muted-foreground">Leave unchecked to add this person alongside existing assignees.</span>
            </span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!userId || pending}>
            {pending && <Loader2 className="animate-spin" />}
            Allocate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
