import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { can, type Permission, type SessionUser } from "@/lib/auth/permissions";

// Memoised per request: the layout and the page both ask for the user, so
// the session cookie is only decoded once per render.
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth();
  const u = session?.user;
  if (!u?.id) return null;
  return {
    id: u.id,
    email: u.email ?? "",
    name: u.name ?? "",
    roleId: u.roleId,
    roleName: u.roleName,
    teamId: u.teamId ?? null,
    permissions: u.permissions ?? [],
  };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** For pages: redirects to the dashboard when the permission is missing. */
export async function requirePermission(...permissions: Permission[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!permissions.some((p) => can(user, p))) redirect("/?denied=1");
  return user;
}

export class ForbiddenError extends Error {
  constructor(message = "You do not have permission to do this.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** For server actions: throws instead of redirecting. */
export async function assertPermission(...permissions: Permission[]): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new ForbiddenError("You must be signed in.");
  if (!permissions.some((p) => can(user, p))) throw new ForbiddenError();
  return user;
}
