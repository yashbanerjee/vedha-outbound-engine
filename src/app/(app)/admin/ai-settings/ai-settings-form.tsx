"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, FlaskConical, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AiBadge } from "@/components/leads/badges";
import { AI_MODELS } from "@/lib/ai/models";
import { saveAiSettingsAction, testScoreAction, type AiSettingsInput, type TestScoreResult } from "@/lib/ai/actions";

type Draft = {
  enabled: boolean;
  model: string;
  idealCustomerProfile: string;
  scoringCriteria: string;
  goodThreshold: number;
  badThreshold: number;
  autoScoreOnImport: boolean;
  maxChars: number;
  maxPages: number;
};

export function AiSettingsForm({ initial, hasApiKey }: { initial: Draft; hasApiKey: boolean }) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [saving, startSave] = useTransition();
  const [testing, startTest] = useTransition();
  const [testUrl, setTestUrl] = useState("");
  const [testResult, setTestResult] = useState<TestScoreResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const payload = (): AiSettingsInput => ({ ...draft });

  const save = () =>
    startSave(async () => {
      const res = await saveAiSettingsAction(payload());
      if (res.ok) {
        toast.success(res.message);
      } else toast.error(res.error);
    });

  const test = () =>
    startTest(async () => {
      setTestError(null);
      setTestResult(null);
      const res = await testScoreAction(testUrl, payload());
      if (res.ok) setTestResult(res.data);
      else setTestError(res.error);
    });

  return (
    <div className="space-y-6">
      {!hasApiKey && (
        <Alert>
          <AlertTriangle />
          <AlertTitle>OPENAI_API_KEY is not configured</AlertTitle>
          <AlertDescription>Add it to your .env file (and the worker&apos;s environment) before scoring will work. Settings can still be edited.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">General</CardTitle>
          <CardDescription>Turn the pre-filter on or off and choose the model.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">AI pre-filter enabled</p>
              <p className="text-xs text-muted-foreground">When off, no new scoring jobs are created and the worker skips pending ones.</p>
            </div>
            <Switch checked={draft.enabled} onCheckedChange={(v) => set("enabled", v)} />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Score automatically on import</p>
              <p className="text-xs text-muted-foreground">Queue every imported or manually added lead that has a website.</p>
            </div>
            <Switch checked={draft.autoScoreOnImport} onCheckedChange={(v) => set("autoScoreOnImport", v)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-1">
              <Label>Model</Label>
              <Select value={draft.model} onValueChange={(v) => set("model", v)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AI_MODELS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                  {!AI_MODELS.some((m) => m.id === draft.model) && <SelectItem value={draft.model}>{draft.model}</SelectItem>}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{AI_MODELS.find((m) => m.id === draft.model)?.note ?? "Custom model id"}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="maxPages">Pages to read per site</Label>
              <Input id="maxPages" type="number" min={1} max={5} value={draft.maxPages} onChange={(e) => set("maxPages", Number(e.target.value))} />
              <p className="text-xs text-muted-foreground">Homepage plus about/services/pricing pages.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="maxChars">Max characters sent to model</Label>
              <Input id="maxChars" type="number" min={1000} max={30000} step={500} value={draft.maxChars} onChange={(e) => set("maxChars", Number(e.target.value))} />
              <p className="text-xs text-muted-foreground">Lower = cheaper. 6,000 is roughly 1,500 tokens.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What makes a good lead</CardTitle>
          <CardDescription>This text is given to the model verbatim. Be concrete: industries, company size, geography, signals to look for, hard disqualifiers.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="icp">Ideal customer profile</Label>
            <Textarea id="icp" rows={5} value={draft.idealCustomerProfile} onChange={(e) => set("idealCustomerProfile", e.target.value)} placeholder="Who do you sell to? e.g. B2B SaaS companies with 20-300 employees in Europe that..." />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="criteria">Scoring criteria</Label>
            <Textarea
              id="criteria"
              rows={8}
              value={draft.scoringCriteria}
              onChange={(e) => set("scoringCriteria", e.target.value)}
              placeholder={"- Strong fit (+): ...\n- Weak fit (-): ...\n- Disqualify: ..."}
              className="font-mono text-xs"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="good">&quot;Good fit&quot; at score &ge;</Label>
              <Input id="good" type="number" min={1} max={100} value={draft.goodThreshold} onChange={(e) => set("goodThreshold", Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bad">&quot;Poor fit&quot; below score</Label>
              <Input id="bad" type="number" min={0} max={99} value={draft.badThreshold} onChange={(e) => set("badThreshold", Number(e.target.value))} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Scores between the two thresholds are labelled &quot;Maybe&quot;. Changing thresholds only affects future scoring; re-score leads to apply new criteria.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FlaskConical className="size-4" />
            Test on a URL
          </CardTitle>
          <CardDescription>Runs the current (unsaved) settings against any website so you can tune them before saving. Does not change any lead.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input value={testUrl} onChange={(e) => setTestUrl(e.target.value)} placeholder="e.g. stripe.com" onKeyDown={(e) => e.key === "Enter" && !testing && test()} />
            <Button variant="outline" onClick={test} disabled={testing || !testUrl.trim() || !hasApiKey}>
              {testing ? <Loader2 className="animate-spin" /> : <FlaskConical />}
              Test
            </Button>
          </div>
          {testError && (
            <Alert>
              <AlertTriangle />
              <AlertTitle>Scoring failed</AlertTitle>
              <AlertDescription>{testError}</AlertDescription>
            </Alert>
          )}
          {testResult && (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <AiBadge score={testResult.score} verdict={testResult.verdict} />
                <span className="text-xs text-muted-foreground">
                  {testResult.site.pagesFetched.length} page{testResult.site.pagesFetched.length === 1 ? "" : "s"} &middot; {(testResult.durationMs / 1000).toFixed(1)}s &middot;{" "}
                  {testResult.model}
                </span>
              </div>
              <p>{testResult.summary}</p>
              <p className="text-xs text-muted-foreground">
                Industry: <span className="text-foreground">{testResult.detectedIndustry}</span> &middot; Size: <span className="text-foreground">{testResult.companySize}</span>
                {testResult.disqualified && <span className="text-destructive"> &middot; disqualified</span>}
              </p>
              <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                {testResult.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
              <p className="text-[11px] text-muted-foreground">
                Read: {testResult.site.pagesFetched.join(", ")}
                {testResult.site.truncated && " (truncated)"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="sticky bottom-4 flex items-center justify-end gap-3 rounded-xl border bg-background/95 p-3 shadow-sm backdrop-blur">
        {dirty && <span className="text-xs text-muted-foreground">You have unsaved changes</span>}
        <Button variant="outline" onClick={() => setDraft(initial)} disabled={!dirty || saving}>
          Reset
        </Button>
        <Button onClick={save} disabled={!dirty || saving}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          Save settings
        </Button>
      </div>
    </div>
  );
}
