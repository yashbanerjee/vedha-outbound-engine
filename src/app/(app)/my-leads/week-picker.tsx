"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addWeeks } from "date-fns";
import { Button } from "@/components/ui/button";
import { weekKey, weekLabel, weekStartOf, currentWeekStart } from "@/lib/week";

export function WeekPicker({ week }: { week: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const current = new Date(week + "T00:00:00Z");
  const local = new Date(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate());
  const isCurrent = weekKey(currentWeekStart()) === week;

  const go = (key: string | null) => {
    const next = new URLSearchParams(sp.toString());
    if (key) next.set("week", key);
    else next.delete("week");
    router.push(`${pathname}?${next.toString()}`);
  };

  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="icon-sm" onClick={() => go(weekKey(weekStartOf(addWeeks(local, -1))))} aria-label="Previous week">
        <ChevronLeft />
      </Button>
      <div className="min-w-[200px] text-center text-sm font-medium">
        {weekLabel(current)}
        {isCurrent && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(this week)</span>}
      </div>
      <Button variant="outline" size="icon-sm" onClick={() => go(weekKey(weekStartOf(addWeeks(local, 1))))} aria-label="Next week">
        <ChevronRight />
      </Button>
      {!isCurrent && (
        <Button variant="ghost" size="sm" onClick={() => go(null)}>
          Today
        </Button>
      )}
    </div>
  );
}
