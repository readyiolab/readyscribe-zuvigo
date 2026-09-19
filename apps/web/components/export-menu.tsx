"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  scribeId: string;
};

type Format = "markdown" | "html" | "pdf" | "confluence";

export function ExportMenu({ scribeId }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function download(format: Format, copyOnly = false) {
    setLoading(format);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch(`/api/v1/scribes/${scribeId}/export?format=${format}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.message ?? `Export failed (${res.status})`);
      }
      if (copyOnly || format === "confluence") {
        const text = await res.text();
        await navigator.clipboard.writeText(text);
        setCopied(true);
        if (!copyOnly) {
          // also offer download for confluence
          const blob = new Blob([text], { type: "text/html;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "guide-confluence.html";
          a.click();
          URL.revokeObjectURL(url);
        }
        setOpen(false);
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(cd);
      const filename =
        match?.[1] ??
        `guide.${format === "markdown" ? "md" : format === "pdf" ? "pdf" : "html"}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setOpen(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="relative">
      <Button variant="outline" size="default" onClick={() => setOpen((v) => !v)}>
        Export
      </Button>
      {open ? (
        <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-border bg-popover p-1 shadow-md">
          {(
            [
              ["markdown", "Markdown"],
              ["html", "HTML"],
              ["pdf", "PDF"],
              ["confluence", "Confluence (copy)"],
            ] as const
          ).map(([format, label]) => (
            <button
              key={format}
              type="button"
              disabled={Boolean(loading)}
              className="flex w-full items-center rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted disabled:opacity-50"
              onClick={() => void download(format)}
            >
              {loading === format ? "Working…" : label}
            </button>
          ))}
          {copied ? (
            <p className="px-2.5 py-1 text-[11px] text-muted-foreground">
              Copied — paste into Confluence as HTML / markup
            </p>
          ) : null}
          {error ? <p className="px-2.5 py-1 text-[11px] text-destructive">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
