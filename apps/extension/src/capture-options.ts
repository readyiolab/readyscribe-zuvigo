import type { ExtMessage, RecordingSource, RecordingMode } from "./shared";
import { screenRecorder } from "./screen-recorder";

export type TabRow = {
  id: number;
  title: string;
  url: string;
  favIconUrl?: string;
};

export function truncateLabel(s: string, max = 52) {
  const t = s.trim() || "Untitled";
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export async function listRecordableTabs(): Promise<TabRow[]> {
  const tabs = await chrome.tabs.query({});
  return tabs
    .filter((t) => t.id != null && typeof t.url === "string" && /^https?:\/\//i.test(t.url))
    .map((t) => ({
      id: t.id!,
      title: t.title?.trim() || "Untitled",
      url: t.url!,
      favIconUrl: t.favIconUrl,
    }));
}

export function filterTabs(tabs: TabRow[], query: string): TabRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return tabs;
  return tabs.filter(
    (t) => t.title.toLowerCase().includes(q) || t.url.toLowerCase().includes(q),
  );
}

export function sendExtMessage<T = ExtMessage>(msg: ExtMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (res) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve(res as T);
    });
  });
}

export type CaptureOptionsMount = {
  root: HTMLElement;
  getApiBase: () => string;
  getWorkspaceId: () => string | null;
  initialSource?: RecordingSource;
  /** Called after capture successfully starts (e.g. close popup). */
  onStarted?: () => void;
  /** Called when user closes the panel (side panel back). */
  onClose?: () => void;
  showClose?: boolean;
  onStartDesktopRecording?: (opts: {
    source: RecordingSource;
    mode: RecordingMode;
    includeMic: boolean;
    includeSystemAudio: boolean;
  }) => Promise<void>;
};

/**
 * Mount Scribe-style Capture Options into `root`.
 * Returns a dispose function.
 */
