"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ButtonLink } from "@/components/button-link";
import { ShareDialog } from "@/components/share-dialog";
import { ChevronLeftIcon, FileTextIcon, SparklesIcon } from "lucide-react";

type Block = {
  id: string;
  type: string;
  position: number;
  data: Record<string, unknown>;
};

type Props = {
  initial: {
    id: string;
    documentId: string;
    title: string;
    summary: string | null;
    blocks: Block[];
  };
};

export function PageEditor({ initial }: Props) {
  const [title, setTitle] = useState(initial.title);
  const [blocks, setBlocks] = useState(initial.blocks);
  const [saving, setSaving] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveMeta = useCallback(async () => {
    setSaving(true);
    try {
      await fetch(`/api/v1/pages/${initial.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
    } finally {
      setSaving(false);
    }
  }, [initial.id, title]);

  useEffect(() => {
    const t = setTimeout(() => {
      void saveMeta();
    }, 800);
    return () => clearTimeout(t);
  }, [title, saveMeta]);

  async function addBlock(type: "TEXT" | "HEADING" | "DIVIDER" | "IMAGE" | "SCRIBE") {
    const data =
      type === "DIVIDER"
        ? {}
        : type === "IMAGE"
          ? { url: "", caption: "" }
          : type === "SCRIBE"
            ? { scribeId: "", title: "" }
            : type === "HEADING"
              ? { level: 2, text: "New heading" }
              : { text: "Type something…" };

    const res = await fetch(`/api/v1/pages/${initial.id}/blocks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "add",
        type,
        data,
      }),
    });
    const resData = await res.json();
    if (resData.id) {
      setBlocks((prev) => [
        ...prev,
        {
          id: resData.id,
          type,
          position: blocks.length,
          data,
        },
      ]);
    }
  }

  async function saveBlock(block: Block) {
    setSaving(true);
    try {
      await fetch(`/api/v1/pages/${initial.id}/blocks/${block.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: block.data }),
      });
    } finally {
      setSaving(false);
    }
  }

  async function removeBlock(blockId: string) {
    await fetch(`/api/v1/pages/${initial.id}/blocks/${blockId}`, { method: "DELETE" });
    setBlocks((prev) => prev.filter((b) => b.id !== blockId));
  }

  async function polish() {
    setPolishing(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/pages/${initial.id}/polish`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error?.message ?? `Polish failed (${res.status})`);
      }
      if (data.title) setTitle(data.title);
      if (Array.isArray(data.blocks)) {
        setBlocks(
          data.blocks.map((b: { id: string; type: string; data: Record<string, unknown> }, i: number) => ({
            id: b.id,
            type: b.type,
            position: i,
            data: b.data,
          })),
        );
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPolishing(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col bg-canvas">
      <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between border-b border-border/80 bg-surface/90 px-4 backdrop-blur md:px-6">
        <div className="flex items-center gap-3 min-w-0">
          <ButtonLink
            href="/dashboard"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronLeftIcon className="h-4 w-4" />
            <span>Dashboard</span>
          </ButtonLink>

          <div className="hidden sm:block h-4 w-px bg-border" />

          <div className="flex items-center gap-2 min-w-0">
            <FileTextIcon className="h-4 w-4 text-muted-foreground shrink-0 hidden sm:inline" />
            <span className="truncate text-xs font-semibold text-foreground max-w-[200px]">
              {title || "Untitled Page"}
            </span>
          </div>

          <div className="flex items-center gap-1.5 pl-1">
            {saving ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                <span className="hidden md:inline">Saving…</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span className="hidden md:inline">Saved</span>
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void polish()}
            disabled={polishing}
            className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <SparklesIcon className="h-3.5 w-3.5" />
            <span>{polishing ? "Polishing…" : "Polish with AI"}</span>
          </Button>
          <ShareDialog documentId={initial.documentId} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-8 sm:px-6">
        <input
          className="w-full border-0 bg-transparent font-heading text-2xl font-semibold tracking-tight outline-none"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Page title"
        />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => void addBlock("HEADING")}>
            Heading
          </Button>
          <Button size="sm" variant="outline" onClick={() => void addBlock("TEXT")}>
            Text
          </Button>
          <Button size="sm" variant="outline" onClick={() => void addBlock("IMAGE")}>
            Image
          </Button>
          <Button size="sm" variant="outline" onClick={() => void addBlock("SCRIBE")}>
            Embed scribe
          </Button>
          <Button size="sm" variant="outline" onClick={() => void addBlock("DIVIDER")}>
            Divider
          </Button>
        </div>

        <div className="space-y-4">
          {blocks.map((block) => (
            <div key={block.id} className="rounded-xl border border-border bg-card p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-caption uppercase">{block.type}</span>
                <Button size="xs" variant="ghost" onClick={() => void removeBlock(block.id)}>
                  Delete
                </Button>
              </div>
              {block.type === "HEADING" || block.type === "TEXT" ? (
                block.type === "HEADING" ? (
                  <Input
                    value={String(block.data.text ?? "")}
                    onChange={(e) => {
                      const text = e.target.value;
                      setBlocks((prev) =>
                        prev.map((b) =>
                          b.id === block.id ? { ...b, data: { ...b.data, text } } : b,
                        ),
                      );
                    }}
                    onBlur={() => {
                      const current = blocks.find((b) => b.id === block.id);
                      if (current) void saveBlock(current);
                    }}
                  />
                ) : (
                  <Textarea
                    className="min-h-24"
                    value={String(block.data.text ?? "")}
                    onChange={(e) => {
                      const text = e.target.value;
                      setBlocks((prev) =>
                        prev.map((b) =>
                          b.id === block.id ? { ...b, data: { ...b.data, text } } : b,
                        ),
                      );
                    }}
                    onBlur={() => {
                      const current = blocks.find((b) => b.id === block.id);
                      if (current) void saveBlock(current);
                    }}
                  />
                )
              ) : null}
              {block.type === "IMAGE" ? (
                <Input
                  placeholder="Image URL"
                  value={String(block.data.url ?? "")}
                  onChange={(e) => {
                    const url = e.target.value;
                    setBlocks((prev) =>
                      prev.map((b) =>
                        b.id === block.id ? { ...b, data: { ...b.data, url } } : b,
                      ),
                    );
                  }}
                  onBlur={() => {
                    const current = blocks.find((b) => b.id === block.id);
                    if (current) void saveBlock(current);
                  }}
                />
              ) : null}
              {block.type === "SCRIBE" ? (
                <div className="space-y-2">
                  <Input
                    placeholder="Scribe ID"
                    value={String(block.data.scribeId ?? "")}
                    onChange={(e) => {
                      const scribeId = e.target.value;
                      setBlocks((prev) =>
                        prev.map((b) =>
                          b.id === block.id ? { ...b, data: { ...b.data, scribeId } } : b,
                        ),
                      );
                    }}
                    onBlur={() => {
                      const current = blocks.find((b) => b.id === block.id);
                      if (current) void saveBlock(current);
                    }}
                  />
                  <Input
                    placeholder="Label (optional)"
                    value={String(block.data.title ?? "")}
                    onChange={(e) => {
                      const titleVal = e.target.value;
                      setBlocks((prev) =>
                        prev.map((b) =>
                          b.id === block.id
                            ? { ...b, data: { ...b.data, title: titleVal } }
                            : b,
                        ),
                      );
                    }}
                    onBlur={() => {
                      const current = blocks.find((b) => b.id === block.id);
                      if (current) void saveBlock(current);
                    }}
                  />
                </div>
              ) : null}
              {block.type === "DIVIDER" ? <hr className="border-border" /> : null}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
