import { CaptureEventType } from "@zuvigo/types";
import { sanitizeElementForStorage } from "@zuvigo/security";

export interface RawCaptureEvent {
  clientEventId: string;
  sequence: number;
  type: CaptureEventType | string;
  timestamp: number;
  url?: string;
  element?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  assetClientId?: string;
}

export interface NormalizedEvent {
  clientEventId: string;
  sequence: number;
  type: CaptureEventType;
  timestamp: number;
  url?: string;
  element?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  assetClientId?: string;
}

export interface StepHighlight {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface StepAnnotation {
  kind: "click";
  highlight?: StepHighlight;
  resultText?: string;
  navigated?: boolean;
  destinationAssetClientId?: string;
}

export interface HeuristicStep {
  title: string;
  description: string;
  assetClientId?: string;
  destinationAssetClientId?: string;
  annotations: StepAnnotation[];
  sourceEventIds: string[];
}

const NOISE_TYPES = new Set([CaptureEventType.SCROLL, CaptureEventType.HOVER]);

export function normalizeEvent(raw: RawCaptureEvent): NormalizedEvent | null {
  const type = String(raw.type).toUpperCase() as CaptureEventType;
  if (!Object.values(CaptureEventType).includes(type)) {
    return null;
  }

  if (NOISE_TYPES.has(type) && !raw.metadata?.meaningful) {
    return null;
  }

  const element = raw.element ? sanitizeElementForStorage(raw.element) : undefined;

  return {
    clientEventId: raw.clientEventId,
    sequence: raw.sequence,
    type,
    timestamp: raw.timestamp,
    url: raw.url,
    element,
    metadata: raw.metadata,
    assetClientId: raw.assetClientId,
  };
}

export function normalizeEvents(raw: RawCaptureEvent[]): NormalizedEvent[] {
  const seen = new Set<string>();
  const out: NormalizedEvent[] = [];
  for (const r of raw) {
    const n = normalizeEvent(r);
    if (!n) continue;
    if (seen.has(n.clientEventId)) continue;
    seen.add(n.clientEventId);
    out.push(n);
  }
  return out.sort((a, b) => a.sequence - b.sequence || a.timestamp - b.timestamp);
}

function elementLabel(el?: Record<string, unknown>): string {
  if (!el) return "the element";
  const tag = String(el.tag || "").toLowerCase();
  const candidates = [el.text, el.ariaLabel, el.alt, el.title, el.name, el.role];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) {
      return `"${String(c).trim().slice(0, 80)}"`;
    }
  }
  if (tag === "svg" || tag === "path") return `"SVG"`;
  if (tag === "img") return `"Image"`;
  if (tag) return `"${tag}"`;
  return "the element";
}

function fieldIdentity(el?: Record<string, unknown>): string {
  if (!el) return "";
  return String(el.selectorHint || el.name || el.ariaLabel || el.tag || "");
}

function readHighlight(ev: NormalizedEvent): StepHighlight | undefined {
  const fromMeta = ev.metadata?.highlight;
  if (fromMeta && typeof fromMeta === "object") {
    const h = fromMeta as Record<string, unknown>;
    if (
      typeof h.x === "number" &&
      typeof h.y === "number" &&
      typeof h.w === "number" &&
      typeof h.h === "number"
    ) {
      return { x: h.x, y: h.y, w: h.w, h: h.h };
    }
  }
  const el = ev.element;
  if (el?.highlight && typeof el.highlight === "object") {
    const h = el.highlight as Record<string, unknown>;
    if (
      typeof h.x === "number" &&
      typeof h.y === "number" &&
      typeof h.w === "number" &&
      typeof h.h === "number"
    ) {
      return { x: h.x, y: h.y, w: h.w, h: h.h };
    }
  }
  // Fallback: pixel rect → normalize roughly (assume 1280x720 if unknown)
  if (
    typeof el?.x === "number" &&
    typeof el?.y === "number" &&
    typeof el?.width === "number" &&
    typeof el?.height === "number"
  ) {
    const vw = 1280;
    const vh = 720;
    return {
      x: Math.min(1, Math.max(0, (el.x as number) / vw)),
      y: Math.min(1, Math.max(0, (el.y as number) / vh)),
      w: Math.min(1, Math.max(0, (el.width as number) / vw)),
      h: Math.min(1, Math.max(0, (el.height as number) / vh)),
    };
  }
  return undefined;
}

