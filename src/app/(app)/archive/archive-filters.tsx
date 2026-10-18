"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AI_VERDICTS, AI_VERDICT_LABEL, LEAD_STATUSES, LEAD_STATUS_LABEL } from "@/lib/leads/constants";

const ALL = "__all__";

type Props = {
  sources: { id: string; name: string }[];
  industries: string[];
  countries: string[];
  aiEnabled?: boolean;
};

export function ArchiveFilters({ sources, industries, countries, aiEnabled = true }: Props) {
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

  // Debounce search input.
  useEffect(() => {
    const current = sp.get("q") ?? "";
    if (q === current) return;
    const t = setTimeout(() => setParam("q", q.trim() || null), 350);
    return () => clearTimeout(t);
  }, [q, sp, setParam]);

  const activeCount = ["status", "source", "verdict", "industry", "country", "assigned", "minScore", "q"].filter((k) => sp.get(k)).length;

  const FilterSelect = ({
    param,
    placeholder,
    options,
    width = "w-[150px]",
  }: {
    param: string;
    placeholder: string;
    options: { value: string; label: string }[];
    width?: string;
  }) => (
    <Select value={sp.get(param) ?? ALL} onValueChange={(v) => setParam(param, v)}>
      <SelectTrigger className={width} size="sm">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{placeholder}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search company, domain, contact..."
          className="h-8 w-[260px] pl-8"
        />
      </div>
      <FilterSelect
        param="status"
        placeholder="All statuses"
        options={LEAD_STATUSES.map((s) => ({ value: s, label: LEAD_STATUS_LABEL[s] }))}
      />
      {aiEnabled && (
        <FilterSelect
          param="verdict"
          placeholder="AI: any"
          width="w-[130px]"
          options={[...AI_VERDICTS.map((v) => ({ value: v, label: AI_VERDICT_LABEL[v] })), { value: "unscored", label: "Unscored" }]}
        />
      )}
      <FilterSelect
        param="source"
        placeholder="All sources"
        options={[...sources.map((s) => ({ value: s.id, label: s.name })), { value: "none", label: "No source" }]}
      />
      {industries.length > 0 && (
        <FilterSelect param="industry" placeholder="All industries" options={industries.map((i) => ({ value: i, label: i }))} />
      )}
      {countries.length > 0 && (
        <FilterSelect param="country" placeholder="All countries" options={countries.map((c) => ({ value: c, label: c }))} />
      )}
      <FilterSelect
        param="assigned"
        placeholder="Assigned: any"
        width="w-[140px]"
        options={[
          { value: "yes", label: "Assigned" },
          { value: "no", label: "Unassigned" },
        ]}
      />
      <FilterSelect
        param="sort"
        placeholder="Newest first"
        width="w-[140px]"
        options={[
          { value: "oldest", label: "Oldest first" },
          ...(aiEnabled ? [{ value: "score", label: "AI score" }] : []),
          { value: "company", label: "Company A-Z" },
        ]}
      />
      {activeCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setQ("");
            const keep = new URLSearchParams();
            const sort = sp.get("sort");
            if (sort) keep.set("sort", sort);
            startTransition(() => router.replace(`${pathname}?${keep.toString()}`));
          }}
        >
          <X />
          Clear
        </Button>
      )}
    </div>
  );
}
