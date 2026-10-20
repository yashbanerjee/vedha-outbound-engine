"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL = "all";

export function LogFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [, startTransition] = useTransition();
  const [q, setQ] = useState(sp.get("q") ?? "");

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(sp.toString());
      if (!value || value === ALL) next.delete(key);
      else next.set(key, value);
      next.delete("page");
      startTransition(() => router.replace(`${pathname}?${next.toString()}`));
    },
    [sp, pathname, router],
  );

  useEffect(() => {
    const current = sp.get("q") ?? "";
    if (q === current) return;
    const t = setTimeout(() => setParam("q", q.trim() || null), 350);
    return () => clearTimeout(t);
  }, [q, sp, setParam]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search subject, address, lead, sender..."
          className="h-8 w-[280px] pl-8"
        />
      </div>
      <Select value={sp.get("kind") ?? ALL} onValueChange={(value) => setParam("kind", value)}>
        <SelectTrigger className="h-8 w-[160px]" size="sm">
          <SelectValue placeholder="All mail" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All mail</SelectItem>
          <SelectItem value="sent">Sent</SelectItem>
          <SelectItem value="replies">Replies</SelectItem>
          <SelectItem value="failed">Failed</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
