import {
  describeElement,
  type BufferedEvent,
  type ExtMessage,
  type HighlightBox,
} from "./shared";

let active = false;
let lastClickKey = "";
let lastClickAt = 0;
let postClickWatch: AbortController | null = null;

/** Debounced typing: one INPUT event per field after the user pauses. */
const INPUT_DEBOUNCE_MS = 600;
const POST_CLICK_MS = 5000;
const RESULT_WATCH_MS = 1800;
const pendingInputs = new Map<
  string,
  { timer: ReturnType<typeof setTimeout>; element: Record<string, unknown>; kind: string }
>();

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function fieldKey(el: Record<string, unknown>): string {
  return String(el.selectorHint || el.name || el.ariaLabel || el.tag || "field");
}

function sendEvent(partial: {
  type: string;
  clientEventId?: string;
  element?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  withScreenshot?: boolean;
  assetClientId?: string;
}) {
  if (!active && partial.type !== "PAGE_LOAD") return;

  const clientEventId = partial.clientEventId ?? uid();
  const assetClientId =
    partial.assetClientId ??
    (partial.withScreenshot ? `asset-${clientEventId}` : undefined);

  const event: BufferedEvent = {
    clientEventId,
    sequence: 0,
    type: partial.type,
    timestamp: Date.now(),
    url: location.href,
  };
  if (partial.element) event.element = partial.element;
  if (partial.metadata) event.metadata = partial.metadata;
  if (assetClientId) event.assetClientId = assetClientId;

  const payload: ExtMessage = {
    type: "CONTENT_EVENT",
    event,
    needsScreenshot: Boolean(partial.withScreenshot),
  };

  chrome.runtime.sendMessage(payload);
}

function setWaiting(waiting: boolean) {
  chrome.runtime.sendMessage({ type: "SET_WAITING", waiting } satisfies ExtMessage).catch(() => {});
}

function flushPendingInput(key: string) {
  const pending = pendingInputs.get(key);
  if (!pending) return;
  clearTimeout(pending.timer);
  pendingInputs.delete(key);
  sendEvent({
    type: pending.kind,
    element: pending.element,
    withScreenshot: true,
  });
}

function flushAllPendingInputs() {
  for (const key of [...pendingInputs.keys()]) {
    flushPendingInput(key);
  }
}

function highlightFromElement(el: Record<string, unknown>): HighlightBox | undefined {
  const h = el.highlight;
  if (
    h &&
    typeof h === "object" &&
    typeof (h as HighlightBox).x === "number" &&
    typeof (h as HighlightBox).y === "number" &&
    typeof (h as HighlightBox).w === "number" &&
    typeof (h as HighlightBox).h === "number"
  ) {
    return h as HighlightBox;
  }
  return undefined;
}

function extractToastText(node: Element): string | null {
  const text = (node.textContent || "").replace(/\s+/g, " ").trim();
  if (text.length < 4 || text.length > 280) return null;
  const lower = text.toLowerCase();
  if (
    lower.includes("copied") ||
    lower.includes("success") ||
    lower.includes("saved") ||
    lower.includes("sent") ||
    lower.includes("updated") ||
    lower.includes("deleted") ||
    /\bcopied successfully\b/i.test(text)
  ) {
    return text;
  }
  return null;
}

function watchForResult(signal: AbortSignal): Promise<string | null> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(null);
      return;
    }
    let settled = false;
    const done = (value: string | null) => {
      if (settled) return;
      settled = true;
      try {
        observer.disconnect();
      } catch {
        /* ignore */
      }
      resolve(value);
    };

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of Array.from(m.addedNodes)) {
          if (!(node instanceof Element)) continue;
          const live = node.matches?.("[aria-live], [role='status'], [role='alert']")
            ? node
            : node.querySelector?.("[aria-live], [role='status'], [role='alert']");
          const toast = node.matches?.(
            "[class*='toast'], [class*='Toast'], [class*='snackbar'], [class*='Snackbar'], [data-toast]",
          )
            ? node
            : node.querySelector?.(
                "[class*='toast'], [class*='Toast'], [class*='snackbar'], [class*='Snackbar'], [data-toast]",
              );
          for (const el of [live, toast].filter(Boolean) as Element[]) {
            const text = extractToastText(el);
            if (text) {
              done(text);
              return;
            }
          }
        }
      }
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
    signal.addEventListener("abort", () => done(null), { once: true });
    setTimeout(() => done(null), RESULT_WATCH_MS);
  });
}