export function mountCaptureOptions(opts: CaptureOptionsMount): () => void {
  const {
    root,
    getApiBase,
    getWorkspaceId,
    initialSource = "screen",
    onStarted,
    onClose,
    showClose = true,
    onStartDesktopRecording,
  } = opts;

  let allTabs: TabRow[] = [];
  let search = "";
  let busy = false;
  let currentSource: RecordingSource = initialSource;
  let currentMode: RecordingMode = "both";
  let includeMic = false;
  let includeSystemAudio = true;

  root.innerHTML = `
    <div class="co-panel">
      <div class="co-header">
        <div class="co-header-text">
          <h2 class="co-title">Capture Options</h2>
          <p class="co-desc">Select a recording source. Switching between tabs and applications will be captured continuously.</p>
        </div>
        ${showClose ? `<button type="button" class="co-close" aria-label="Close" data-co="close">✕</button>` : ""}
      </div>
      <div class="co-status" data-co="status" hidden></div>

      <!-- SOURCE SELECTION TABS -->
      <div class="co-source-tabs" role="tablist">
        <button type="button" class="co-source-tab" data-source="screen" title="Record entire desktop across all tabs & apps">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>
          <span>Entire Screen</span>
        </button>
        <button type="button" class="co-source-tab" data-source="window" title="Record a specific application window">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
          <span>Window</span>
        </button>
        <button type="button" class="co-source-tab active" data-source="tab" title="Record browser tabs with step-by-step clicks">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="M10 4v4"/><path d="M2 8h20"/></svg>
          <span>Browser Tab</span>
        </button>
      </div>

      <!-- SOURCE DESCRIPTION BOX -->
      <div class="co-source-info" data-co="source-info">
        <div class="co-source-desc-icon">ℹ️</div>
        <div class="co-source-desc-text" data-co="source-desc">
          Capture browser workflows step-by-step. Clicks and screenshots continue automatically when switching between tabs.
        </div>
      </div>

      <!-- AUDIO & MODE OPTIONS -->
      <div class="co-options-card">
        <div class="co-option-row">
          <label class="co-checkbox-label">
            <input type="checkbox" data-co="opt-mic" ${includeMic ? "checked" : ""} />
            <span>Microphone Narration</span>
          </label>
          <span class="co-badge-tag">Audio</span>
        </div>
        <div class="co-option-row">
          <label class="co-checkbox-label">
            <input type="checkbox" data-co="opt-system-audio" ${includeSystemAudio ? "checked" : ""} />
            <span>System / Tab Audio</span>
          </label>
          <span class="co-badge-tag">Sync</span>
        </div>
      </div>

      <!-- SCREEN / WINDOW ACTION VIEW -->
      <div class="co-desktop-view" data-co="desktop-view" hidden>
        <div class="co-desktop-card">
          <div class="co-desktop-card-title" data-co="desktop-title">Record Entire Screen</div>
          <p class="co-desktop-card-desc" data-co="desktop-card-desc">
            Captures your entire desktop screen. Switching between browser tabs, application windows, or desktop software will remain continuously visible in the recording.
          </p>

          <div class="co-share-guide" data-co="share-guide">
            <div class="co-share-guide-badge" data-co="guide-badge">HOW TO RECORD FULL DESKTOP</div>
            <div class="co-share-guide-title" data-co="guide-title">When Chrome's sharing popup appears:</div>
            <ol class="co-share-guide-list" data-co="guide-list">
              <li>Click the <strong>Entire Screen</strong> tab at the top (not "Chrome Tab")</li>
              <li>Click your <strong>Screen thumbnail</strong> to select it</li>
              <li>Click the blue <strong>Share</strong> button</li>
            </ol>
          </div>

          <button type="button" class="co-btn-primary" data-co="start-desktop">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4" fill="currentColor"/></svg>
            <span data-co="start-desktop-text">Start Desktop Recording</span>
          </button>

          <div class="co-desktop-note">
            💡 Full screen video captures all desktop apps, windows, and tabs. Step-by-step clicks are captured across your browser tabs.
          </div>
        </div>
      </div>

      <!-- BROWSER TAB VIEW -->
      <div class="co-tab-view" data-co="tab-view">
        <button type="button" class="co-newtab" data-co="newtab">
          <span class="co-plus">+</span>
          <span>New Tab</span>
        </button>

        <div class="co-section-label">OPEN TABS</div>

        <div class="co-search-wrap">
          <span class="co-search-icon" aria-hidden="true">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.3-4.3"/>
            </svg>
          </span>
          <input type="search" class="co-search" placeholder="Search tabs" data-co="search" autocomplete="off" />
        </div>

        <ul class="co-list" data-co="list"></ul>
        <p class="co-empty" data-co="empty" hidden>No matching tabs</p>
      </div>

      <p class="co-gate" data-co="gate" hidden></p>
    </div>
  `;

  const listEl = root.querySelector('[data-co="list"]') as HTMLUListElement;
  const emptyEl = root.querySelector('[data-co="empty"]') as HTMLElement;
  const statusEl = root.querySelector('[data-co="status"]') as HTMLElement;
  const gateEl = root.querySelector('[data-co="gate"]') as HTMLElement;
  const searchEl = root.querySelector('[data-co="search"]') as HTMLInputElement;
  const newTabBtn = root.querySelector('[data-co="newtab"]') as HTMLButtonElement;
  const closeBtn = root.querySelector('[data-co="close"]') as HTMLButtonElement | null;
  const tabView = root.querySelector('[data-co="tab-view"]') as HTMLElement;
  const desktopView = root.querySelector('[data-co="desktop-view"]') as HTMLElement;
  const desktopTitle = root.querySelector('[data-co="desktop-title"]') as HTMLElement;
  const desktopCardDesc = root.querySelector('[data-co="desktop-card-desc"]') as HTMLElement;
  const startDesktopBtn = root.querySelector('[data-co="start-desktop"]') as HTMLButtonElement;
  const startDesktopText = root.querySelector('[data-co="start-desktop-text"]') as HTMLElement;
  const sourceDesc = root.querySelector('[data-co="source-desc"]') as HTMLElement;
  const sourceTabs = root.querySelectorAll<HTMLButtonElement>(".co-source-tab");
  const optMic = root.querySelector('[data-co="opt-mic"]') as HTMLInputElement;
  const optSystemAudio = root.querySelector('[data-co="opt-system-audio"]') as HTMLInputElement;
  const guideBadge = root.querySelector('[data-co="guide-badge"]') as HTMLElement | null;
  const guideTitle = root.querySelector('[data-co="guide-title"]') as HTMLElement | null;
  const guideList = root.querySelector('[data-co="guide-list"]') as HTMLElement | null;

  function setStatus(msg: string) {
    if (!msg) {
      statusEl.hidden = true;
      statusEl.textContent = "";
      return;
    }
    statusEl.hidden = false;
    statusEl.textContent = msg;
  }

  function setBusy(next: boolean) {
    busy = next;
    newTabBtn.disabled = next;
    searchEl.disabled = next;
    startDesktopBtn.disabled = next;
    listEl.querySelectorAll("button").forEach((b) => {
      (b as HTMLButtonElement).disabled = next;
    });
  }

  function updateSourceUI(source: RecordingSource) {
    currentSource = source;
    sourceTabs.forEach((tab) => {
      const match = tab.getAttribute("data-source") === source;
      tab.classList.toggle("active", match);
    });

    if (source === "screen") {
      tabView.hidden = true;
      desktopView.hidden = false;
      desktopTitle.textContent = "Record Entire Screen";
      desktopCardDesc.textContent =
        "Captures your entire desktop screen. Switching between browser tabs, application windows, or desktop software will remain continuously visible in the recording.";
      startDesktopText.textContent = "Start Desktop Recording";
      sourceDesc.textContent =
        "Desktop screen recorder: records full display across all tabs, windows, and apps with continuous audio/video synchronization.";
      if (guideBadge) guideBadge.textContent = "HOW TO RECORD FULL DESKTOP";
      if (guideTitle) guideTitle.textContent = "When Chrome's sharing popup appears:";
      if (guideList) {
        guideList.innerHTML = `
          <li>Click the <strong>Entire Screen</strong> tab at the top (not "Chrome Tab")</li>
          <li>Click your <strong>Screen thumbnail</strong> to select it</li>
          <li>Click the blue <strong>Share</strong> button</li>
        `;
      }
    } else if (source === "window") {
      tabView.hidden = true;
      desktopView.hidden = false;
      desktopTitle.textContent = "Record Application Window";
      desktopCardDesc.textContent =
        "Captures a specific application window. Window interactions and switches inside the chosen window will be continuously recorded.";
      startDesktopText.textContent = "Start Window Recording";
      sourceDesc.textContent =
        "Application window recorder: keeps recording continuously within the selected application window.";
      if (guideBadge) guideBadge.textContent = "HOW TO RECORD APPLICATION WINDOW";
      if (guideTitle) guideTitle.textContent = "When Chrome's sharing popup appears:";
      if (guideList) {
        guideList.innerHTML = `
          <li>Click the <strong>Window</strong> tab at the top</li>
          <li>Click the <strong>Application window</strong> you want to record</li>
          <li>Click the blue <strong>Share</strong> button</li>
        `;
      }
    } else {
      tabView.hidden = false;
      desktopView.hidden = true;
      sourceDesc.textContent =
        "Capture browser workflows step-by-step. Clicks and screenshots continue automatically when switching between tabs.";
    }
  }

  optMic.addEventListener("change", () => {
    includeMic = optMic.checked;
  });

  optSystemAudio.addEventListener("change", () => {
    includeSystemAudio = optSystemAudio.checked;
  });

  sourceTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const src = (tab.getAttribute("data-source") || "tab") as RecordingSource;
      updateSourceUI(src);
    });
  });

  function renderList() {
    const filtered = filterTabs(allTabs, search);
    listEl.innerHTML = "";
    emptyEl.hidden = filtered.length > 0;
    if (filtered.length === 0) {
      emptyEl.textContent = search.trim()
        ? "No matching tabs"
        : "No open tabs found. Open a site in Chrome or click '+ New Tab'.";
    }
    for (const tab of filtered) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "co-tab";
      btn.disabled = busy;

      const mainWrap = document.createElement("div");
      mainWrap.className = "co-tab-main";

      if (tab.favIconUrl) {
        const img = document.createElement("img");
        img.className = "co-fav";
        img.alt = "";
        img.width = 18;
        img.height = 18;
        img.src = tab.favIconUrl;
        img.onerror = () => {
          img.replaceWith(
            Object.assign(document.createElement("span"), {
              className: "co-fav-fallback",
              textContent: "●",
            }),
          );
        };
        mainWrap.appendChild(img);
      } else {
        mainWrap.appendChild(
          Object.assign(document.createElement("span"), {
            className: "co-fav-fallback",
            textContent: "●",
          }),
        );
      }

      const textWrap = document.createElement("div");
      textWrap.className = "co-tab-text";

      const title = document.createElement("div");
      title.className = "co-tab-title";
      title.textContent = truncateLabel(tab.title, 42);
      title.title = `${tab.title}\n${tab.url}`;

      const domain = document.createElement("div");
      domain.className = "co-tab-domain";
      try {
        domain.textContent = new URL(tab.url).hostname.replace(/^www\./, "");
      } catch {
        domain.textContent = tab.url;
      }

      textWrap.appendChild(title);
      textWrap.appendChild(domain);
      mainWrap.appendChild(textWrap);
      btn.appendChild(mainWrap);

      btn.onclick = () => void beginOnTab(tab.id, false);
      li.appendChild(btn);
      listEl.appendChild(li);
    }
  }

  async function refreshTabs() {
    allTabs = await listRecordableTabs();
    renderList();
  }

  async function handleStartDesktop() {
    const workspaceId = getWorkspaceId();
    if (!workspaceId) {
      gateEl.hidden = false;
      gateEl.textContent = "Connect the extension and select a workspace in the side panel first.";
      return;
    }
    gateEl.hidden = true;
    setBusy(true);
    setStatus("Select screen or window to start…");

    try {
      if (onStartDesktopRecording) {
        await onStartDesktopRecording({
          source: currentSource,
          mode: currentMode,
          includeMic,
          includeSystemAudio,
        });
        setStatus("Screen recording active");
        onStarted?.();
        return;
      }

      // Fallback direct start
      await screenRecorder.start({
        source: currentSource,
        includeMic,
        includeSystemAudio,
        onEnded: () => {
          sendExtMessage({ type: "STOP_CAPTURE" }).catch(() => {});
        },
      });

      // Also start capture session in background worker for unified state
      let activeTabId = 0;
      try {
        const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (activeTab?.id && activeTab.url && /^https?:\/\//i.test(activeTab.url)) {
          activeTabId = activeTab.id;
        }
      } catch {
        // ignore query failure
      }

      await sendExtMessage<ExtMessage>({
        type: "BEGIN_CAPTURE_ON_TAB",
        tabId: activeTabId,
        workspaceId,
        apiBase: getApiBase(),
        captureSource: currentSource,
        recordingMode: "both",
        includeMic,
        includeSystemAudio,
      });

      setStatus("Screen recording started");
      onStarted?.();
    } catch (err) {
      const msg = (err as Error).message || "Could not start desktop recording";
      setStatus(msg.includes("Permission") || msg.includes("denied") ? "Recording cancelled" : msg);
      setBusy(false);
    }
  }

  async function beginOnTab(tabId: number | null, createNewTab: boolean) {
    const workspaceId = getWorkspaceId();
    if (!workspaceId) {
      gateEl.hidden = false;
      gateEl.textContent =
        "Connect the extension and select a workspace in the side panel first.";
      return;
    }
    gateEl.hidden = true;
    setBusy(true);
    setStatus(createNewTab ? "Opening new tab…" : "Opening tab…");

    try {
      const res = await sendExtMessage<ExtMessage>({
        type: "BEGIN_CAPTURE_ON_TAB",
        tabId: tabId ?? 0,
        workspaceId,
        apiBase: getApiBase(),
        createNewTab,
        captureSource: "tab",
        recordingMode: currentMode,
        includeMic,
        includeSystemAudio,
      });

      if (res?.type === "STATE") {
        if (res.state.status === "failed" || res.state.lastError) {
          setStatus(res.state.lastError || "Could not start capture");
          setBusy(false);
          return;
        }
        if (res.state.status === "capturing" || res.state.status === "starting") {
          setStatus("Capture started");
          onStarted?.();
          return;
        }
      }
      setStatus("Capture started");
      onStarted?.();
    } catch (err) {
      setStatus((err as Error).message || "Failed to start capture");
      setBusy(false);
    }
  }

  startDesktopBtn.addEventListener("click", () => {
    void handleStartDesktop();
  });

  searchEl.oninput = () => {
    search = searchEl.value;
    renderList();
  };

  newTabBtn.onclick = () => void beginOnTab(null, true);

  closeBtn?.addEventListener("click", () => {
    onClose?.();
  });

  updateSourceUI(initialSource);
  void refreshTabs();
  const interval = setInterval(() => {
    if (!busy && currentSource === "tab") void refreshTabs();
  }, 2000);

  return () => {
    clearInterval(interval);
    root.innerHTML = "";
  };
}

