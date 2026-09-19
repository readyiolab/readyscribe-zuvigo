export type CaptureStatus =
  | "idle"
  | "connecting"
  | "starting"
  | "capturing"
  | "paused"
  | "uploading"
  | "processing"
  | "completed"
  | "failed";

export type ExtMessage =
  | { type: "START_CAPTURE"; tabId: number; workspaceId: string; apiBase: string }
  | {
      type: "BEGIN_CAPTURE_ON_TAB";
      tabId: number;
      workspaceId?: string;
      apiBase: string;
      createNewTab?: boolean;
    }
  | { type: "PAUSE_CAPTURE" }
  | { type: "RESUME_CAPTURE" }
  | { type: "STOP_CAPTURE" }
  | { type: "UNDO_LAST" }
  | { type: "GET_STATE" }
  | { type: "BOOTSTRAP"; apiBase: string }
  | { type: "CONNECT_EXTENSION"; apiBase: string }
  | { type: "SET_TOKEN"; token: string; apiBase: string }
  | { type: "STATE"; state: CaptureState }
  | { type: "CONTENT_EVENT"; event: BufferedEvent; needsScreenshot?: boolean }
  | { type: "NAV_PENDING"; parentClientEventId: string; fromUrl: string }
  | { type: "SET_WAITING"; waiting: boolean }
  | { type: "TAB_LOAD_STATUS"; status: "loading" | "complete" }
  | { type: "PING" };

export interface HighlightBox {
  /** Normalized 0–1 relative to viewport (matches captureVisibleTab). */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BufferedEvent {
  clientEventId: string;
  sequence: number;
  type: string;
  timestamp: number;
  url?: string;
  element?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  assetClientId?: string;
  screenshotDataUrl?: string;
}

export interface WorkspaceOption {
  id: string;
  name: string;
  slug: string;
  role: string;
}

export interface CaptureState {
  status: CaptureStatus;
  captureSessionId: string | null;
  workspaceId: string | null;
  workspaceName: string | null;
  workspaces: WorkspaceOption[];
  userEmail: string | null;
  signedIn: boolean;
  apiBase: string;
  tabId: number | null;
  sequence: number;
  /** Live timeline for UI (not drained by uploads). */
  events: BufferedEvent[];
  /** Queue drained when uploading to API/Spaces. */
  uploadQueue: BufferedEvent[];
  lastError: string | null;
  documentId: string | null;
  /** Waiting for destination page after a click that navigated. */
  waitingNav: boolean;
  /** Focusing/loading a tab before capture starts (Capture Options flow). */
  openingTab: boolean;
  openingMessage: string | null;
}

export const DEFAULT_STATE: CaptureState = {
  status: "idle",
  captureSessionId: null,
  workspaceId: null,
  workspaceName: null,
  workspaces: [],
  userEmail: null,
  signedIn: false,
  apiBase: "http://localhost:3000",
  tabId: null,
  sequence: 0,
  events: [],
  uploadQueue: [],
  lastError: null,
  documentId: null,
  waitingNav: false,
  openingTab: false,
  openingMessage: null,
};

const PASSWORD_NAME_RE =
  /password|passwd|passphrase|secret|api[_-]?key|access[_-]?token|auth[_-]?token|cvv|cvc|card[_-]?number|credit/i;

export function isSensitiveField(el: {
  type?: string | null;
  name?: string | null;
  autocomplete?: string | null;
  ariaLabel?: string | null;
}): boolean {
  if ((el.type ?? "").toLowerCase() === "password") return true;
  const auto = (el.autocomplete ?? "").toLowerCase();
  if (auto.includes("password") || auto === "cc-csc" || auto === "cc-number") return true;
  return PASSWORD_NAME_RE.test(`${el.name ?? ""} ${el.ariaLabel ?? ""}`);
}

function clamp01(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export function viewportHighlight(rect: DOMRect): HighlightBox {
  const vw = Math.max(window.innerWidth, 1);
  const vh = Math.max(window.innerHeight, 1);
  return {
    x: clamp01(rect.x / vw),
    y: clamp01(rect.y / vh),
    w: clamp01(rect.width / vw),
    h: clamp01(rect.height / vh),
  };
}

export function describeElement(target: Element): Record<string, unknown> {
  const el = target as HTMLElement;
  const tag = el.tagName?.toLowerCase() || undefined;
  const type = (el as HTMLInputElement).type || undefined;
  const name = (el as HTMLInputElement).name || undefined;
  const autocomplete = (el as HTMLInputElement).autocomplete || undefined;
  const ariaLabel = el.getAttribute("aria-label") || undefined;
  const role = el.getAttribute("role") || undefined;
  const alt = el.getAttribute("alt") || undefined;
  const titleAttr = el.getAttribute("title") || undefined;
  const text = (el.innerText || (el as HTMLInputElement).placeholder || "").trim().slice(0, 120);
  const rect = el.getBoundingClientRect();
  const highlight = viewportHighlight(rect);

  const sensitive = isSensitiveField({ type, name, autocomplete, ariaLabel });

  return {
    tag,
    type,
    name,
    role,
    ariaLabel,
    alt,
    title: titleAttr,
    text: sensitive ? undefined : text || undefined,
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    highlight,
    isPassword: sensitive && type === "password",
    isSensitive: sensitive,
    valueRedacted: true,
    selectorHint: buildSelectorHint(el),
  };
}

function buildSelectorHint(el: HTMLElement): string {
  const parts: string[] = [];
  let cur: HTMLElement | null = el;
  let depth = 0;
  while (cur && depth < 4) {
    let part = cur.tagName.toLowerCase();
    if (cur.id) {
      part += `#${cur.id}`;
      parts.unshift(part);
      break;
    }
    const cls = Array.from(cur.classList).slice(0, 2).join(".");
    if (cls) part += `.${cls}`;
    parts.unshift(part);
    cur = cur.parentElement;
    depth += 1;
  }
  return parts.join(" > ").slice(0, 300);
}

/** Prefer visible label text for Scribe-style step titles. */
export function elementDisplayLabel(el?: Record<string, unknown>): string {
  if (!el) return "the element";
  const tag = String(el.tag || "").toLowerCase();
  const candidates = [el.text, el.ariaLabel, el.alt, el.title, el.name, el.role];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) {
      return `"${truncate(c.trim(), 80)}"`;
    }
  }
  if (tag === "svg" || tag === "path") return `"SVG"`;
  if (tag === "img") return `"Image"`;
  if (tag) return `"${tag}"`;
  return "the element";
}

export function eventLabel(ev: BufferedEvent): string {
  if (ev.type === "NAVIGATION" || ev.type === "PAGE_LOAD") {
    if (ev.metadata?.phase === "after") return "Page loaded";
    return ev.url ? truncate(ev.url, 60) : "Open page";
  }
  if (ev.metadata?.resultText && typeof ev.metadata.resultText === "string") {
    return truncate(String(ev.metadata.resultText), 80);
  }
  if (ev.type === "CLICK") return `Click ${elementDisplayLabel(ev.element)}`;
  return elementDisplayLabel(ev.element);
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