function isAfterChild(ev: NormalizedEvent, parentId: string): boolean {
  return (
    ev.metadata?.parentClientEventId === parentId &&
    (ev.metadata?.phase === "after" || ev.type === CaptureEventType.NAVIGATION)
  );
}

function isResultChild(ev: NormalizedEvent, parentId: string): boolean {
  return ev.metadata?.parentClientEventId === parentId && ev.metadata?.phase === "result";
}

function consumeChildren(
  events: NormalizedEvent[],
  start: number,
  parentId: string,
): {
  end: number;
  destinationAssetClientId?: string;
  resultText?: string;
  navigated: boolean;
  childIds: string[];
} {
  let destinationAssetClientId: string | undefined;
  let resultText: string | undefined;
  let navigated = false;
  const childIds: string[] = [];
  let j = start;
  while (j < events.length) {
    const cur = events[j]!;
    if (isAfterChild(cur, parentId)) {
      navigated = true;
      destinationAssetClientId = cur.assetClientId ?? destinationAssetClientId;
      childIds.push(cur.clientEventId);
      j += 1;
      continue;
    }
    if (isResultChild(cur, parentId)) {
      if (typeof cur.metadata?.resultText === "string") {
        resultText = cur.metadata.resultText;
      }
      childIds.push(cur.clientEventId);
      j += 1;
      continue;
    }
    // Also fold a bare NAVIGATION immediately after click (legacy / poll) within 3s
    if (
      cur.type === CaptureEventType.NAVIGATION &&
      !cur.metadata?.parentClientEventId &&
      cur.timestamp - (events[start - 1]?.timestamp ?? cur.timestamp) < 5000
    ) {
      navigated = true;
      destinationAssetClientId = cur.assetClientId ?? destinationAssetClientId;
      childIds.push(cur.clientEventId);
      j += 1;
      continue;
    }
    break;
  }
  return { end: j, destinationAssetClientId, resultText, navigated, childIds };
}

function buildClickLikeStep(
  ev: NormalizedEvent,
  title: string,
  description: string,
  children: ReturnType<typeof consumeChildren>,
): HeuristicStep {
  const highlight = readHighlight(ev);
  const annotation: StepAnnotation = {
    kind: "click",
    highlight,
    resultText: children.resultText,
    navigated: children.navigated || undefined,
    destinationAssetClientId: children.destinationAssetClientId,
  };
  let desc = description;
  if (children.resultText) {
    desc = `${description}\n\nResult: ${children.resultText}`;
  } else if (children.navigated) {
    desc = `${description}\n\nThen wait for the next page to load.`;
  }
  return {
    title,
    description: desc,
    assetClientId: ev.assetClientId,
    destinationAssetClientId: children.destinationAssetClientId,
    annotations: [annotation],
    sourceEventIds: [ev.clientEventId, ...children.childIds],
  };
}

/**
 * Group raw events into editable workflow steps without AI.
 */
