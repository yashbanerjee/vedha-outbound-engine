"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import Papa from "papaparse";
import { format } from "date-fns";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Sparkles, Upload, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { LEAD_IMPORT_FIELDS, type LeadImportField } from "@/lib/leads/constants";
import { normalizeDomain, normalizeEmail } from "@/lib/leads/normalize";
import { MAP_EXTRA, MAP_SKIP, autoMapHeaders, isLeadField, type Mapping, type MappingSource, type MappingTarget } from "@/lib/leads/auto-map";
import { checkDuplicatesAction, importLeadsAction, type ImportSummary } from "@/lib/leads/import-actions";
import { cn } from "@/lib/utils";

// Select cannot hold "" as a value, so skip gets a sentinel in the UI only.
const SKIP_UI = "__skip__";
const NONE = "__none__";

type Row = Record<string, string | null>;

type RecentImport = {
  id: string;
  fileName: string;
  createdAt: string;
  importedCount: number;
  skippedCount: number;
  errorCount: number;
  totalRows: number;
  source: { name: string } | null;
  createdBy: { name: string };
};

export function ImportWizard({
  sources,
  aiEnabled,
  autoScoreDefault,
  recent,
}: {
  sources: { id: string; name: string }[];
  aiEnabled: boolean;
  autoScoreDefault: boolean;
  recent: RecentImport[];
}) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [mapSources, setMapSources] = useState<Record<string, MappingSource>>({});
  const [sourceId, setSourceId] = useState<string>(NONE);
  const [extraTags, setExtraTags] = useState("");
  const [autoScore, setAutoScore] = useState(autoScoreDefault && aiEnabled);
  const [verifyEmails, setVerifyEmails] = useState(true);
  const [dupes, setDupes] = useState<{ domains: Set<string>; emails: Set<string> } | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [pending, startTransition] = useTransition();
  const [parsing, setParsing] = useState(false);

  const onFile = useCallback((file: File) => {
    setParsing(true);
    setFileName(file.name);
    Papa.parse<Row>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
      complete: (res) => {
        const hs = (res.meta.fields ?? []).filter(Boolean);
        if (hs.length === 0 || res.data.length === 0) {
          toast.error("Could not find any rows in that file.");
          setParsing(false);
          return;
        }
        const data = res.data.slice(0, 20000);
        setHeaders(hs);
        setRows(data);
        const auto = autoMapHeaders(hs, data.slice(0, 200));
        setMapping(auto.mapping);
        setMapSources(auto.sources);
        setDupes(null);
        setSummary(null);
        setStep(2);
        setParsing(false);
        if (res.data.length > 20000) toast.warning("Only the first 20,000 rows will be imported.");
      },
      error: (err) => {
        toast.error(`Could not parse CSV: ${err.message}`);
        setParsing(false);
      },
    });
  }, []);

  const fieldToHeader = useMemo(() => {
    const m = new Map<LeadImportField, string>();
    for (const [h, t] of Object.entries(mapping)) if (isLeadField(t)) m.set(t, h);
    return m;
  }, [mapping]);

  const mappedCompany = fieldToHeader.has("companyName");
  const extraHeaders = useMemo(() => headers.filter((h) => mapping[h] === MAP_EXTRA), [headers, mapping]);
  const skippedCount = headers.filter((h) => mapping[h] === MAP_SKIP).length;
  const autoCount = headers.filter((h) => isLeadField(mapping[h]) && mapSources[h] !== "manual").length;

  const setTarget = (header: string, target: MappingTarget) => {
    setMapping((m) => {
      const next: Mapping = { ...m };
      // One header per lead field: whoever held it before becomes an additional field.
      if (isLeadField(target)) for (const k of Object.keys(next)) if (next[k] === target && k !== header) next[k] = MAP_EXTRA;
      next[header] = target;
      return next;
    });
    setMapSources((s) => ({ ...s, [header]: "manual" }));
  };

  const redetect = () => {
    const auto = autoMapHeaders(headers, rows.slice(0, 200));
    setMapping(auto.mapping);
    setMapSources(auto.sources);
    toast.success("Columns re-detected.");
  };

  // Pre-compute dedupe stats for the preview.
  const preview = useMemo(() => {
    const seenD = new Set<string>();
    const seenE = new Set<string>();
    let invalid = 0;
    let inFileDupes = 0;
    let dbDupes = 0;
    const annotated = rows.map((r) => {
      const company = fieldToHeader.get("companyName") ? r[fieldToHeader.get("companyName")!]?.trim() : "";
      const domain = normalizeDomain(fieldToHeader.get("website") ? r[fieldToHeader.get("website")!] : null);
      const email = normalizeEmail(fieldToHeader.get("email") ? r[fieldToHeader.get("email")!] : null);
      let state: "ok" | "invalid" | "dupe-file" | "dupe-db" = "ok";
      if (!company) {
        state = "invalid";
        invalid++;
      } else if ((domain && seenD.has(domain)) || (email && seenE.has(email))) {
        state = "dupe-file";
        inFileDupes++;
      } else if (dupes && ((domain && dupes.domains.has(domain)) || (email && dupes.emails.has(email)))) {
        state = "dupe-db";
        dbDupes++;
      }
      if (domain) seenD.add(domain);
      if (email) seenE.add(email);
      return { row: r, company, domain, email, state };
    });
    return { annotated, invalid, inFileDupes, dbDupes, willImport: rows.length - invalid - inFileDupes - dbDupes };
  }, [rows, fieldToHeader, dupes]);

  const goPreview = () => {
    startTransition(async () => {
      const domains = preview.annotated.map((a) => a.domain).filter((d): d is string => !!d);
      const emails = preview.annotated.map((a) => a.email).filter((e): e is string => !!e);
      const res = await checkDuplicatesAction({ domains, emails });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setDupes({ domains: new Set(res.data.domains), emails: new Set(res.data.emails) });
      setStep(3);
    });
  };

  const commit = () => {
    startTransition(async () => {
      const res = await importLeadsAction({
        fileName,
        sourceId: sourceId === NONE ? null : sourceId,
        tags: extraTags,
        mapping,
        rows,
        autoScore,
        verifyEmails,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setSummary(res.data);
      setStep(4);
      toast.success(`${res.data.imported} leads imported.`);
    });
  };

  const reset = () => {
    setStep(1);
    setFileName("");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setMapSources({});
    setDupes(null);
    setSummary(null);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <Steps step={step} />

        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>1. Upload a CSV</CardTitle>
              <CardDescription>The first row must contain column headers. Up to 20,000 rows per file.</CardDescription>
            </CardHeader>
            <CardContent>
              <label
                className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition-colors hover:border-primary/50 hover:bg-muted/40"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) onFile(f);
                }}
              >
                {parsing ? <Loader2 className="size-8 animate-spin text-muted-foreground" /> : <Upload className="size-8 text-muted-foreground" />}
                <div>
                  <p className="font-medium">Drop your CSV here or click to browse</p>
                  <p className="text-sm text-muted-foreground">Exports from Apollo, LinkedIn, Clutch, spreadsheets, etc.</p>
                </div>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onFile(f);
                    e.target.value = "";
                  }}
                />
              </label>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>2. Map columns</CardTitle>
              <CardDescription>
                <FileSpreadsheet className="mr-1 inline size-4" />
                {fileName} &middot; {rows.length.toLocaleString()} rows &middot; {headers.length} columns. Company name is required.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="inline-flex items-center gap-1 font-medium">
                    <Sparkles className="size-4 text-primary" />
                    {autoCount} {autoCount === 1 ? "column" : "columns"} auto-detected
                  </span>
                  <span className="text-muted-foreground">
                    {extraHeaders.length} kept as additional {extraHeaders.length === 1 ? "field" : "fields"}
                    {skippedCount > 0 && ` · ${skippedCount} skipped`}
                  </span>
                </p>
                <Button variant="ghost" size="sm" onClick={redetect}>
                  <Wand2 />
                  Re-detect
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {headers.map((h) => {
                  const target = mapping[h] ?? MAP_EXTRA;
                  const src = mapSources[h];
                  return (
                    <div
                      key={h}
                      className={cn(
                        "flex items-center gap-3 rounded-lg border p-2.5",
                        isLeadField(target) && "border-primary/30 bg-primary/[0.03]",
                        target === MAP_SKIP && "opacity-60",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                          <span className="truncate">{h}</span>
                          {isLeadField(target) && src === "header" && <SourceTag>auto</SourceTag>}
                          {isLeadField(target) && src === "values" && <SourceTag>from values</SourceTag>}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">e.g. {rows[0]?.[h] || "-"}</p>
                      </div>
                      <Select value={target === MAP_SKIP ? SKIP_UI : target} onValueChange={(v) => setTarget(h, v === SKIP_UI ? MAP_SKIP : (v as MappingTarget))}>
                        <SelectTrigger className="w-[200px]" size="sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LEAD_IMPORT_FIELDS.map((f) => (
                            <SelectItem key={f.key} value={f.key}>
                              {f.label}
                            </SelectItem>
                          ))}
                          <SelectSeparator />
                          <SelectItem value={MAP_EXTRA}>Keep as additional field</SelectItem>
                          <SelectItem value={SKIP_UI}>
                            <span className="text-muted-foreground">Skip column</span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>

              {extraHeaders.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Additional fields are saved with each lead exactly as they appear in the file and shown on the lead page:{" "}
                  {extraHeaders.map((h, i) => (
                    <span key={h}>
                      {i > 0 && ", "}
                      <span className="rounded bg-muted px-1 py-0.5 text-foreground">{h}</span>
                    </span>
                  ))}
                </p>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Lead source</Label>
                  <Select value={sourceId} onValueChange={setSourceId}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>No source</SelectItem>
                      {sources.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="extra-tags">Add tags to every lead</Label>
                  <Input id="extra-tags" value={extraTags} onChange={(e) => setExtraTags(e.target.value)} placeholder="e.g. q4-2026, webinar-list" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox className="mt-0.5" checked={verifyEmails} onCheckedChange={(v) => setVerifyEmails(v === true)} />
                  <span>
                    Check email addresses
                    <span className="block text-xs text-muted-foreground">
                      Flags invalid addresses, disposable providers (Mailinator, Guerrilla Mail, &hellip;) and domains with no mail server. Confirms the domain
                      accepts mail; it cannot prove a specific inbox exists.
                    </span>
                  </span>
                </label>
                {aiEnabled && (
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={autoScore} onCheckedChange={(v) => setAutoScore(v === true)} />
                    Queue imported leads with a website for AI pre-filtering
                  </label>
                )}
              </div>

              {!mappedCompany && (
                <Alert>
                  <AlertTriangle />
                  <AlertTitle>Map a column to Company name</AlertTitle>
                  <AlertDescription>Every lead needs a company name. Pick the column that holds it.</AlertDescription>
                </Alert>
              )}

              <div className="flex justify-between">
                <Button variant="outline" onClick={reset}>
                  Choose another file
                </Button>
                <Button onClick={goPreview} disabled={!mappedCompany || pending}>
                  {pending && <Loader2 className="animate-spin" />}
                  Preview &amp; check duplicates
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>3. Review</CardTitle>
              <CardDescription>
                Rows flagged as duplicates or invalid will be skipped.
                {extraHeaders.length > 0 && ` ${extraHeaders.length} extra ${extraHeaders.length === 1 ? "column" : "columns"} will be saved as additional fields.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Will import" value={preview.willImport} tone="good" />
                <Stat label="Already in archive" value={preview.dbDupes} tone={preview.dbDupes ? "warn" : "muted"} />
                <Stat label="Duplicates in file" value={preview.inFileDupes} tone={preview.inFileDupes ? "warn" : "muted"} />
                <Stat label="Missing company" value={preview.invalid} tone={preview.invalid ? "bad" : "muted"} />
              </div>

              <div className="max-h-[420px] overflow-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-28">Result</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Domain</TableHead>
                      <TableHead>Email</TableHead>
                      {fieldToHeader.has("industry") && <TableHead>Industry</TableHead>}
                      {fieldToHeader.has("country") && <TableHead>Country</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.annotated.slice(0, 200).map((a, i) => (
                      <TableRow key={i} className={a.state !== "ok" ? "opacity-60" : undefined}>
                        <TableCell>
                          {a.state === "ok" && <Badge className="bg-emerald-50 text-emerald-700" variant="outline">Import</Badge>}
                          {a.state === "dupe-db" && <Badge className="bg-amber-50 text-amber-700" variant="outline">In archive</Badge>}
                          {a.state === "dupe-file" && <Badge className="bg-amber-50 text-amber-700" variant="outline">Dup in file</Badge>}
                          {a.state === "invalid" && <Badge variant="destructive">No company</Badge>}
                        </TableCell>
                        <TableCell className="font-medium">{a.company || "-"}</TableCell>
                        <TableCell className="text-muted-foreground">{a.domain ?? "-"}</TableCell>
                        <TableCell className="text-muted-foreground">{a.email ?? "-"}</TableCell>
                        {fieldToHeader.has("industry") && <TableCell>{a.row[fieldToHeader.get("industry")!] ?? "-"}</TableCell>}
                        {fieldToHeader.has("country") && <TableCell>{a.row[fieldToHeader.get("country")!] ?? "-"}</TableCell>}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {preview.annotated.length > 200 && (
                  <p className="border-t p-2 text-center text-xs text-muted-foreground">Showing first 200 of {preview.annotated.length.toLocaleString()} rows</p>
                )}
              </div>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(2)} disabled={pending}>
                  Back to mapping
                </Button>
                <Button onClick={commit} disabled={pending || preview.willImport === 0}>
                  {pending && <Loader2 className="animate-spin" />}
                  Import {preview.willImport.toLocaleString()} leads
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 4 && summary && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-emerald-600" />
                Import complete
              </CardTitle>
              <CardDescription>{fileName}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Imported" value={summary.imported} tone="good" />
                <Stat label="Skipped duplicates" value={summary.skippedDuplicates} tone="muted" />
                <Stat label="Skipped invalid" value={summary.skippedInvalid} tone={summary.skippedInvalid ? "bad" : "muted"} />
                <Stat label="Queued for AI" value={summary.queuedForAi} tone="muted" />
                {summary.emailsChecked > 0 && (
                  <Stat label="Emails flagged" value={summary.emailsInvalid} tone={summary.emailsInvalid ? "warn" : "good"} />
                )}
              </div>
              {summary.queuedForAi > 0 && (
                <p className="text-sm text-muted-foreground">
                  AI scores will appear in the archive as the worker processes them. Make sure <code className="rounded bg-muted px-1">pnpm worker</code> is running.
                </p>
              )}
              <div className="flex gap-2">
                <Button asChild>
                  <Link href="/archive">Go to archive</Link>
                </Button>
                <Button variant="outline" onClick={reset}>
                  Import another file
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <aside className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent imports</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recent.length === 0 && <p className="text-sm text-muted-foreground">No imports yet.</p>}
            {recent.map((r) => (
              <div key={r.id} className="border-b pb-3 text-sm last:border-0 last:pb-0">
                <p className="truncate font-medium">{r.fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(r.createdAt), "d MMM yyyy, HH:mm")} &middot; {r.createdBy.name}
                  {r.source ? ` · ${r.source.name}` : ""}
                </p>
                <p className="mt-1 text-xs">
                  <span className="text-emerald-700">{r.importedCount} imported</span>
                  {r.skippedCount > 0 && <span className="text-muted-foreground"> &middot; {r.skippedCount} dupes</span>}
                  {r.errorCount > 0 && <span className="text-destructive"> &middot; {r.errorCount} invalid</span>}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tips</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Leads are deduplicated by website domain and by email. Existing leads are never overwritten.</p>
            <p>Columns are detected automatically from their header names and, when the header is unclear, from the values in them (emails, websites, phone numbers).</p>
            <p>&quot;First name&quot; and &quot;Last name&quot; columns are joined into one contact name.</p>
            <p>Columns that do not match a standard field are kept as additional fields on each lead, so nothing from your file is lost.</p>
            <p>Email checking catches fake and dead addresses: bad formatting, throwaway providers and domains that cannot receive mail.</p>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

function Steps({ step }: { step: number }) {
  const items = ["Upload", "Map columns", "Review", "Done"];
  return (
    <ol className="flex items-center gap-2 text-sm">
      {items.map((label, i) => {
        const n = i + 1;
        const active = n === step;
        const done = n < step;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={
                "flex size-6 items-center justify-center rounded-full text-xs font-semibold " +
                (active ? "bg-primary text-primary-foreground" : done ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground")
              }
            >
              {n}
            </span>
            <span className={active ? "font-medium" : "text-muted-foreground"}>{label}</span>
            {n < items.length && <span className="mx-1 h-px w-8 bg-border" />}
          </li>
        );
      })}
    </ol>
  );
}

function SourceTag({ children }: { children: React.ReactNode }) {
  return <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">{children}</span>;
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "good" | "warn" | "bad" | "muted" }) {
  const color =
    tone === "good" ? "text-emerald-700" : tone === "warn" ? "text-amber-700" : tone === "bad" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-semibold tabular-nums ${color}`}>{value.toLocaleString()}</p>
    </div>
  );
}
