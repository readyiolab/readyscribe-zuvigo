"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export type HighlightBox = { x: number; y: number; w: number; h: number };

type Props = {
  imageUrl: string;
  initialHighlight?: HighlightBox | null;
  onCancel: () => void;
  onSaved: (result: {
    assetUrl: string;
    annotations: unknown[];
  }) => void;
  scribeId: string;
  stepId: string;
};

type Mode = "move" | "crop" | "redact";

type Rect = { x: number; y: number; w: number; h: number };

export function ScreenshotEditor({
  imageUrl,
  initialHighlight,
  onCancel,
  onSaved,
  scribeId,
  stepId,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [mode, setMode] = useState<Mode>("move");
  const [highlight, setHighlight] = useState<HighlightBox | null>(
    initialHighlight ?? null,
  );
  const [crop, setCrop] = useState<Rect | null>(null);
  const [redacts, setRedacts] = useState<Rect[]>([]);
  const [draft, setDraft] = useState<Rect | null>(null);
  const [drag, setDrag] = useState<{
    kind: "highlight" | "draw";
    startX: number;
    startY: number;
    orig?: HighlightBox;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [natural, setNatural] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      setNatural({ w: img.naturalWidth, h: img.naturalHeight });
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      redraw(img, highlight, crop, redacts, draft);
    };
    img.onerror = () => setError("Failed to load screenshot");
    img.src = imageUrl;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl]);

  useEffect(() => {
    if (imgRef.current) redraw(imgRef.current, highlight, crop, redacts, draft);
  }, [highlight, crop, redacts, draft]);

  function redraw(
    img: HTMLImageElement,
    hl: HighlightBox | null,
    c: Rect | null,
    rs: Rect[],
    d: Rect | null,
  ) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);

    for (const r of rs) {
      ctx.fillStyle = "#000";
      ctx.fillRect(r.x * canvas.width, r.y * canvas.height, r.w * canvas.width, r.h * canvas.height);
    }
    if (d && mode === "redact") {
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillRect(d.x * canvas.width, d.y * canvas.height, d.w * canvas.width, d.h * canvas.height);
    }
    if (c) {
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const cx = c.x * canvas.width;
      const cy = c.y * canvas.height;
      const cw = c.w * canvas.width;
      const ch = c.h * canvas.height;
      ctx.clearRect(cx, cy, cw, ch);
      ctx.drawImage(img, cx, cy, cw, ch, cx, cy, cw, ch);
      for (const r of rs) {
        ctx.fillStyle = "#000";
        ctx.fillRect(r.x * canvas.width, r.y * canvas.height, r.w * canvas.width, r.h * canvas.height);
      }
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.strokeRect(cx, cy, cw, ch);
    }
    if (d && mode === "crop") {
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 2;
      ctx.strokeRect(d.x * canvas.width, d.y * canvas.height, d.w * canvas.width, d.h * canvas.height);
    }
    if (hl) {
      const hx = hl.x * canvas.width;
      const hy = hl.y * canvas.height;
      const hw = Math.max(hl.w * canvas.width, 28);
      const hh = Math.max(hl.h * canvas.height, 28);
      ctx.strokeStyle = "#f43f5e";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(hx + hw / 2, hy + hh / 2, hw / 2, hh / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(244,63,94,0.15)";
      ctx.fill();
    }
  }

  function toNorm(e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  }

  function onPointerDown(e: React.MouseEvent<HTMLCanvasElement>) {
    const p = toNorm(e);
    if (mode === "move" && highlight) {
      setDrag({ kind: "highlight", startX: p.x, startY: p.y, orig: highlight });
      return;
    }
    if (mode === "crop" || mode === "redact") {
      setDrag({ kind: "draw", startX: p.x, startY: p.y });
      setDraft({ x: p.x, y: p.y, w: 0, h: 0 });
    }
  }

  function onPointerMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!drag) return;
    const p = toNorm(e);
    if (drag.kind === "highlight" && drag.orig) {
      const dx = p.x - drag.startX;
      const dy = p.y - drag.startY;
      setHighlight({
        ...drag.orig,
        x: Math.min(1 - drag.orig.w, Math.max(0, drag.orig.x + dx)),
        y: Math.min(1 - drag.orig.h, Math.max(0, drag.orig.y + dy)),
      });
      return;
    }
    if (drag.kind === "draw") {
      const x = Math.min(drag.startX, p.x);
      const y = Math.min(drag.startY, p.y);
      const w = Math.abs(p.x - drag.startX);
      const h = Math.abs(p.y - drag.startY);
      setDraft({ x, y, w, h });
    }
  }

  function onPointerUp() {
    if (!drag) return;
    if (drag.kind === "draw" && draft && draft.w > 0.01 && draft.h > 0.01) {
      if (mode === "crop") setCrop(draft);
      if (mode === "redact") setRedacts((prev) => [...prev, draft]);
    }
    setDraft(null);
    setDrag(null);
  }

  async function save() {
    const img = imgRef.current;
    if (!img) return;
    setSaving(true);
    setError(null);
    try {
      const out = document.createElement("canvas");
      const sx = crop ? crop.x * natural.w : 0;
      const sy = crop ? crop.y * natural.h : 0;
      const sw = crop ? crop.w * natural.w : natural.w;
      const sh = crop ? crop.h * natural.h : natural.h;
      out.width = Math.max(1, Math.round(sw));
      out.height = Math.max(1, Math.round(sh));
      const ctx = out.getContext("2d")!;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, out.width, out.height);
      for (const r of redacts) {
        const rx = (r.x * natural.w - sx) * (out.width / sw);
        const ry = (r.y * natural.h - sy) * (out.height / sh);
        const rw = r.w * natural.w * (out.width / sw);
        const rh = r.h * natural.h * (out.height / sh);
        ctx.fillStyle = "#000";
        ctx.fillRect(rx, ry, rw, rh);
      }

      let nextHighlight: HighlightBox | null = highlight;
      if (highlight && crop) {
        nextHighlight = {
          x: (highlight.x - crop.x) / crop.w,
          y: (highlight.y - crop.y) / crop.h,
          w: highlight.w / crop.w,
          h: highlight.h / crop.h,
        };
        nextHighlight = {
          x: Math.min(1, Math.max(0, nextHighlight.x)),
          y: Math.min(1, Math.max(0, nextHighlight.y)),
          w: Math.min(1 - nextHighlight.x, Math.max(0.02, nextHighlight.w)),
          h: Math.min(1 - nextHighlight.y, Math.max(0.02, nextHighlight.h)),
        };
      }

      const dataUrl = out.toDataURL("image/png");
      const res = await fetch(
        `/api/v1/scribes/${scribeId}/steps/${stepId}/screenshot`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageBase64: dataUrl,
            mimeType: "image/png",
            width: out.width,
            height: out.height,
            highlight: nextHighlight,
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message ?? `Save failed (${res.status})`);
      onSaved({ assetUrl: data.assetUrl, annotations: data.annotations ?? [] });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/60 p-4 backdrop-blur-sm">
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["move", "Move click"],
                ["crop", "Crop"],
                ["redact", "Redact"],
              ] as const
            ).map(([m, label]) => (
              <Button
                key={m}
                size="sm"
                variant={mode === m ? "default" : "outline"}
                onClick={() => setMode(m)}
              >
                {label}
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => setRedacts([])}>
              Clear redacts
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCrop(null)}>
              Clear crop
            </Button>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-muted/40 p-4">
          <canvas
            ref={canvasRef}
            className="mx-auto max-h-full max-w-full cursor-crosshair touch-none bg-black"
            onMouseDown={onPointerDown}
            onMouseMove={onPointerMove}
            onMouseUp={onPointerUp}
            onMouseLeave={onPointerUp}
          />
        </div>
        {error ? (
          <p className="border-t border-border px-4 py-2 text-sm text-destructive">{error}</p>
        ) : (
          <p className="border-t border-border px-4 py-2 text-[12px] text-muted-foreground">
            {mode === "move"
              ? "Drag the pink click ring to reposition it."
              : mode === "crop"
                ? "Drag a rectangle to crop. Save bakes the crop into the image."
                : "Drag rectangles to black out sensitive areas."}
          </p>
        )}
      </div>
    </div>
  );
}
