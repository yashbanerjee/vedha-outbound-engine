"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { retryFailedJobsAction, scoreAllUnscoredAction } from "@/lib/ai/actions";

type Props = {
  pending: number;
  running: number;
  done: number;
  failed: number;
  scored: number;
  good: number;
  maybe: number;
  bad: number;
  recentFailures: { id: string; leadId: string; companyName: string; error: string }[];
};

export function QueueStatus(p: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    startTransition(async () => {
      const res = await fn();
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
    });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scoring queue</CardTitle>
          <CardDescription>
            Processed by <code className="rounded bg-muted px-1">pnpm worker</code>. Keep it running alongside the app.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Pending" value={p.pending} />
            <Stat label="Running" value={p.running} />
            <Stat label="Done" value={p.done} />
            <Stat label="Failed" value={p.failed} tone={p.failed ? "bad" : undefined} />
          </div>
          <div className="flex flex-col gap-2">
            <Button variant="outline" size="sm" onClick={() => run(scoreAllUnscoredAction)} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Sparkles />}
              Queue all unscored leads
            </Button>
            <Button variant="outline" size="sm" onClick={() => run(retryFailedJobsAction)} disabled={pending || p.failed === 0}>
              <RefreshCw />
              Retry failed jobs
            </Button>
            <Button variant="ghost" size="sm" onClick={() => router.refresh()}>
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Results so far</CardTitle>
          <CardDescription>{p.scored.toLocaleString()} leads scored</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Bar label="Good fit" value={p.good} total={p.scored} className="bg-emerald-500" />
            <Bar label="Maybe" value={p.maybe} total={p.scored} className="bg-amber-500" />
            <Bar label="Poor fit" value={p.bad} total={p.scored} className="bg-rose-500" />
          </div>
        </CardContent>
      </Card>

      {p.recentFailures.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent failures</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {p.recentFailures.map((f) => (
              <div key={f.id}>
                <Link href={`/leads/${f.leadId}`} className="font-medium hover:underline">
                  {f.companyName}
                </Link>
                <p className="text-xs break-words text-muted-foreground">{f.error}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "bad" }) {
  return (
    <div className="rounded-lg border p-2.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`text-xl font-semibold tabular-nums ${tone === "bad" ? "text-destructive" : ""}`}>{value}</p>
    </div>
  );
}

function Bar({ label, value, total, className }: { label: string; value: number; total: number; className: string }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span>{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {value} ({pct}%)
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${className}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
