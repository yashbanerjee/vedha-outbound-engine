"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Pagination({ page, pageCount, total, pageSize }: { page: number; pageCount: number; total: number; pageSize: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  if (pageCount <= 1) return null;

  const go = (p: number) => {
    const next = new URLSearchParams(sp.toString());
    if (p <= 1) next.delete("page");
    else next.set("page", String(p));
    router.push(`${pathname}?${next.toString()}`);
  };

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>
        Showing {from.toLocaleString()}-{to.toLocaleString()} of {total.toLocaleString()}
      </span>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" onClick={() => go(page - 1)} disabled={page <= 1}>
          <ChevronLeft />
          Previous
        </Button>
        <span className="px-2 tabular-nums">
          Page {page} / {pageCount}
        </span>
        <Button variant="outline" size="sm" onClick={() => go(page + 1)} disabled={page >= pageCount}>
          Next
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
