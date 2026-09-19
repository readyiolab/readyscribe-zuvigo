"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type Props = {
  workspaceId: string;
};

export function ImportDocumentButton({ workspaceId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [polish, setPolish] = useState(true);

  async function onFile(file: File | null) {
    if (!file) return;
    if (file.size > 200_000) {
      setError("File too large (max 200KB)");
      return;
    }
    const text = await file.text();
    setContent(text);
  }

  async function importDoc() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/scribes/import", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          content,
          polishWithAi: polish,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message ?? `Failed (${res.status})`);
      setOpen(false);
      router.push(`/editor/${data.scribeId}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="outline" size="sm">
            Import .md
          </Button>
        }
      />
      <SheetContent side="right" className="flex h-full w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="shrink-0 border-b border-border/80 px-6 py-5">
          <SheetTitle className="text-base font-semibold text-foreground">Import document</SheetTitle>
          <SheetDescription className="mt-0.5 text-xs text-muted-foreground">
            Paste Markdown or plain text (## headings or 1. numbered steps). Turns it into an
            editable guide.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
          <div className="space-y-1.5">
            <Label htmlFor="import-file" className="text-xs font-medium">Upload .md / .txt</Label>
            <input
              id="import-file"
              type="file"
              accept=".md,.txt,text/plain,text/markdown"
              className="block w-full text-xs text-muted-foreground file:mr-2.5 file:rounded-md file:border-0 file:bg-muted file:px-2.5 file:py-1 file:text-xs file:font-medium hover:file:bg-muted/80"
              onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="import-content" className="text-xs font-medium">Or paste content</Label>
            <Textarea
              id="import-content"
              className="min-h-48 font-mono text-xs"
              placeholder={"# My process\n\n## Step one\nDo this…\n\n## Step two\nThen that…"}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              className="rounded border-input text-primary focus:ring-ring"
              checked={polish}
              onChange={(e) => setPolish(e.target.checked)}
            />
            Polish with AI when available
          </label>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>
        <SheetFooter className="mt-auto shrink-0 border-t border-border/80 bg-muted/10 px-6 py-4">
          <Button
            className="w-full h-9 text-sm font-medium"
            disabled={loading || !content.trim()}
            onClick={() => void importDoc()}
          >
            {loading ? "Importing…" : "Create guide"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