function waitForSpaNavigation(fromUrl: string, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false);
      return;
    }
    const started = Date.now();
    const tick = () => {
      if (signal.aborted) {
        resolve(false);
        return;
      }
      if (location.href !== fromUrl) {
        resolve(true);
        return;
      }
      if (Date.now() - started > POST_CLICK_MS) {
        resolve(false);
        return;
      }
      setTimeout(tick, 120);
    };
    tick();
  });
}

/**
 * After a click: detect hard/SPA navigation or a toast/result.
 * Hard navigations are finished by the background (content is unloaded).
 */
async function afterClickWatch(parentClientEventId: string, highlight?: HighlightBox) {
  postClickWatch?.abort();
  const ac = new AbortController();
  postClickWatch = ac;
  const fromUrl = location.href;

  setWaiting(true);

  const onPageHide = () => {
    chrome.runtime
      .sendMessage({
        type: "NAV_PENDING",
        parentClientEventId,
        fromUrl,
      } satisfies ExtMessage)
      .catch(() => {});
  };
  window.addEventListener("pagehide", onPageHide, { once: true });

  try {
    const spaNav = waitForSpaNavigation(fromUrl, ac.signal);
    const result = watchForResult(ac.signal);
    const timedOut = new Promise<"timeout">((r) => setTimeout(() => r("timeout"), POST_CLICK_MS));

    const winner = await Promise.race([
      spaNav.then((n) => (n ? ("spa" as const) : ("none" as const))),
      result.then((t) => (t ? ({ kind: "result" as const, text: t }) : ("none" as const))),
      timedOut,
    ]);

    if (ac.signal.aborted) return;

    if (winner === "spa") {
      await new Promise((r) => setTimeout(r, 600));
      if (ac.signal.aborted) return;
      lastUrl = location.href;
      sendEvent({
        type: "NAVIGATION",
        metadata: {
          parentClientEventId,
          phase: "after",
          navigated: true,
          highlight,
          url: location.href,
        },
        withScreenshot: true,
        assetClientId: `asset-${parentClientEventId}-after`,
      });
      setWaiting(false);
      return;
    }

    if (typeof winner === "object" && winner.kind === "result") {
      sendEvent({
        type: "CUSTOM",
        metadata: {
          parentClientEventId,
          phase: "result",
          resultText: winner.text,
        },
      });
      setWaiting(false);
      return;
    }

    if (location.href === fromUrl) setWaiting(false);
  } finally {
    window.removeEventListener("pagehide", onPageHide);
  }
}

function onClick(e: MouseEvent) {
  if (!active) return;
  flushAllPendingInputs();

  const target = e.target as Element | null;
  if (!target) return;
  const interactive =
    (target as HTMLElement).closest?.(
      "a, button, [role='button'], input, select, textarea, summary, label, [onclick]",
    ) ?? target;
  const element = describeElement(interactive);
  const key = `${element.selectorHint}|${element.x}|${element.y}`;
  const now = Date.now();
  if (key === lastClickKey && now - lastClickAt < 400) return;
  lastClickKey = key;
  lastClickAt = now;

  const clientEventId = uid();
  const highlight = highlightFromElement(element);
  sendEvent({
    type: "CLICK",
    clientEventId,
    element,
    metadata: {
      phase: "click",
      highlight,
    },
    withScreenshot: true,
  });

  void afterClickWatch(clientEventId, highlight);
}

