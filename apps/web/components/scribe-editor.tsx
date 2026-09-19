"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/button-link";
import { Badge } from "@/components/ui/badge";
import { StepScreenshot } from "@/components/step-screenshot";
import { ShareDialog } from "@/components/share-dialog";
import { ExportMenu } from "@/components/export-menu";
import {
  ScreenshotEditor,
  type HighlightBox,
} from "@/components/screenshot-editor";
import { StepComments } from "@/components/step-comments";
import type { ScribeDto, ScribeStepDto } from "@zuvigo/types";
import {
  ChevronLeftIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  Trash2Icon,
  SparklesIcon,
  PencilIcon,
  PlusIcon,
  FileTextIcon,
  LayersIcon,
  ClockIcon,
  PanelRightIcon,
  CopyIcon,
  CheckIcon,
  RefreshCwIcon,
  XIcon,
  GripVerticalIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

function highlightFromAnnotations(annotations: unknown[]): HighlightBox | null {
  for (const raw of annotations ?? []) {
    if (!raw || typeof raw !== "object") continue;
    const h = (raw as { highlight?: HighlightBox }).highlight;
    if (h && typeof h.x === "number") return h;
  }
  return null;
}

type Props = {
  initial: Omit<ScribeDto, "steps"> & { steps: ScribeStepDto[] };
};

export function ScribeEditor({ initial }: Props) {
  const [title, setTitle] = useState(initial.title);
  const [summary, setSummary] = useState(initial.summary ?? "");
  const [steps, setSteps] = useState(initial.steps);
  const [selectedId, setSelectedId] = useState<string | null>(initial.steps[0]?.id ?? null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string>(initial.status);
  const [improvingId, setImprovingId] = useState<string | null>(null);
  const [improveError, setImproveError] = useState<string | null>(null);
  const [editingShotStepId, setEditingShotStepId] = useState<string | null>(null);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [showInspector, setShowInspector] = useState(true);
  const [copiedDocId, setCopiedDocId] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch(
        `/api/v1/documents/${initial.documentId}/comments?counts=1`,
        { credentials: "include" },
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.counts) setCommentCounts(data.counts);
    })();
  }, [initial.documentId, selectedId]);

  const selected = useMemo(
    () => steps.find((s) => s.id === selectedId) ?? null,
    [steps, selectedId],
  );

  const selectedIndex = useMemo(
    () => steps.findIndex((s) => s.id === selectedId),
    [steps, selectedId],
  );

  const saveMeta = useCallback(async () => {
    setSaving(true);
    try {
      await fetch(`/api/v1/scribes/${initial.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, summary }),
      });
    } finally {
      setSaving(false);
    }
  }, [initial.id, title, summary]);

  useEffect(() => {
    const t = setTimeout(() => {
      void saveMeta();
    }, 800);
    return () => clearTimeout(t);
  }, [title, summary, saveMeta]);

  async function saveStep(step: ScribeStepDto) {
    setSaving(true);
    try {
      await fetch(`/api/v1/scribes/${initial.id}/steps/${step.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: step.title,
          description: step.description,
          annotations: step.annotations,
        }),
      });
    } finally {
      setSaving(false);
    }
  }

  async function deleteStep(stepId: string) {
    await fetch(`/api/v1/scribes/${initial.id}/steps/${stepId}`, { method: "DELETE" });
    setSteps((prev) => prev.filter((s) => s.id !== stepId).map((s, i) => ({ ...s, position: i })));
    setSelectedId((id) => (id === stepId ? null : id));
  }

  async function addStep() {
    const res = await fetch(`/api/v1/scribes/${initial.id}/steps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add", title: "New step", description: "" }),
    });
    const data = await res.json();
    if (data.id) {
      const step: ScribeStepDto = {
        id: data.id,
        position: steps.length,
        title: "New step",
        description: "",
        callouts: [],
        annotations: [],
        assetId: null,
        assetUrl: null,
        destinationAssetUrl: null,
      };
      setSteps((prev) => [...prev, step]);
      setSelectedId(step.id);
      setTimeout(() => {
        document.getElementById(`guide-step-${step.id}`)?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 50);
    }
  }

  async function handleReorder(fromIndex: number, toIndex: number) {
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= steps.length ||
      toIndex >= steps.length
    ) {
      return;
    }
    const copy = [...steps];
    const [item] = copy.splice(fromIndex, 1);
    if (!item) return;
    copy.splice(toIndex, 0, item);
    const reordered = copy.map((s, i) => ({ ...s, position: i }));
    setSteps(reordered);
    setSelectedId(item.id);
    await fetch(`/api/v1/scribes/${initial.id}/steps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reorder", stepIds: reordered.map((s) => s.id) }),
    });
  }

  async function improveStep(stepId: string, preset: "clearer" | "shorter" | "formal") {
    setImprovingId(stepId);
    setImproveError(null);
    try {
      const res = await fetch(`/api/v1/scribes/${initial.id}/steps/${stepId}/ai-rewrite`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preset }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error?.message ?? `Improve failed (${res.status})`);
      }
      setSteps((prev) =>
        prev.map((s) =>
          s.id === stepId
            ? {
                ...s,
                title: data.title ?? s.title,
                description: data.description ?? s.description,
              }
            : s,
        ),
      );
    } catch (err) {
      setImproveError((err as Error).message);
    } finally {
      setImprovingId(null);
    }
  }

  async function retryProcessing() {
    setStatus("PROCESSING");
    await fetch(`/api/v1/scribes/${initial.id}/retry-ai`, { method: "POST" });
  }

  async function copyDocumentId() {
    await navigator.clipboard.writeText(initial.documentId);
    setCopiedDocId(true);
    setTimeout(() => setCopiedDocId(false), 2000);
  }

  if (status === "PROCESSING") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-canvas px-6 py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm">
          <SparklesIcon className="h-7 w-7 animate-pulse" />
        </div>
        <div className="space-y-2">
          <h1 className="font-heading text-2xl font-bold tracking-tight">Creating your guide…</h1>
          <p className="text-sm text-muted-foreground max-w-sm">
            ReadyScribe AI is analyzing workflow actions, cropping click targets, and structuring step descriptions.
          </p>
        </div>
        <div className="rounded-xl border border-border/80 bg-card p-4 text-xs text-muted-foreground shadow-xs w-full max-w-xs space-y-2 text-left">
          <div className="flex items-center gap-2 text-foreground font-medium">
            <span className="flex h-2 w-2 rounded-full bg-primary animate-ping" />
            <span>Processing workflow steps</span>
          </div>
          <p className="text-[11px] text-muted-foreground">This usually takes 10 to 30 seconds.</p>
        </div>
        <ButtonLink href="/dashboard" variant="outline" size="sm">
          Back to dashboard
        </ButtonLink>
      </div>
    );
  }

  if (status === "FAILED") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-canvas px-6 py-20 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive shadow-sm">
          <RefreshCwIcon className="h-6 w-6" />
        </div>
        <h1 className="font-heading text-xl font-bold tracking-tight">Processing failed</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Something went wrong while building this guide. You can retry AI processing.
        </p>
        <div className="flex gap-2 pt-2">
          <Button onClick={retryProcessing} className="gap-1.5">
            <RefreshCwIcon className="h-4 w-4" />
            Retry AI
          </Button>
          <ButtonLink href="/dashboard" variant="outline">
            Dashboard
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen h-[100dvh] flex-col overflow-hidden bg-canvas">
      {editingShotStepId ? (() => {
        const shotStep = steps.find((s) => s.id === editingShotStepId);
        if (!shotStep?.assetUrl) return null;
        return (
          <ScreenshotEditor
            scribeId={initial.id}
            stepId={shotStep.id}
            imageUrl={shotStep.assetUrl}
            initialHighlight={highlightFromAnnotations(shotStep.annotations)}
            onCancel={() => setEditingShotStepId(null)}
            onSaved={({ assetUrl, annotations }) => {
              setSteps((prev) =>
                prev.map((s) =>
                  s.id === shotStep.id
                    ? { ...s, assetUrl, annotations: annotations as ScribeStepDto["annotations"] }
                    : s,
                ),
              );
              setEditingShotStepId(null);
            }}
          />
        );
      })() : null}

      {/* Top Header Bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border/80 bg-surface/90 px-4 backdrop-blur md:px-6 z-20">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <ButtonLink
            href="/dashboard"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronLeftIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </ButtonLink>

          <div className="hidden sm:block h-4 w-px bg-border" />

          <div className="flex items-center gap-2 min-w-0">
            <FileTextIcon className="h-4 w-4 text-muted-foreground shrink-0 hidden sm:inline" />
            <span className="truncate text-xs font-semibold text-foreground max-w-[140px] sm:max-w-[260px]">
              {title || "Untitled Guide"}
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

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            onClick={retryProcessing}
            className="h-8 gap-1 px-2.5 text-xs text-muted-foreground hover:text-foreground hidden sm:inline-flex"
          >
            <RefreshCwIcon className="h-3.5 w-3.5" />
            <span>Retry AI</span>
          </Button>

          <ExportMenu scribeId={initial.id} />
          <ShareDialog documentId={initial.documentId} />

          <Button
            size="sm"
            variant={showInspector ? "secondary" : "ghost"}
            onClick={() => setShowInspector(!showInspector)}
            className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
            title="Toggle Inspector"
          >
            <PanelRightIcon className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Editor Main Grid (Fixed Viewport: Left and Right sticky, only Center scrolls) */}
      <div className="flex flex-1 min-h-0 w-full overflow-hidden">
        {/* Left Sidebar: Steps Outline (Sticky/Fixed) */}
        <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-border/80 bg-sidebar/30 backdrop-blur h-full overflow-hidden">
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-border/60 px-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Steps
              </span>
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-bold">
                {steps.length}
              </Badge>
            </div>
            <Button
              size="xs"
              variant="outline"
              onClick={addStep}
              className="h-6 gap-1 px-2 text-[11px] shadow-2xs"
            >
              <PlusIcon className="h-3 w-3" />
              <span>Add</span>
            </Button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
            {steps.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">
                No steps yet. Click Add to create one.
              </div>
            ) : (
              steps.map((step, i) => {
                const isSelected = selectedId === step.id;
                const isDragging = draggedIndex === i;
                const isDragOver = dragOverIndex === i;
                return (
                  <div
                    key={step.id}
                    draggable={true}
                    onDragStart={(e) => {
                      setDraggedIndex(i);
                      e.dataTransfer.setData("text/plain", String(i));
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (dragOverIndex !== i) setDragOverIndex(i);
                    }}
                    onDragLeave={() => {
                      if (dragOverIndex === i) setDragOverIndex(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggedIndex !== null && draggedIndex !== i) {
                        void handleReorder(draggedIndex, i);
                      }
                      setDraggedIndex(null);
                      setDragOverIndex(null);
                    }}
                    onDragEnd={() => {
                      setDraggedIndex(null);
                      setDragOverIndex(null);
                    }}
                    className={cn(
                      "relative transition-all rounded-lg",
                      isDragging && "opacity-40 scale-[0.98]",
                      isDragOver && "ring-2 ring-primary border-primary",
                    )}
                  >
                    {isDragOver && (
                      <div className="absolute -top-1 left-0 right-0 h-0.5 bg-primary rounded-full z-10 animate-pulse" />
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(step.id);
                        document.getElementById(`guide-step-${step.id}`)?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        });
                      }}
                      className={cn(
                        "group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-all cursor-pointer",
                        isSelected
                          ? "bg-primary/10 font-semibold text-foreground shadow-2xs border-l-2 border-primary"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                      )}
                    >
                      <div
                        className="cursor-grab active:cursor-grabbing text-muted-foreground/40 group-hover:text-muted-foreground hover:text-foreground shrink-0 transition-colors"
                        title="Drag to reorder"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <GripVerticalIcon className="h-3.5 w-3.5" />
                      </div>
                      <span
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                          isSelected
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground group-hover:bg-muted-foreground/20",
                        )}
                      >
                        {i + 1}
                      </span>
                      <span className="truncate flex-1">{step.title || `Step ${i + 1}`}</span>
                      {commentCounts[step.id] ? (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                          {commentCounts[step.id]}
                        </span>
                      ) : null}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* Center Canvas (The only container that scrolls!) */}
        <main className="flex-1 min-w-0 h-full overflow-y-auto p-4 sm:p-8 lg:p-10">
          <div className="mx-auto max-w-3xl space-y-8">
            {/* Guide Header Banner */}
            <div className="rounded-2xl border border-border/80 bg-card p-6 sm:p-7 shadow-xs space-y-4">
              <div className="flex items-start gap-3.5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-2xs">
                  <FileTextIcon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <Badge variant="secondary" className="text-[10px] font-semibold tracking-wider uppercase mb-1.5">
                    Scribe Guide
                  </Badge>
                  <input
                    className="w-full border-0 bg-transparent font-heading text-2xl font-bold tracking-tight text-foreground outline-none placeholder:text-muted-foreground/50 sm:text-3xl focus:ring-1 focus:ring-ring rounded-md px-1 py-0.5 -ml-1 transition-all"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Enter guide title…"
                  />
                </div>
              </div>

              <textarea
                className="w-full resize-none border-0 bg-transparent text-sm leading-relaxed text-muted-foreground outline-none placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-ring focus:text-foreground rounded-md px-1 py-1 -ml-1 transition-all"
                rows={2}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="Add a brief summary or introduction for this guide…"
              />

              <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border/50 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <LayersIcon className="h-3.5 w-3.5" />
                  {steps.length} {steps.length === 1 ? "step" : "steps"}
                </span>
                <span>·</span>
                <span className="inline-flex items-center gap-1.5">
                  <ClockIcon className="h-3.5 w-3.5" />
                  ~{Math.max(1, Math.ceil(steps.length * 0.5))} min read
                </span>
                <span>·</span>
                <Badge variant="outline" className="text-[10px] uppercase font-semibold">
                  {status}
                </Badge>
              </div>
            </div>

            {/* Steps List */}
            {steps.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/80 bg-muted/20 p-12 text-center space-y-3">
                <p className="text-sm text-muted-foreground">No steps in this guide yet.</p>
                <Button onClick={addStep} size="sm" className="gap-1.5">
                  <PlusIcon className="h-4 w-4" />
                  <span>Add First Step</span>
                </Button>
              </div>
            ) : (
              <div className="space-y-6 pb-16">
                {steps.map((step, i) => {
                  const isSelected = step.id === selectedId;
                  return (
                    <div
                      key={step.id}
                      id={`guide-step-${step.id}`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        if (dragOverIndex !== i) setDragOverIndex(i);
                      }}
                      onDragLeave={() => {
                        if (dragOverIndex === i) setDragOverIndex(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (draggedIndex !== null && draggedIndex !== i) {
                          void handleReorder(draggedIndex, i);
                        }
                        setDraggedIndex(null);
                        setDragOverIndex(null);
                      }}
                      className={cn(
                        "scroll-mt-20 rounded-2xl border bg-card p-5 sm:p-6 shadow-xs transition-all space-y-4 relative",
                        isSelected
                          ? "ring-2 ring-primary/25 border-primary/50 shadow-sm"
                          : "border-border/80 hover:border-border",
                        draggedIndex === i && "opacity-40 scale-[0.99]",
                        dragOverIndex === i && "ring-2 ring-primary border-primary",
                      )}
                      onClick={() => setSelectedId(step.id)}
                    >
                      {dragOverIndex === i && (
                        <div className="absolute -top-3 left-4 right-4 h-1 bg-primary rounded-full z-20 animate-pulse" />
                      )}

                      {/* Step Header Row */}
                      <div className="flex items-center justify-between gap-3 border-b border-border/40 pb-3">
                        <div className="flex items-center gap-2">
                          <div
                            draggable={true}
                            onDragStart={(e) => {
                              setDraggedIndex(i);
                              e.dataTransfer.setData("text/plain", String(i));
                              e.dataTransfer.effectAllowed = "move";
                            }}
                            onDragEnd={() => {
                              setDraggedIndex(null);
                              setDragOverIndex(null);
                            }}
                            className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground cursor-grab active:cursor-grabbing transition-colors"
                            title="Drag to reorder step"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <GripVerticalIcon className="h-4 w-4" />
                          </div>

                          <span
                            className={cn(
                              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all shadow-2xs",
                              isSelected
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            {i + 1}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              void deleteStep(step.id);
                            }}
                            title="Delete step"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2Icon className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Step Title Input */}
                      <div>
                        <input
                          className="w-full bg-transparent font-heading text-lg font-semibold tracking-tight text-foreground outline-none transition-all placeholder:text-muted-foreground/60 focus:ring-1 focus:ring-ring rounded-md px-1.5 py-0.5 -ml-1.5 hover:bg-muted/40 sm:text-xl"
                          value={step.title}
                          placeholder={`Step ${i + 1} title`}
                          onChange={(e) => {
                            const nextTitle = e.target.value;
                            setSteps((prev) =>
                              prev.map((s) => (s.id === step.id ? { ...s, title: nextTitle } : s)),
                            );
                          }}
                          onBlur={() => {
                            const current = steps.find((s) => s.id === step.id);
                            if (current) void saveStep(current);
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>

                      {/* Step Description Textarea */}
                      <div>
                        <textarea
                          className="w-full resize-y bg-transparent text-sm leading-relaxed text-muted-foreground outline-none transition-all placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-ring focus:text-foreground rounded-md px-1.5 py-1 -ml-1.5 hover:bg-muted/40 min-h-[48px]"
                          value={step.description}
                          placeholder="Add instructions or details for this step…"
                          rows={Math.max(2, (step.description.match(/\n/g) || []).length + 1)}
                          onChange={(e) => {
                            const description = e.target.value;
                            setSteps((prev) =>
                              prev.map((s) => (s.id === step.id ? { ...s, description } : s)),
                            );
                          }}
                          onBlur={() => {
                            const current = steps.find((s) => s.id === step.id);
                            if (current) void saveStep(current);
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>

                      {/* Screenshot Container */}
                      <div className="rounded-xl overflow-hidden border border-border/70 bg-muted/10 shadow-2xs">
                        <StepScreenshot
                          assetUrl={step.assetUrl}
                          destinationAssetUrl={step.destinationAssetUrl}
                          annotations={step.annotations}
                        />

                        {step.assetUrl ? (
                          <div className="flex items-center justify-between gap-2 p-2 bg-surface/80 border-t border-border/50 backdrop-blur-xs">
                            <span className="text-[11px] text-muted-foreground px-1">
                              Screenshot & click target
                            </span>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2.5 text-xs gap-1.5 bg-background shadow-2xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingShotStepId(step.id);
                              }}
                            >
                              <PencilIcon className="h-3 w-3 text-primary" />
                              <span>Edit screenshot</span>
                            </Button>
                          </div>
                        ) : null}
                      </div>

                      {/* AI Polish Toolbar */}
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/15 bg-primary/5 px-3 py-2">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
                          <SparklesIcon className="h-3.5 w-3.5 shrink-0" />
                          <span>AI Polish</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="xs"
                            variant="secondary"
                            disabled={improvingId === step.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              void improveStep(step.id, "clearer");
                            }}
                            className="h-6 px-2 text-[11px] bg-background shadow-2xs"
                          >
                            {improvingId === step.id ? "Polishing…" : "Clearer"}
                          </Button>
                          <Button
                            size="xs"
                            variant="secondary"
                            disabled={improvingId === step.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              void improveStep(step.id, "shorter");
                            }}
                            className="h-6 px-2 text-[11px] bg-background shadow-2xs"
                          >
                            Concise
                          </Button>
                          <Button
                            size="xs"
                            variant="secondary"
                            disabled={improvingId === step.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              void improveStep(step.id, "formal");
                            }}
                            className="h-6 px-2 text-[11px] bg-background shadow-2xs"
                          >
                            Formal
                          </Button>
                        </div>
                      </div>

                      {improveError && selectedId === step.id ? (
                        <p className="text-xs text-destructive">{improveError}</p>
                      ) : null}

                      {/* Step Comments */}
                      <div onClick={(e) => e.stopPropagation()} className="pt-2 border-t border-border/40">
                        <StepComments
                          documentId={initial.documentId}
                          stepId={step.id}
                        />
                      </div>
                    </div>
                  );
                })}

                {/* Bottom Add Step Button */}
                <div className="flex justify-center pt-2">
                  <Button onClick={addStep} variant="outline" className="gap-2 shadow-xs">
                    <PlusIcon className="h-4 w-4" />
                    <span>Add Step {steps.length + 1}</span>
                  </Button>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* Right Sidebar: Inspector Panel (Sticky/Fixed) */}
        {showInspector ? (
          <aside className="hidden xl:flex w-72 shrink-0 flex-col border-l border-border/80 bg-sidebar/30 backdrop-blur h-full overflow-hidden">
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-border/60 px-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Inspector
              </span>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => setShowInspector(false)}
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
              >
                <XIcon className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-6 text-xs">
              {/* Active Step Details */}
              {selected ? (
                <div className="space-y-3 rounded-xl border border-border/80 bg-card p-3.5 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">
                      Step {selectedIndex + 1}
                    </span>
                    <Badge variant="secondary" className="text-[10px]">
                      {selected.assetUrl ? "Has screenshot" : "No media"}
                    </Badge>
                  </div>
                  <p className="truncate text-muted-foreground font-medium">
                    {selected.title || "Untitled step"}
                  </p>

                  <div className="flex items-center justify-between rounded-lg bg-muted/40 border border-border/50 px-2.5 py-1.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5 font-medium">
                      <GripVerticalIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>Drag to reorder</span>
                    </span>
                    <span className="font-semibold text-foreground">Step {selectedIndex + 1}</span>
                  </div>

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void deleteStep(selected.id)}
                    className="w-full h-7 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive gap-1"
                  >
                    <Trash2Icon className="h-3 w-3" />
                    Delete step
                  </Button>
                </div>
              ) : (
                <p className="text-muted-foreground">Select a step to inspect properties.</p>
              )}

              {/* Guide Overview */}
              <div className="space-y-3">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Guide Overview
                </span>
                <dl className="space-y-2.5 rounded-xl border border-border/80 bg-card p-3.5 shadow-xs">
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Status</dt>
                    <dd className="font-semibold text-foreground">
                      <Badge variant="outline" className="text-[10px]">
                        {status}
                      </Badge>
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Total Steps</dt>
                    <dd className="font-semibold text-foreground">{steps.length}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Estimated Read</dt>
                    <dd className="font-medium text-foreground">
                      ~{Math.max(1, Math.ceil(steps.length * 0.5))} min
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Document ID with Quick Copy */}
              <div className="space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Document ID
                </span>
                <div className="flex items-center gap-1.5 rounded-lg border border-input bg-muted/30 p-1.5 pl-2.5">
                  <span className="truncate font-mono text-[11px] text-muted-foreground flex-1">
                    {initial.documentId}
                  </span>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={copyDocumentId}
                    className="h-6 w-6 text-muted-foreground hover:text-foreground shrink-0"
                    title="Copy Document ID"
                  >
                    {copiedDocId ? <CheckIcon className="h-3 w-3 text-emerald-500" /> : <CopyIcon className="h-3 w-3" />}
                  </Button>
                </div>
              </div>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
