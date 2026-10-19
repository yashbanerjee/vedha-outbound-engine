"use client";

import { useEffect, useRef, useState } from "react";
import { Bold, Code, Italic, Link2, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { isRichHtml } from "@/lib/mail/merge";

export function EmailEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"visual" | "html">(() => (isRichHtml(value) ? "html" : "visual"));

  useEffect(() => {
    if (mode !== "visual") return;
    const el = ref.current;
    if (el && el.innerHTML !== value) el.innerHTML = value || "";
  }, [value, mode]);

  const run = (command: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    if (ref.current) onChange(ref.current.innerHTML);
  };

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="border-b bg-black px-3 py-3">
        <img src="/vedha-logo.png" alt="Vedha" className="h-auto w-28" />
      </div>
      <div className="flex items-center gap-0.5 border-b bg-muted/40 p-1">
        {mode === "visual" && (
          <>
            <Button type="button" variant="ghost" size="icon" className="size-7" onMouseDown={(e) => e.preventDefault()} onClick={() => run("bold")} aria-label="Bold">
              <Bold />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="size-7" onMouseDown={(e) => e.preventDefault()} onClick={() => run("italic")} aria-label="Italic">
              <Italic />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="size-7" onMouseDown={(e) => e.preventDefault()} onClick={() => run("insertUnorderedList")} aria-label="List">
              <List />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const url = window.prompt("Link address");
                if (url) run("createLink", url);
              }}
              aria-label="Link"
            >
              <Link2 />
            </Button>
          </>
        )}
        <div className="ml-auto flex gap-0.5">
          <Button type="button" variant={mode === "visual" ? "secondary" : "ghost"} size="sm" className="h-7 px-2 text-xs" onClick={() => setMode("visual")}>
            Visual
          </Button>
          <Button type="button" variant={mode === "html" ? "secondary" : "ghost"} size="sm" className="h-7 px-2 text-xs" onClick={() => setMode("html")}>
            <Code />
            HTML
          </Button>
        </div>
      </div>
      {mode === "html" ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          aria-label="HTML source"
          placeholder="Paste an HTML email template. {{contactName}}, {{companyName}} and {{senderName}} still get filled in."
          className="field-sizing-fixed max-h-[28rem] min-h-72 resize-y rounded-none border-0 font-mono text-xs leading-relaxed shadow-none focus-visible:ring-0"
        />
      ) : (
        <div
          ref={ref}
          contentEditable
          role="textbox"
          aria-multiline="true"
          aria-label="Email body"
          className="min-h-40 px-3 py-2 text-sm focus:outline-none [&_a]:text-primary [&_a]:underline"
          onInput={(e) => onChange(e.currentTarget.innerHTML)}
        />
      )}
    </div>
  );
}