function onInput(e: Event) {
  if (!active) return;
  const target = e.target as HTMLInputElement | HTMLTextAreaElement | null;
  if (!target) return;

  const kind =
    target.type === "checkbox" ? "CHECKBOX" : target.type === "radio" ? "RADIO" : "INPUT";

  if (kind !== "INPUT") {
    sendEvent({ type: kind, element: describeElement(target), withScreenshot: true });
    return;
  }

  const element = describeElement(target);
  const key = fieldKey(element);
  const existing = pendingInputs.get(key);
  if (existing) clearTimeout(existing.timer);

  const timer = setTimeout(() => {
    flushPendingInput(key);
  }, INPUT_DEBOUNCE_MS);

  pendingInputs.set(key, { timer, element, kind });
}

function onBlur(e: FocusEvent) {
  if (!active) return;
  const target = e.target as HTMLInputElement | HTMLTextAreaElement | null;
  if (!target || (target.tagName !== "INPUT" && target.tagName !== "TEXTAREA")) return;
  if (target.type === "checkbox" || target.type === "radio") return;
  const key = fieldKey(describeElement(target));
  if (pendingInputs.has(key)) flushPendingInput(key);
}

function onChange(e: Event) {
  if (!active) return;
  const target = e.target as HTMLSelectElement | null;
  if (!target || target.tagName !== "SELECT") return;
  const element = describeElement(target);
  const clientEventId = uid();
  sendEvent({
    type: "SELECT",
    clientEventId,
    element,
    metadata: { phase: "click", highlight: highlightFromElement(element) },
    withScreenshot: true,
  });
}

function onSubmit(e: Event) {
  if (!active) return;
  flushAllPendingInputs();
  const target = e.target as Element | null;
  const element = target ? describeElement(target) : undefined;
  const clientEventId = uid();
  sendEvent({
    type: "SUBMIT",
    clientEventId,
    element,
    metadata: {
      phase: "click",
      highlight: element ? highlightFromElement(element) : undefined,
    },
    withScreenshot: true,
  });
  void afterClickWatch(clientEventId, element ? highlightFromElement(element) : undefined);
}

let lastUrl = location.href;
function checkNavigation() {
  if (!active) return;
  if (location.href !== lastUrl) {
    flushAllPendingInputs();
    lastUrl = location.href;
    if (postClickWatch && !postClickWatch.signal.aborted) return;
    sendEvent({ type: "NAVIGATION", metadata: { url: location.href }, withScreenshot: true });
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "START_CAPTURE") {
    active = true;
    lastUrl = location.href;
    pendingInputs.clear();
    postClickWatch?.abort();
    postClickWatch = null;
    sendEvent({ type: "PAGE_LOAD", withScreenshot: true });
  }
  if (msg?.type === "PAUSE_CAPTURE") {
    flushAllPendingInputs();
    active = false;
    setWaiting(false);
  }
  if (msg?.type === "RESUME_CAPTURE") active = true;
  if (msg?.type === "STOP_CAPTURE") {
    flushAllPendingInputs();
    active = false;
    setWaiting(false);
    postClickWatch?.abort();
  }
  if (msg?.type === "KEEP_CAPTURE_ACTIVE") {
    active = true;
    lastUrl = location.href;
  }
});

function syncState() {
  chrome.runtime.sendMessage({ type: "GET_STATE" } satisfies ExtMessage, (res) => {
    if (chrome.runtime.lastError) return;
    if (res?.type === "STATE") {
      if (res.state.status === "capturing") {
        active = true;
        lastUrl = location.href;
      } else if (
        res.state.status === "paused" ||
        res.state.status === "idle" ||
        res.state.status === "completed"
      ) {
        active = false;
      }
    }
  });
}

window.addEventListener("focus", syncState);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    syncState();
  }
});

syncState();

document.addEventListener("click", onClick, true);
document.addEventListener("input", onInput, true);
document.addEventListener("blur", onBlur, true);
document.addEventListener("change", onChange, true);
document.addEventListener("submit", onSubmit, true);
setInterval(checkNavigation, 800);
