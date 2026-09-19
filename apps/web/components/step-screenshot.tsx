"use client";

export type StepHighlight = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type StepAnnotationView = {
  kind?: string;
  highlight?: StepHighlight;
  resultText?: string;
  navigated?: boolean;
};

function parseAnnotations(annotations: unknown[]): StepAnnotationView | null {
  for (const raw of annotations ?? []) {
    if (!raw || typeof raw !== "object") continue;
    const a = raw as StepAnnotationView;
    if (a.highlight || a.resultText || a.navigated) return a;
  }
  return null;
}

type Props = {
  assetUrl: string | null | undefined;
  destinationAssetUrl?: string | null;
  annotations?: unknown[];
  alt?: string;
  className?: string;
  highlightColor?: string;
};

export function StepScreenshot({
  assetUrl,
  destinationAssetUrl,
  annotations = [],
  alt = "",
  className = "",
  highlightColor = "#f43f5e",
}: Props) {
  const meta = parseAnnotations(annotations);
  const highlight = meta?.highlight;

  return (
    <div className={`min-w-0 space-y-3 ${className}`}>
      {assetUrl ? (
        <div className="relative overflow-hidden rounded-xl border border-border bg-muted/20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={assetUrl} alt={alt} className="block w-full object-contain" />
          {highlight ? (
            <span
              aria-hidden
              className="pointer-events-none absolute rounded-full border-[3px] shadow-[0_0_0_4px_rgba(244,63,94,0.25)]"
              style={{
                borderColor: highlightColor,
                left: `${highlight.x * 100}%`,
                top: `${highlight.y * 100}%`,
                width: `${Math.max(highlight.w * 100, 2.5)}%`,
                height: `${Math.max(highlight.h * 100, 2.5)}%`,
                minWidth: 28,
                minHeight: 28,
              }}
            />
          ) : null}
        </div>
      ) : null}

      {meta?.navigated && destinationAssetUrl ? (
        <div className="space-y-2">
          <p className="text-caption font-medium uppercase tracking-wide text-muted-foreground">
            After page load
          </p>
          <div className="overflow-hidden rounded-xl border border-border bg-muted/20">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={destinationAssetUrl}
              alt=""
              className="block w-full object-contain"
            />
          </div>
        </div>
      ) : meta?.navigated && !destinationAssetUrl ? (
        <p className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          Loading…
        </p>
      ) : null}

      {meta?.resultText ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-sm leading-relaxed text-foreground">
          <span className="font-medium text-emerald-700 dark:text-emerald-400">Result: </span>
          {meta.resultText}
        </div>
      ) : null}
    </div>
  );
}
