import type { ActivityType } from "@prisma/client";
import { format, formatDistanceToNowStrict } from "date-fns";
import { ArrowRightLeft, CalendarClock, FileUp, Mail, MailOpen, MessageSquare, Pencil, Plus, Sparkles, UserMinus, UserPlus, type LucideIcon } from "lucide-react";

const ICONS: Record<ActivityType, LucideIcon> = {
  CREATED: Plus,
  IMPORTED: FileUp,
  STATUS_CHANGED: ArrowRightLeft,
  ASSIGNED: UserPlus,
  UNASSIGNED: UserMinus,
  COMMENTED: MessageSquare,
  AI_SCORED: Sparkles,
  UPDATED: Pencil,
  FOLLOW_UP: CalendarClock,
  EMAIL_SENT: Mail,
  EMAIL_RECEIVED: MailOpen,
};

export function ActivityTimeline({
  items,
}: {
  items: { id: string; type: ActivityType; message: string; userName: string; createdAt: string }[];
}) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  return (
    <ol className="relative space-y-4 border-l pl-5">
      {items.map((a) => {
        const Icon = ICONS[a.type];
        const date = new Date(a.createdAt);
        return (
          <li key={a.id} className="text-sm">
            <span className="absolute -left-[9px] flex size-[18px] items-center justify-center rounded-full border bg-background">
              <Icon className="size-3 text-muted-foreground" />
            </span>
            <p>{a.message}</p>
            <p className="text-xs text-muted-foreground" title={format(date, "d MMM yyyy, HH:mm")}>
              {a.userName} &middot; {formatDistanceToNowStrict(date, { addSuffix: true })}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
