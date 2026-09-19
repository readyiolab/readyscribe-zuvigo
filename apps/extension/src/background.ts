import {
  DEFAULT_STATE,
  type CaptureState,
  type ExtMessage,
  type BufferedEvent,
  type WorkspaceOption,
} from "./shared";

const DB_NAME = "zuvigo-capture";
const STORE = "events";
const MAX_TIMELINE = 200;

type PendingNav = {
  parentClientEventId: string;
  fromUrl: string;
  startedAt: number;
};

let pendingNav: PendingNav | null = null;
let afterShotInFlight = false;

async function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "clientEventId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function bufferEvent(event: BufferedEvent) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(event);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function readBuffered(): Promise<BufferedEvent[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as BufferedEvent[]);
    req.onerror = () => reject(req.error);
  });
}

async function clearBuffered() {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

let state: CaptureState = {
  ...DEFAULT_STATE,
  events: [],
  uploadQueue: [],
  workspaces: [],
  waitingNav: false,
  openingTab: false,
  openingMessage: null,
};

async function persistState() {
  const slim: CaptureState = {
    ...state,
    events: state.events.map((e) => ({
      ...e,
      screenshotDataUrl: e.screenshotDataUrl ? "[inline]" : undefined,
    })),
    uploadQueue: state.uploadQueue.map(({ screenshotDataUrl: _, ...rest }) => rest),
  };
  await chrome.storage.session.set({
    captureStateMeta: {
      status: slim.status,
      captureSessionId: slim.captureSessionId,
      workspaceId: slim.workspaceId,
      workspaceName: slim.workspaceName,
      workspaces: slim.workspaces,
      userEmail: slim.userEmail,
      signedIn: slim.signedIn,
      apiBase: slim.apiBase,
      tabId: slim.tabId,
      sequence: slim.sequence,
      lastError: slim.lastError,
      documentId: slim.documentId,
      waitingNav: slim.waitingNav,
      openingTab: slim.openingTab,
      openingMessage: slim.openingMessage,
      eventCount: state.events.length,
    },
  });
}

async function loadState() {
  const data = await chrome.storage.session.get(["captureStateMeta", "selectedWorkspaceId"]);
  const meta = data.captureStateMeta as Partial<CaptureState> | undefined;

  // Never clobber an in-flight capture with stale session storage.
  // (Every message handler called loadState, which restored completed session ids → 409 on /events.)
  const live =
    state.openingTab ||
    state.status === "capturing" ||
    state.status === "starting" ||
    state.status === "uploading" ||
    state.status === "paused" ||
    state.status === "processing" ||
    state.status === "connecting";

  if (meta) {
    if (live) {
      if (meta.workspaces) state.workspaces = meta.workspaces as WorkspaceOption[];
      if (typeof meta.signedIn === "boolean") state.signedIn = meta.signedIn;
      if (meta.userEmail !== undefined) state.userEmail = meta.userEmail ?? null;
      if (meta.apiBase) state.apiBase = meta.apiBase;
      if (meta.workspaceName) state.workspaceName = meta.workspaceName;
    } else {
      state = {
        ...state,
        ...meta,
        events: state.events,
        uploadQueue: state.uploadQueue,
        workspaces: (meta.workspaces as WorkspaceOption[]) ?? state.workspaces,
        waitingNav: Boolean(meta.waitingNav),
        openingTab: Boolean(meta.openingTab),
        openingMessage: meta.openingMessage ?? null,
      };
    }
  }
  if (
    !live &&
    data.selectedWorkspaceId &&
    typeof data.selectedWorkspaceId === "string"
  ) {
    state.workspaceId = data.selectedWorkspaceId;
  }
}

function broadcast() {
  chrome.runtime.sendMessage({ type: "STATE", state } satisfies ExtMessage).catch(() => {});
}

async function getExtensionToken(): Promise<string | null> {
  const data = await chrome.storage.local.get("extensionToken");
  return typeof data.extensionToken === "string" ? data.extensionToken : null;
}

async function api(path: string, init?: RequestInit) {
  const cookies = await chrome.cookies.getAll({ url: state.apiBase });
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const bearer = await getExtensionToken();
  const res = await fetch(`${state.apiBase}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

async function connectExtension(apiBase: string) {
  state.apiBase = apiBase || state.apiBase;
  state.status = "connecting";
  state.lastError = null;
  await persistState();
  broadcast();

  const handoffId = `hof_${crypto.randomUUID().replace(/-/g, "")}`;

  try {
    const createRes = await fetch(`${state.apiBase}/api/v1/extension/handoff`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handoffId, action: "create" }),
    });
    if (!createRes.ok) {
      const body = await createRes.text();
      throw new Error(`Handoff create failed (${createRes.status}): ${body.slice(0, 200)}`);
    }
  } catch (err) {
    state.status = "failed";
    state.lastError =
      (err as Error).message ||
      "Could not start connect handoff. Is the web app running?";
    await persistState();
    broadcast();
    return;
  }

  const connectUrl = `${state.apiBase}/extension/connect?handoff=${handoffId}`;
  await chrome.tabs.create({ url: connectUrl });

  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    try {
      const res = await fetch(
        `${state.apiBase}/api/v1/extension/handoff?handoffId=${encodeURIComponent(handoffId)}`,
      );
      if (!res.ok) continue;
      const data = await res.json();
      if (data.ready && data.token) {
        await chrome.storage.local.set({ extensionToken: data.token });
        await bootstrap(state.apiBase);
        if (!state.signedIn || state.workspaces.length === 0) {
          state.status = "failed";
          state.lastError =
            state.lastError ||
            "Connected but workspaces did not load. Try Refresh or paste a token from Settings.";
        } else {
          state.status = "idle";
          state.lastError = null;
        }
        await persistState();
        broadcast();
        return;
      }
    } catch {
      // keep polling
    }
  }
  state.status = "failed";
  state.lastError =
    "Connect timed out. Sign in on the web tab, then click Connect again — or paste a token from Settings → Advanced.";
  await persistState();
  broadcast();
}

async function setExtensionToken(token: string, apiBase: string) {
  const trimmed = token.trim();
  if (!trimmed) {
    state.lastError = "Paste a non-empty extension token.";
    await persistState();
    broadcast();
    return;
  }
  state.apiBase = apiBase || state.apiBase;
  state.lastError = null;
  await chrome.storage.local.set({ extensionToken: trimmed });
  await bootstrap(state.apiBase);
  if (!state.signedIn) {
    state.status = "failed";
    state.lastError = "Token rejected. Generate a new one in Dashboard → Settings.";
  } else {
    state.status = "idle";
    state.lastError = null;
  }
  await persistState();
  broadcast();
}

async function bootstrap(apiBase: string) {
  state.apiBase = apiBase || state.apiBase;
  state.lastError = null;
  try {
    const me = await api("/api/v1/me");
    state.signedIn = true;
    state.userEmail = me.user?.email ?? null;
    state.workspaces = (me.workspaces ?? []).map(
      (w: { id: string; name: string; slug: string; role: string }) => ({
        id: w.id,
        name: w.name,
        slug: w.slug,
        role: w.role,
      }),
    );
    const sessionStored = await chrome.storage.session.get("selectedWorkspaceId");
    const localStored = await chrome.storage.local.get("zuvigo_active_workspace_id");
    const preferred =
      (sessionStored.selectedWorkspaceId as string | undefined) ||
      (localStored.zuvigo_active_workspace_id as string | undefined) ||
      state.workspaceId ||
      state.workspaces[0]?.id ||
      null;
    const match = state.workspaces.find((w) => w.id === preferred) ?? state.workspaces[0];
    state.workspaceId = match?.id ?? null;
    state.workspaceName = match?.name ?? null;
    if (state.workspaceId) {
      await chrome.storage.session.set({ selectedWorkspaceId: state.workspaceId });
      await chrome.storage.local.set({ zuvigo_active_workspace_id: state.workspaceId });
    }
    if (state.workspaces.length === 0) {
      state.lastError = "Signed in, but no workspaces found. Create one in the dashboard.";
    }
  } catch (err) {
    state.signedIn = false;
    state.userEmail = null;
    state.workspaces = [];
    state.workspaceId = null;
    state.workspaceName = null;
    state.lastError = (err as Error).message;
  }
  await persistState();
  broadcast();
}

async function clearBufferedIds(ids: string[]) {
  if (!ids.length) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    for (const id of ids) store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function flushEvents() {
  if (!state.captureSessionId || state.uploadQueue.length === 0) return;
  // Pin session id so a concurrent loadState/start cannot redirect this batch.
  const sessionId = state.captureSessionId;
  const batch = state.uploadQueue.splice(0, 50);
  const payload = {
    events: batch.map(({ screenshotDataUrl: _, ...rest }) => rest),
  };
  try {
    for (const ev of batch) {
      if (!ev.screenshotDataUrl || !ev.assetClientId) continue;
      await uploadScreenshotForSession(sessionId, ev);
    }
    await api(`/api/v1/captures/${sessionId}/events`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    await clearBufferedIds(batch.map((e) => e.clientEventId));
  } catch (err) {
    const msg = (err as Error).message || "";
    // Session already completed/processing — do not requeue forever
    if (
      msg.includes("409") ||
      msg.includes("CONFLICT") ||
      msg.includes("not accepting events")
    ) {
      await clearBufferedIds(batch.map((e) => e.clientEventId)).catch(() => {});
      if (state.captureSessionId === sessionId) {
        state.lastError =
          "Capture closed before some events uploaded. Start a new capture if steps are missing.";
        await persistState();
      }
      return;
    }
    state.uploadQueue.unshift(...batch);
    state.lastError = msg;
    await persistState();
    throw err;
  }
}

async function uploadScreenshotForSession(sessionId: string, ev: BufferedEvent) {
  if (!ev.screenshotDataUrl || !ev.assetClientId) return;
  if (ev.screenshotDataUrl === "[inline]") return;
  const blob = await (await fetch(ev.screenshotDataUrl)).blob();
  const mimeType = blob.type === "image/png" ? "image/png" : "image/webp";
  const signed = await api(`/api/v1/captures/${sessionId}/assets/sign`, {
    method: "POST",
    body: JSON.stringify({
      clientAssetId: ev.assetClientId,
      mimeType,
      byteSize: blob.size,
    }),
  });

  if (String(signed.uploadUrl).startsWith("memory://")) {
    await api(`/api/v1/captures/${sessionId}/assets`, {
      method: "POST",
      body: JSON.stringify({
        clientAssetId: ev.assetClientId,
        assetId: signed.assetId,
        byteSize: blob.size,
      }),
    });
    return;
  }

  await fetch(signed.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": mimeType },
    body: blob,
  });

  await api(`/api/v1/captures/${sessionId}/assets`, {
    method: "POST",
    body: JSON.stringify({
      clientAssetId: ev.assetClientId,
      assetId: signed.assetId,
      byteSize: blob.size,
    }),
  });
}

async function uploadScreenshot(ev: BufferedEvent) {
  if (!state.captureSessionId) return;
  await uploadScreenshotForSession(state.captureSessionId, ev);
}

async function ensureScreenshotPermission(): Promise<boolean> {
  try {
    const needed = { origins: ["<all_urls>"] as string[] };
    const has = await chrome.permissions.contains(needed);
    if (has) return true;
    const granted = await chrome.permissions.request(needed);
    return Boolean(granted);
  } catch {
    return true;
  }
}

async function captureRecordedTab(): Promise<string | null> {
  if (!state.tabId) return null;
  const ok = await ensureScreenshotPermission();
  if (!ok) {
    state.lastError =
      "Screenshot permission denied. Reload the extension and allow access to all sites.";
    return null;
  }

  const tab = await chrome.tabs.get(state.tabId);
  if (tab.windowId == null) return null;

  if (!tab.active) {
    await chrome.tabs.update(state.tabId, { active: true });
    await new Promise((r) => setTimeout(r, 120));
  }

  return chrome.tabs.captureVisibleTab(tab.windowId, {
    format: "png",
    quality: 80,
  });
}

async function enqueueEvent(ev: BufferedEvent, needsScreenshot: boolean) {
  if (state.status !== "capturing") return;
  ev.sequence = state.sequence++;
  if (needsScreenshot && state.tabId) {
    try {
      const dataUrl = await captureRecordedTab();
      if (dataUrl) {
        ev.screenshotDataUrl = dataUrl;
        ev.assetClientId = ev.assetClientId ?? `asset-${ev.clientEventId}`;
        if (state.lastError?.startsWith("Screenshot")) state.lastError = null;
      }
    } catch (err) {
      const msg = (err as Error).message || "Screenshot failed";
      state.lastError = `Screenshot failed: ${msg}`;
    }
  }
  state.events.push(ev);
  if (state.events.length > MAX_TIMELINE) {
    state.events = state.events.slice(-MAX_TIMELINE);
  }
  state.uploadQueue.push({ ...ev });
  await bufferEvent(ev);
  if (state.uploadQueue.length >= 10) {
    await flushEvents().catch(() => {});
  }
  await persistState();
  broadcast();
}

async function captureAfterNavigation() {
  if (!pendingNav || afterShotInFlight || state.status !== "capturing") return;
  afterShotInFlight = true;
  const { parentClientEventId } = pendingNav;
  try {
    // Settle so destination paint is ready (not the previous page)
    await new Promise((r) => setTimeout(r, 700));
    const tab = state.tabId ? await chrome.tabs.get(state.tabId).catch(() => null) : null;
    const ev: BufferedEvent = {
      clientEventId: `${parentClientEventId}-after`,
      sequence: 0,
      type: "NAVIGATION",
      timestamp: Date.now(),
      url: tab?.url ?? undefined,
      metadata: {
        parentClientEventId,
        phase: "after",
        navigated: true,
        url: tab?.url,
      },
      assetClientId: `asset-${parentClientEventId}-after`,
    };
    await enqueueEvent(ev, true);
  } finally {
    pendingNav = null;
    state.waitingNav = false;
    afterShotInFlight = false;
    await persistState();
    broadcast();
    if (state.tabId) {
      await chrome.tabs
        .sendMessage(state.tabId, { type: "KEEP_CAPTURE_ACTIVE" })
        .catch(async () => {
          if (!state.tabId) return;
          await chrome.scripting
            .executeScript({ target: { tabId: state.tabId }, files: ["content.js"] })
            .catch(() => {});
          await chrome.tabs
            .sendMessage(state.tabId, { type: "KEEP_CAPTURE_ACTIVE" })
            .catch(() => {});
        });
    }
  }
}

async function waitForTabComplete(tabId: number, timeoutMs = 15000): Promise<void> {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (tab?.status === "complete") {
    await new Promise((r) => setTimeout(r, 400));
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("Timed out waiting for the tab to finish loading"));
    }, timeoutMs);

    const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
      if (id !== tabId) return;
      if (info.status === "loading") {
        state.openingMessage = "Loading page…";
        broadcast();
      }
      if (info.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });

  await new Promise((r) => setTimeout(r, 450));
}

async function beginCaptureOnTab(opts: {
  tabId: number;
  workspaceId?: string;
  apiBase: string;
  createNewTab?: boolean;
}) {
  state.openingTab = true;
  state.openingMessage = opts.createNewTab ? "Opening tab…" : "Opening tab…";
  state.lastError = null;
  await persistState();
  broadcast();

  try {
    let tabId = opts.tabId;
    if (opts.createNewTab) {
      const created = await chrome.tabs.create({ url: "https://www.google.com/", active: true });
      if (created.id == null) throw new Error("Could not create a new tab");
      tabId = created.id;
      state.openingMessage = "Loading page…";
      await persistState();
      broadcast();
    } else {
      const tab = await chrome.tabs.get(tabId);
      if (tab.windowId != null) {
        await chrome.windows.update(tab.windowId, { focused: true });
      }
      await chrome.tabs.update(tabId, { active: true });
      state.openingMessage = "Loading page…";
      await persistState();
      broadcast();
    }

    await waitForTabComplete(tabId);

    const ws =
      (opts.workspaceId || state.workspaceId || "").trim() ||
      ((await chrome.storage.session.get("selectedWorkspaceId")).selectedWorkspaceId as
        | string
        | undefined) ||
      "";

    await startCapture(tabId, ws, opts.apiBase || state.apiBase);

    state.openingTab = false;
    state.openingMessage =
      state.status === "capturing" ? "Capture started" : state.openingMessage;
    await persistState();
    broadcast();

    if (state.status === "capturing" || state.status === "starting") {
      try {
        await chrome.sidePanel.open({ tabId });
      } catch {
        // sidePanel.open may require user gesture; ignore if unavailable
      }
    }
  } catch (err) {
    state.openingTab = false;
    state.openingMessage = null;
    state.status = "failed";
    state.lastError = (err as Error).message;
    await persistState();
    broadcast();
  }
}

async function startCapture(tabId: number, workspaceId: string, apiBase: string) {
  state.apiBase = apiBase || state.apiBase;
  await bootstrap(state.apiBase);

  const permitted = await ensureScreenshotPermission();
  if (!permitted) {
    state.status = "failed";
    state.lastError =
      "Allow “Read and change all your data on all websites” for screenshots, then try again.";
    await persistState();
    broadcast();
    return;
  }

  const ws = (workspaceId || state.workspaceId || "").trim();
  if (!state.signedIn) {
    state.status = "failed";
    state.lastError = "Sign in at the web app first, then reopen this panel.";
    await persistState();
    broadcast();
    return;
  }
  if (!ws) {
    state.status = "failed";
    state.lastError = "No workspace found. Create one in the dashboard, then retry.";
    await persistState();
    broadcast();
    return;
  }

  const match = state.workspaces.find((w) => w.id === ws);
  state = {
    ...state,
    status: "starting",
    workspaceId: ws,
    workspaceName: match?.name ?? state.workspaceName,
    tabId,
    sequence: 0,
    events: [],
    uploadQueue: [],
    lastError: null,
    documentId: null,
    captureSessionId: null,
    waitingNav: false,
    openingTab: false,
    openingMessage: null,
  };
  pendingNav = null;
  await chrome.storage.session.set({ selectedWorkspaceId: ws });
  await chrome.storage.local.set({ zuvigo_active_workspace_id: ws });
  await persistState();
  broadcast();

  try {
    const tab = await chrome.tabs.get(tabId);
    const rawUrl = tab.url ?? "";
    const sourceUrl =
      rawUrl.startsWith("http://") || rawUrl.startsWith("https://") ? rawUrl : undefined;

    const capture = await api("/api/v1/captures", {
      method: "POST",
      body: JSON.stringify({
        workspaceId: ws,
        clientType: "BROWSER_EXTENSION",
        browser: "chrome",
        ...(sourceUrl ? { sourceUrl } : {}),
      }),
    });

    state.captureSessionId = capture.id;
    state.status = "capturing";
    await clearBuffered();
    await persistState();
    broadcast();

    await chrome.tabs.sendMessage(tabId, { type: "START_CAPTURE" }).catch(async () => {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"],
      });
      await chrome.tabs.sendMessage(tabId, { type: "START_CAPTURE" });
    });
  } catch (err) {
    state.status = "failed";
    state.lastError = (err as Error).message;
    await persistState();
    broadcast();
  }
}

async function stopCapture() {
  if (!state.captureSessionId) return;
  state.status = "uploading";
  state.waitingNav = false;
  pendingNav = null;
  await persistState();
  broadcast();

  try {
    // Let an in-flight post-nav screenshot finish before we close the session
    for (let i = 0; i < 20 && afterShotInFlight; i++) {
      await new Promise((r) => setTimeout(r, 100));
    }

    while (state.uploadQueue.length) {
      await flushEvents();
    }
    const buffered = await readBuffered();
    if (buffered.length) {
      state.uploadQueue.push(...buffered);
      await flushEvents();
      await clearBuffered();
    }

    // Brief grace for late content events already in the SW message queue
    await new Promise((r) => setTimeout(r, 250));
    while (state.uploadQueue.length) {
      await flushEvents();
    }

    await api(`/api/v1/captures/${state.captureSessionId}/complete`, {
      method: "POST",
    });
    state.status = "processing";
    state.uploadQueue = [];
    await persistState();
    broadcast();

    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const status = await api(`/api/v1/captures/${state.captureSessionId}`);
      if (status.documentId) {
        state.documentId = status.documentId;
        state.status =
          status.status === "FAILED"
            ? "failed"
            : status.status === "COMPLETED"
              ? "completed"
              : "processing";
        await persistState();
        broadcast();
        await chrome.tabs.create({
          url: `${state.apiBase}/scribes/${status.documentId}`,
        });
        if (status.status === "COMPLETED" || status.status === "FAILED") {
          state.status = status.status === "FAILED" ? "failed" : "completed";
          await persistState();
          broadcast();
        } else {
          state.status = "completed";
          await persistState();
          broadcast();
        }
        return;
      }
      broadcast();
    }
    state.status = "failed";
    state.lastError =
      "Guide is still processing. Make sure the worker is running: pnpm --filter @zuvigo/worker dev";
  } catch (err) {
    state.status = "failed";
    state.lastError = (err as Error).message;
  }
  await persistState();
  broadcast();
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (state.tabId !== tabId || state.status !== "capturing") return;
  if (changeInfo.status === "loading" && pendingNav) {
    state.waitingNav = true;
    broadcast();
  }
  if (changeInfo.status === "complete" && pendingNav) {
    void captureAfterNavigation();
  }
});

chrome.runtime.onMessage.addListener((message: ExtMessage, _sender, sendResponse) => {
  (async () => {
    await loadState();
    switch (message.type) {
      case "GET_STATE":
        sendResponse({ type: "STATE", state });
        break;
      case "BOOTSTRAP":
        await bootstrap(message.apiBase);
        sendResponse({ type: "STATE", state });
        break;
      case "CONNECT_EXTENSION":
        await connectExtension(message.apiBase);
        sendResponse({ type: "STATE", state });
        break;
      case "SET_TOKEN":
        await setExtensionToken(message.token, message.apiBase);
        sendResponse({ type: "STATE", state });
        break;
      case "START_CAPTURE":
        await startCapture(message.tabId, message.workspaceId, message.apiBase);
        sendResponse({ type: "STATE", state });
        break;
      case "BEGIN_CAPTURE_ON_TAB":
        await beginCaptureOnTab({
          tabId: message.tabId,
          workspaceId: message.workspaceId,
          apiBase: message.apiBase,
          createNewTab: message.createNewTab,
        });
        sendResponse({ type: "STATE", state });
        break;
      case "PAUSE_CAPTURE":
        if (state.status !== "capturing") {
          sendResponse({ type: "STATE", state });
          break;
        }
        state.status = "paused";
        state.waitingNav = false;
        if (state.captureSessionId) {
          await api(`/api/v1/captures/${state.captureSessionId}`, {
            method: "PATCH",
            body: JSON.stringify({ status: "PAUSED" }),
          }).catch(() => {});
        }
        if (state.tabId) {
          await chrome.tabs.sendMessage(state.tabId, { type: "PAUSE_CAPTURE" }).catch(() => {});
        }
        await persistState();
        broadcast();
        sendResponse({ type: "STATE", state });
        break;
      case "RESUME_CAPTURE":
        if (state.status !== "paused") {
          sendResponse({ type: "STATE", state });
          break;
        }
        state.status = "capturing";
        if (state.captureSessionId) {
          await api(`/api/v1/captures/${state.captureSessionId}`, {
            method: "PATCH",
            body: JSON.stringify({ status: "CAPTURING" }),
          }).catch(() => {});
        }
        if (state.tabId) {
          await chrome.tabs.sendMessage(state.tabId, { type: "RESUME_CAPTURE" }).catch(() => {});
        }
        await persistState();
        broadcast();
        sendResponse({ type: "STATE", state });
        break;
      case "STOP_CAPTURE":
        if (state.tabId) {
          await chrome.tabs.sendMessage(state.tabId, { type: "STOP_CAPTURE" }).catch(() => {});
        }
        await stopCapture();
        sendResponse({ type: "STATE", state });
        break;
      case "UNDO_LAST": {
        const removed = state.events.pop();
        if (removed) {
          const idx = state.uploadQueue.findIndex((e) => e.clientEventId === removed.clientEventId);
          if (idx >= 0) state.uploadQueue.splice(idx, 1);
        }
        await persistState();
        broadcast();
        sendResponse({ type: "STATE", state });
        break;
      }
      case "SET_WAITING":
        state.waitingNav = Boolean(message.waiting);
        await persistState();
        broadcast();
        sendResponse({ ok: true });
        break;
      case "NAV_PENDING":
        pendingNav = {
          parentClientEventId: message.parentClientEventId,
          fromUrl: message.fromUrl,
          startedAt: Date.now(),
        };
        state.waitingNav = true;
        await persistState();
        broadcast();
        sendResponse({ ok: true });
        break;
      case "CONTENT_EVENT": {
        if (state.status !== "capturing") break;
        await enqueueEvent(message.event, Boolean(message.needsScreenshot));
        // Destination after-shot from SPA path clears waiting
        if (message.event.metadata?.phase === "after") {
          state.waitingNav = false;
          pendingNav = null;
          await persistState();
          broadcast();
        }
        sendResponse({ ok: true });
        break;
      }
      default:
        sendResponse({ ok: true });
    }
  })().catch((err) => {
    state.lastError = (err as Error).message;
    broadcast();
    sendResponse({ type: "STATE", state });
  });
  return true;
});

loadState();
