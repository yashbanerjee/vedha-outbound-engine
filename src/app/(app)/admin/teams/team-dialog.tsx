"use client";

import { useState, useTransition } from "react";
import { Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { saveTeamAction } from "@/lib/admin/actions";

const NONE = "__none__";

export type TeamRow = { id: string; name: string; description: string | null; managerId: string | null; memberIds: string[] };
export type UserOption = { id: string; name: string; email: string; roleName: string; teamId: string | null };

export function TeamDialog({ team, users }: { team?: TeamRow; users: UserOption[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [managerId, setManagerId] = useState(team?.managerId ?? NONE);
  const [members, setMembers] = useState<Set<string>>(new Set(team?.memberIds ?? []));

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await saveTeamAction(team?.id ?? null, {
        name: String(fd.get("name") ?? ""),
        description: String(fd.get("description") ?? ""),
        managerId: managerId === NONE ? null : managerId,
        memberIds: Array.from(members),
      });
      if (res.ok) {
        toast.success(res.message);
        setOpen(false);
      } else toast.error(res.error);
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {team ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${team.name}`}>
            <Pencil />
          </Button>
        ) : (
          <Button size="sm">
            <Plus />
            New team
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{team ? "Edit team" : "Create team"}</DialogTitle>
            <DialogDescription>Teams group BDEs under a manager and can be given their own lead access rules.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="t-name">Team name</Label>
                <Input id="t-name" name="name" defaultValue={team?.name} required />
              </div>
              <div className="space-y-1.5">
                <Label>Manager</Label>
                <Select value={managerId} onValueChange={setManagerId}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No manager</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name} <span className="text-muted-foreground">&middot; {u.roleName}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-desc">Description</Label>
              <Input id="t-desc" name="description" defaultValue={team?.description ?? ""} placeholder="What this team focuses on" />
            </div>
            <div className="space-y-1.5">
              <Label>
                Members <span className="text-muted-foreground">({members.size})</span>
              </Label>
              <ScrollArea className="h-48 rounded-lg border">
                <div className="divide-y">
                  {users.map((u) => {
                    const inOtherTeam = u.teamId && u.teamId !== team?.id && !members.has(u.id);
                    return (
                      <label key={u.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/50">
                        <Checkbox
                          checked={members.has(u.id)}
                          onCheckedChange={(v) =>
                            setMembers((prev) => {
                              const next = new Set(prev);
                              if (v === true) next.add(u.id);
                              else next.delete(u.id);
                              return next;
                            })
                          }
                        />
                        <span className="flex-1">
                          {u.name} <span className="text-xs text-muted-foreground">&middot; {u.roleName}</span>
                        </span>
                        {inOtherTeam && <span className="text-[11px] text-muted-foreground">in another team</span>}
                      </label>
                    );
                  })}
                </div>
              </ScrollArea>
              <p className="text-xs text-muted-foreground">A user belongs to one team. Selecting someone here moves them into this team.</p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              {team ? "Save changes" : "Create team"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
