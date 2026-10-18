"use client";

import { useState, useTransition } from "react";
import { Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { saveAccessRuleAction } from "@/lib/admin/actions";
import { parseTags } from "@/lib/leads/normalize";

export type AccessRuleRow = {
  id: string;
  name: string;
  roleId: string | null;
  teamId: string | null;
  sourceIds: string[];
  industries: string[];
  countries: string[];
  tags: string[];
  minAiScore: number | null;
};

type Props = {
  rule?: AccessRuleRow;
  roles: { id: string; name: string }[];
  teams: { id: string; name: string }[];
  sources: { id: string; name: string }[];
};

export function AccessRuleDialog({ rule, roles, teams, sources }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const initialTarget = rule?.roleId ? `role:${rule.roleId}` : rule?.teamId ? `team:${rule.teamId}` : "";
  const [target, setTarget] = useState(initialTarget);
  const [sourceIds, setSourceIds] = useState<Set<string>>(new Set(rule?.sourceIds ?? []));

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const [targetType, targetId] = target.split(":") as ["role" | "team", string];
    const minRaw = String(fd.get("minAiScore") ?? "").trim();
    startTransition(async () => {
      const res = await saveAccessRuleAction(rule?.id ?? null, {
        name: String(fd.get("name") ?? ""),
        targetType,
        targetId: targetId ?? "",
        sourceIds: Array.from(sourceIds),
        industries: parseTags(String(fd.get("industries") ?? "")),
        countries: parseTags(String(fd.get("countries") ?? "")),
        tags: parseTags(String(fd.get("tags") ?? "")),
        minAiScore: minRaw ? Number(minRaw) : null,
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
        {rule ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${rule.name}`}>
            <Pencil />
          </Button>
        ) : (
          <Button size="sm" variant="outline">
            <Plus />
            New access rule
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{rule ? "Edit access rule" : "New access rule"}</DialogTitle>
            <DialogDescription>
              Members of the chosen role or team only see archive leads that match every filter you set here. Leave a filter empty to not restrict by it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ar-name">Rule name</Label>
                <Input id="ar-name" name="name" defaultValue={rule?.name} required placeholder="e.g. UK fintech only" />
              </div>
              <div className="space-y-1.5">
                <Label>Applies to</Label>
                <Select value={target} onValueChange={setTarget}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose role or team" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Roles</SelectLabel>
                      {roles.map((r) => (
                        <SelectItem key={r.id} value={`role:${r.id}`}>
                          Role: {r.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>Teams</SelectLabel>
                      {teams.map((t) => (
                        <SelectItem key={t.id} value={`team:${t.id}`}>
                          Team: {t.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Lead sources</Label>
              <div className="flex flex-wrap gap-2 rounded-lg border p-2.5">
                {sources.length === 0 && <span className="text-xs text-muted-foreground">No sources defined.</span>}
                {sources.map((s) => (
                  <label key={s.id} className="flex items-center gap-1.5 text-sm">
                    <Checkbox
                      checked={sourceIds.has(s.id)}
                      onCheckedChange={(v) =>
                        setSourceIds((prev) => {
                          const next = new Set(prev);
                          if (v === true) next.add(s.id);
                          else next.delete(s.id);
                          return next;
                        })
                      }
                    />
                    {s.name}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ar-industries">Industries</Label>
                <Input id="ar-industries" name="industries" defaultValue={rule?.industries.join(", ")} placeholder="Fintech, SaaS" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ar-countries">Countries</Label>
                <Input id="ar-countries" name="countries" defaultValue={rule?.countries.join(", ")} placeholder="United Kingdom, Ireland" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ar-tags">Tags (any of)</Label>
                <Input id="ar-tags" name="tags" defaultValue={rule?.tags.join(", ")} placeholder="enterprise, q4" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ar-min">Minimum AI score</Label>
                <Input id="ar-min" name="minAiScore" type="number" min={0} max={100} defaultValue={rule?.minAiScore ?? ""} placeholder="e.g. 60" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Comma-separated lists. Matching is case-insensitive for industries and countries.</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !target}>
              {pending && <Loader2 className="animate-spin" />}
              {rule ? "Save rule" : "Create rule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
