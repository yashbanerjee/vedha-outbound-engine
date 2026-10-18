import Link from "next/link";
import { LogOut, Radar } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { can, canAny } from "@/lib/auth/permissions";
import { SidebarNav, type NavItem } from "@/components/app-shell/sidebar-nav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { logoutAction } from "@/app/login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const unreadReplies = await prisma.notification.count({ where: { userId: user.id, readAt: null } });

  const items: NavItem[] = [{ href: "/", label: "Dashboard", icon: "dashboard", exact: true }];
  items.push({ href: "/my-leads", label: "My leads", icon: "myLeads" });
  items.push({ href: "/follow-ups", label: "Follow-ups", icon: "followUps" });
  items.push({ href: "/notifications", label: "Replies", icon: "replies", badge: unreadReplies });
  if (canAny(user, "leads.view_archive", "leads.view_all")) {
    items.push({ href: "/archive", label: "Lead archive", icon: "archive" });
  }
  if (can(user, "leads.import")) items.push({ href: "/archive/import", label: "Import CSV", icon: "import" });

  const adminItems: NavItem[] = [];
  if (can(user, "admin.users")) adminItems.push({ href: "/admin/users", label: "Users", icon: "users" });
  if (can(user, "admin.teams")) adminItems.push({ href: "/admin/teams", label: "Teams", icon: "teams" });
  if (can(user, "admin.roles")) adminItems.push({ href: "/admin/roles", label: "Roles & access", icon: "roles" });
  if (can(user, "admin.sources")) adminItems.push({ href: "/admin/sources", label: "Lead sources", icon: "sources" });
  if (can(user, "ai.settings")) adminItems.push({ href: "/admin/ai-settings", label: "AI pre-filter", icon: "ai" });
  if (can(user, "email.manage")) adminItems.push({ href: "/admin/email", label: "Email", icon: "email" });

  return (
    <div className="flex min-h-screen bg-muted/30">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r bg-background">
        <Link href="/" className="flex items-center gap-2.5 border-b px-4 py-4">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Radar className="size-4" />
          </div>
          <span className="font-heading font-semibold tracking-tight">Outbound Engine</span>
        </Link>
        <SidebarNav items={items} adminItems={adminItems} />
        <div className="border-t p-3">
          <div className="mb-2 px-1">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            <Badge variant="secondary" className="mt-1.5">
              {user.roleName}
            </Badge>
          </div>
          <form action={logoutAction}>
            <Button type="submit" variant="ghost" size="sm" className="w-full justify-start">
              <LogOut />
              Sign out
            </Button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-7xl p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
