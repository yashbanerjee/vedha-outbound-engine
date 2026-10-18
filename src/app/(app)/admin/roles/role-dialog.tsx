"use client";

import { useState, useTransition } from "react";
import { Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import { saveRoleAction } from "@/lib/admin/actions";

export type RoleRow = { id: string; name: string; description: string | null; isSystem: boolean; permissions: string[] };

const GROUPS: { title: string; keys: Permission[] }[] = [
  { title: "Lead archive", keys: ["leads.view_all", "leads.view_archive", "leads.create", "leads.import", "leads.edit", "leads.delete"] },
  { title: "Working leads", keys: ["leads.allocate", "leads.update_status", "leads.comment"] },
  { title: "AI pre-filter", keys: ["ai.score", "ai.settings"] },
  { title: "Administration", keys: ["admin.users", "admin.teams", "admin.roles", "admin.sources"] },
];

export function RoleDialog({ role }: { role?: RoleRow }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [perms, setPerms] = useState<Set<string>>(new Set(role?.permissions ?? ["leads.update_status", "leads.comment"]));

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await saveRoleAction(role?.id ?? null, {
        name: String(fd.get("name") ?? ""),
        description: String(fd.get("description") ?? ""),
        permissions: Array.from(perms),
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
        {role ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${role.name}`}>
            <Pencil />
          </Button>
        ) : (
          <Button size="sm">
            <Plus />
            New role
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{role ? `Edit role: ${role.name}` : "Create role"}</DialogTitle>
            <DialogDescription>Permissions take effect for signed-in users within a few minutes, or on their next sign-in.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="r-name">Role name</Label>
                <Input id="r-name" name="name" defaultValue={role?.name} required disabled={role?.isSystem} />
                {role?.isSystem && <input type="hidden" name="name" value={role.name} />}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="r-desc">Description</Label>
                <Input id="r-desc" name="description" defaultValue={role?.description ?? ""} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {GROUPS.map((g) => (
                <div key={g.title} className="rounded-lg border p-3">
                  <p className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">{g.title}</p>
                  <div className="space-y-2">
                    {g.keys.map((k) => (
                      <label key={k} className="flex items-start gap-2 text-sm">
                        <Checkbox
                          className="mt-0.5"
                          checked={perms.has(k)}
                          onCheckedChange={(v) =>
                            setPerms((prev) => {
                              const next = new Set(prev);
                              if (v === true) next.add(k);
                              else next.delete(k);
                              return next;
                            })
                          }
                        />
                        <span>
                          <span className="font-mono text-xs">{k}</span>
                          <span className="block text-xs text-muted-foreground">{PERMISSIONS[k]}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              {role ? "Save changes" : "Create role"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
