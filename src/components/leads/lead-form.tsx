"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ActionResult } from "@/lib/action-result";

const NONE = "__none__";

export type LeadFormValues = {
  companyName?: string;
  website?: string | null;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  industry?: string | null;
  country?: string | null;
  city?: string | null;
  tags?: string[];
  notes?: string | null;
  sourceId?: string | null;
};

export function LeadForm({
  initial,
  sources,
  action,
  submitLabel = "Save lead",
  onSuccess,
  onCancel,
}: {
  initial?: LeadFormValues;
  sources: { id: string; name: string }[];
  action: (formData: FormData) => Promise<ActionResult<unknown>>;
  submitLabel?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [sourceId, setSourceId] = useState(initial?.sourceId ?? NONE);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("sourceId", sourceId === NONE ? "" : sourceId);
    startTransition(async () => {
      const res = await action(fd);
      if (res.ok) {
        toast.success(res.message ?? "Saved.");
        setFieldErrors({});
        onSuccess?.();
      } else {
        setFieldErrors(res.fieldErrors ?? {});
        toast.error(res.error);
      }
    });
  };

  const Field = ({
    name,
    label,
    placeholder,
    type = "text",
    required,
  }: {
    name: keyof LeadFormValues;
    label: string;
    placeholder?: string;
    type?: string;
    required?: boolean;
  }) => (
    <div className="space-y-1.5">
      <Label htmlFor={`lead-${name}`}>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      <Input
        id={`lead-${name}`}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        defaultValue={(name === "tags" ? initial?.tags?.join(", ") : (initial?.[name] as string | null | undefined)) ?? ""}
        aria-invalid={!!fieldErrors[name]}
      />
      {fieldErrors[name] && <p className="text-xs text-destructive">{fieldErrors[name][0]}</p>}
    </div>
  );

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field name="companyName" label="Company name" required placeholder="Acme Inc." />
        <Field name="website" label="Website" placeholder="acme.com" />
        <Field name="contactName" label="Contact name" placeholder="Jane Doe" />
        <Field name="email" label="Email" type="email" placeholder="jane@acme.com" />
        <Field name="phone" label="Phone" placeholder="+1 555 0100" />
        <Field name="industry" label="Industry" placeholder="SaaS" />
        <Field name="country" label="Country" placeholder="United States" />
        <Field name="city" label="City" placeholder="Austin" />
        <Field name="tags" label="Tags" placeholder="enterprise, q4" />
        <div className="space-y-1.5">
          <Label>Source</Label>
          <Select value={sourceId} onValueChange={setSourceId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="No source" />
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
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="lead-notes">Notes</Label>
        <Textarea id="lead-notes" name="notes" rows={3} defaultValue={initial?.notes ?? ""} placeholder="Anything useful for whoever works this lead" />
      </div>
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