/** Shared CSS for Capture Options (inject once). */
export const CAPTURE_OPTIONS_CSS = `
.co-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  height: 100%;
}
.co-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-shrink: 0;
  min-height: 0;
  padding-bottom: 2px;
}
.co-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.25;
  color: #0f172a;
}
.co-desc {
  margin: 2px 0 0;
  font-size: 11.5px;
  line-height: 1.35;
  color: #64748b;
}
.co-close {
  border: 1px solid #e2e8f0;
  background: #ffffff;
  color: #64748b;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  flex-shrink: 0;
  transition: all 0.15s ease;
}
.co-close:hover { color: #0f172a; background: #f1f5f9; border-color: #cbd5e1; }
.co-status {
  font-size: 11.5px;
  font-weight: 550;
  color: #92400e;
  background: #fef3c7;
  border: 1px solid #fde68a;
  border-radius: 8px;
  padding: 8px 10px;
  flex-shrink: 0;
}

/* Source Selection Segmented Tabs */
.co-source-tabs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  background: #f1f5f9;
  padding: 3px;
  border-radius: 10px;
  flex-shrink: 0;
}
.co-source-tab {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 7px 4px;
  border: none;
  background: transparent;
  color: #64748b;
  font-size: 11.5px;
  font-weight: 600;
  border-radius: 7px;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}
.co-source-tab:hover:not(.active) {
  color: #0f172a;
}
.co-source-tab.active {
  background: #ffffff;
  color: #0f172a;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

/* Source Info Notice */
.co-source-info {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 11.5px;
  line-height: 1.4;
  color: #475569;
  flex-shrink: 0;
}
.co-source-desc-icon {
  font-size: 13px;
  flex-shrink: 0;
  margin-top: -1px;
}
.co-source-desc-text {
  flex: 1;
}

/* Audio & Options Card */
.co-options-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px 10px;
  flex-shrink: 0;
}
.co-option-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: #334155;
}
.co-checkbox-label {
  display: flex;
  align-items: center;
  gap: 7px;
  cursor: pointer;
  font-weight: 500;
  user-select: none;
}
.co-checkbox-label input[type="checkbox"] {
  width: 14px;
  height: 14px;
  accent-color: #6366f1;
  cursor: pointer;
}
.co-badge-tag {
  font-size: 10px;
  font-weight: 600;
  color: #6366f1;
  background: #eef2ff;
  padding: 1px 6px;
  border-radius: 4px;
}

/* Desktop Action View */
.co-desktop-view {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
}
.co-desktop-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.co-desktop-card-title {
  font-size: 13px;
  font-weight: 700;
  color: #0f172a;
}
.co-desktop-card-desc {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.45;
  color: #64748b;
}
.co-share-guide {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-left: 3px solid #6366f1;
  border-radius: 8px;
  padding: 9px 11px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.co-share-guide-badge {
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: #4f46e5;
  text-transform: uppercase;
}
.co-share-guide-title {
  font-size: 11.5px;
  font-weight: 600;
  color: #1e293b;
}
.co-share-guide-list {
  margin: 0;
  padding-left: 17px;
  font-size: 11.5px;
  line-height: 1.5;
  color: #334155;
}
.co-share-guide-list li {
  margin-bottom: 2px;
}
.co-share-guide-list strong {
  color: #0f172a;
}
.co-desktop-note {
  font-size: 11px;
  line-height: 1.4;
  color: #64748b;
  background: #f1f5f9;
  border-radius: 6px;
  padding: 6px 8px;
}
.co-btn-primary {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 40px;
  border: none;
  background: #0f172a;
  color: #ffffff;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}
.co-btn-primary:hover:not(:disabled) {
  background: #1e293b;
  transform: translateY(-1px);
}
.co-btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Tab View & List */
.co-tab-view {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1 1 auto;
  min-height: 0;
}
.co-newtab {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  width: 100%;
  height: 38px;
  border: 1px dashed #cbd5e1;
  background: #f8fafc;
  border-radius: 8px;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 600;
  color: #334155;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s ease;
}
.co-newtab:hover:not(:disabled) {
  background: #eef2ff;
  border-color: #818cf8;
  color: #4338ca;
}
.co-newtab:disabled { opacity: 0.5; cursor: default; }
.co-plus {
  width: 18px;
  height: 18px;
  border-radius: 5px;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
}
.co-section-label {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #64748b;
  flex-shrink: 0;
  margin: 2px 0 -4px;
}
.co-search-wrap {
  position: relative;
  flex-shrink: 0;
}
.co-search-icon {
  position: absolute;
  left: 11px;
  top: 50%;
  transform: translateY(-50%);
  color: #94a3b8;
  font-size: 13px;
  pointer-events: none;
}
.co-search {
  width: 100%;
  box-sizing: border-box;
  height: 36px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0 10px 0 32px;
  font-size: 12px;
  background: #f8fafc;
  color: #0f172a;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}
.co-search:focus {
  background: #ffffff;
  border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
}
.co-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
  flex: 1 1 auto;
  min-height: 0;
  padding-right: 2px;
}
.co-tab {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  min-height: 42px;
  text-align: left;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  border-radius: 8px;
  padding: 6px 10px;
  cursor: pointer;
  color: #0f172a;
  flex-shrink: 0;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
  transition: all 0.15s ease;
}
.co-tab:hover:not(:disabled) {
  background: #f8fafc;
  border-color: #cbd5e1;
  transform: translateY(-1px);
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.06);
}
.co-tab:disabled { opacity: 0.5; cursor: default; }
.co-tab-main {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  flex: 1;
}
.co-fav, .co-fav-fallback {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  border-radius: 4px;
}
.co-fav-fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: #94a3b8;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
}
.co-tab-text {
  min-width: 0;
  flex: 1;
}
.co-tab-title {
  font-size: 12px;
  font-weight: 600;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.3;
}
.co-tab-domain {
  font-size: 10.5px;
  color: #64748b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 1px;
}
.co-empty, .co-gate {
  margin: 0;
  font-size: 12px;
  color: #64748b;
  text-align: center;
  padding: 16px 10px;
  flex-shrink: 0;
}
.co-gate {
  color: #92400e;
  background: #fef3c7;
  border: 1px solid #fde68a;
  border-radius: 8px;
}
`;
