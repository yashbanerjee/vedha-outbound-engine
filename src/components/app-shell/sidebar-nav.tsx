"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Archive,
  Bot,
  CalendarClock,
  Database,
  Inbox,
  Mail,
  LayoutDashboard,
  ListChecks,
  ShieldCheck,
  Upload,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; exact?: boolean; badge?: number };

const ICONS = {
  dashboard: LayoutDashboard,
  archive: Archive,
  import: Upload,
  myLeads: ListChecks,
  followUps: CalendarClock,
  users: Users,
  teams: UsersRound,
  roles: ShieldCheck,
  sources: Database,
  ai: Bot,
  email: Mail,
  replies: Inbox,
} satisfies Record<string, LucideIcon>;

export function SidebarNav({ items, adminItems }: { items: NavItem[]; adminItems: NavItem[] }) {
  const pathname = usePathname();

  const render = (item: NavItem) => {
    const Icon = ICONS[item.icon];
    const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
    return (
      <Link
        key={item.href}
        href={item.href}
        className={cn(
          "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
          active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <Icon className="size-4" />
        <span className="flex flex-1 items-center gap-2">
          {item.label}
          {item.badge ? (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-semibold text-white tabular-nums">
              {item.badge > 99 ? "99+" : item.badge}
            </span>
          ) : null}
        </span>
      </Link>
    );
  };

  return (
    <nav className="flex flex-1 flex-col gap-6 px-3 py-4">
      <div className="flex flex-col gap-1">{items.map(render)}</div>
      {adminItems.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="px-2.5 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Admin</p>
          {adminItems.map(render)}
        </div>
      )}
    </nav>
  );
}