export function groupEventsIntoSteps(events: NormalizedEvent[]): HeuristicStep[] {
  const steps: HeuristicStep[] = [];
  let i = 0;

  while (i < events.length) {
    const ev = events[i]!;

    // Skip child events already folded into a parent click
    if (
      ev.metadata?.parentClientEventId &&
      (ev.metadata?.phase === "after" || ev.metadata?.phase === "result")
    ) {
      i += 1;
      continue;
    }

    if (ev.type === CaptureEventType.INPUT) {
      const group: NormalizedEvent[] = [ev];
      const identity = fieldIdentity(ev.element);
      let j = i + 1;
      while (j < events.length) {
        const cur = events[j]!;
        if (cur.type !== CaptureEventType.INPUT) break;
        if (identity && fieldIdentity(cur.element) !== identity) break;
        group.push(cur);
        j += 1;
      }

      const last = group[group.length - 1]!;
      const next = events[j];
      const label = elementLabel(last.element);
      const assetClientId =
        [...group].reverse().find((e) => e.assetClientId)?.assetClientId ?? last.assetClientId;

      if (next && (next.type === CaptureEventType.CLICK || next.type === CaptureEventType.SUBMIT)) {
        const children = consumeChildren(events, j + 1, next.clientEventId);
        const clickStep = buildClickLikeStep(
          next,
          `Type in ${label} and continue`,
          `Enter a value in ${label}, then click ${elementLabel(next.element)}.`,
          children,
        );
        clickStep.assetClientId = next.assetClientId ?? assetClientId;
        clickStep.sourceEventIds = [
          ...group.map((e) => e.clientEventId),
          ...clickStep.sourceEventIds,
        ];
        steps.push(clickStep);
        i = children.end;
        continue;
      }

      steps.push({
        title: `Type in ${label}`,
        description: `Enter a value in ${label}.`,
        assetClientId,
        annotations: [],
        sourceEventIds: group.map((e) => e.clientEventId),
      });
      i = j;
      continue;
    }

    switch (ev.type) {
      case CaptureEventType.NAVIGATION:
      case CaptureEventType.PAGE_LOAD:
        // Standalone open / address-bar navigation
        steps.push({
          title: ev.type === CaptureEventType.PAGE_LOAD ? "Open the page" : "Open the page",
          description: ev.url ? `Navigate to ${ev.url}.` : "Open the page.",
          assetClientId: ev.assetClientId,
          annotations: [],
          sourceEventIds: [ev.clientEventId],
        });
        i += 1;
        break;
      case CaptureEventType.CLICK: {
        const children = consumeChildren(events, i + 1, ev.clientEventId);
        const label = elementLabel(ev.element);
        steps.push(
          buildClickLikeStep(ev, `Click ${label}`, `Click ${label}.`, children),
        );
        i = children.end;
        break;
      }
      case CaptureEventType.SUBMIT: {
        const children = consumeChildren(events, i + 1, ev.clientEventId);
        steps.push(
          buildClickLikeStep(
            ev,
            "Submit the form",
            `Submit ${elementLabel(ev.element)}.`,
            children,
          ),
        );
        i = children.end;
        break;
      }
      case CaptureEventType.SELECT: {
        const children = consumeChildren(events, i + 1, ev.clientEventId);
        const label = elementLabel(ev.element);
        steps.push(
          buildClickLikeStep(
            ev,
            `Select an option in ${label}`,
            `Choose an option in ${label}.`,
            children,
          ),
        );
        i = children.end;
        break;
      }
      case CaptureEventType.TAB_CHANGE: {
        const tabTitle = ev.metadata?.title as string | undefined;
        steps.push({
          title: tabTitle ? `Switch to tab: ${tabTitle}` : "Switch browser tab",
          description: tabTitle
            ? `Switch to the "${tabTitle}" tab.`
            : ev.url
              ? `Switch to tab ${ev.url}.`
              : "Switch to the other browser tab.",
          assetClientId: ev.assetClientId,
          annotations: [],
          sourceEventIds: [ev.clientEventId],
        });
        i += 1;
        break;
      }
      case CaptureEventType.CUSTOM: {
        // Orphan result without parent — treat as informational step
        const resultText =
          typeof ev.metadata?.resultText === "string" ? ev.metadata.resultText : undefined;
        steps.push({
          title: resultText ? "Result" : "Perform action",
          description: resultText ?? "Complete the action.",
          assetClientId: ev.assetClientId,
          annotations: resultText
            ? [{ kind: "click", resultText }]
            : [],
          sourceEventIds: [ev.clientEventId],
        });
        i += 1;
        break;
      }
      default:
        steps.push({
          title: `Perform action`,
          description: `Complete the ${ev.type.toLowerCase()} action on ${elementLabel(ev.element)}.`,
          assetClientId: ev.assetClientId,
          annotations: [],
          sourceEventIds: [ev.clientEventId],
        });
        i += 1;
    }
  }

  return steps;
}

export function debounceKey(type: string, selectorHint?: string, url?: string): string {
  return `${type}|${selectorHint ?? ""}|${url ?? ""}`;
}
