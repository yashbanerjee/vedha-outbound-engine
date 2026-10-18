"use client";

import { useState, useTransition } from "react";
import { Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createUserAction, updateUserAction } from "@/lib/admin/actions";

const NONE = "__none__";

export type UserRow = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  roleId: string;
  teamId: string | null;
};

export function UserDialog({
  user,
  roles,
  teams,
}: {
  user?: UserRow;
  roles: { id: string; name: string }[];
  teams: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [roleId, setRoleId] = useState(user?.roleId ?? roles.find((r) => r.name === "BDE")?.id ?? roles[0]?.id ?? "");
  const [teamId, setTeamId] = useState(user?.teamId ?? NONE);
  const [isActive, setIsActive] = useState(user?.isActive ?? true);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: String(fd.get("name") ?? ""),
      email: String(fd.get("email") ?? ""),
      password: String(fd.get("password") ?? ""),
      roleId,
      teamId: teamId === NONE ? null : teamId,
      isActive,
    };
    startTransition(async () => {
      const res = user ? await updateUserAction(user.id, payload) : await createUserAction(payload);
      if (res.ok) {
        toast.success(res.message);
        setOpen(false);
        setErrors({});
      } else {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.error);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {user ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${user.name}`}>
            <Pencil />
          </Button>
        ) : (
          <Button size="sm">
            <Plus />
            New user
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{user ? "Edit user" : "Create user"}</DialogTitle>
            <DialogDescription>{user ? "Leave the password blank to keep it unchanged." : "They can sign in right away with this password."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="u-name">Full name</Label>
              <Input id="u-name" name="name" defaultValue={user?.name} required aria-invalid={!!errors.name} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-email">Email</Label>
              <Input id="u-email" name="email" type="email" defaultValue={user?.email} required aria-invalid={!!errors.email} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-password">{user ? "New password (optional)" : "Password"}</Label>
              <Input id="u-password" name="password" type="password" minLength={user ? undefined : 8} required={!user} aria-invalid={!!errors.password} />
              {errors.password && <p className="text-xs text-destructive">{errors.password[0]}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={roleId} onValueChange={setRoleId}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Team</Label>
                <Select value={teamId} onValueChange={setTeamId}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No team</SelectItem>
                    {teams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {user && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={isActive} onCheckedChange={(v) => setIsActive(v === true)} />
                Account is active (inactive users cannot sign in)
              </label>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              {user ? "Save changes" : "Create user"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
