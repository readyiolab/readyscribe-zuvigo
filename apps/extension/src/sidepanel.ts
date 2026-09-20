import {
  CAPTURE_OPTIONS_CSS,
  mountCaptureOptions,
} from "./capture-options";
import {
  eventLabel,
  type CaptureState,
  type ExtMessage,
  type RecordingSource,
  type RecordingMode,
} from "./shared";
import { screenRecorder } from "./screen-recorder";

const style = document.createElement("style");
style.textContent = CAPTURE_OPTIONS_CSS;
document.head.appendChild(style);

const statusPill = document.getElementById("statusPill")!;
const authLine = document.getElementById("authLine")!;
const screenRecPill = document.getElementById("screenRecPill") as HTMLElement;
const screenRecSource = document.getElementById("screenRecSource") as HTMLElement;
const screenRecTimer = document.getElementById("screenRecTimer") as HTMLElement;

const authCard = document.getElementById("authCard")!;
const controlsCard = document.getElementById("controlsCard")!;
const captureOptionsCard = document.getElementById("captureOptionsCard")!;
const captureOptionsRoot = document.getElementById("captureOptionsRoot")!;
const openingBanner = document.getElementById("openingBanner")!;
const feedCard = document.getElementById("feedCard")!;
const idleHint = document.getElementById("idleHint")!;
const advancedBlock = document.getElementById("advancedBlock")!;
const workspaceEl = document.getElementById("workspace") as HTMLSelectElement;
const apiBaseEl = document.getElementById("apiBase") as HTMLInputElement;
const tokenPasteEl = document.getElementById("tokenPaste") as HTMLInputElement;
const errorEl = document.getElementById("error")!;
const feedEl = document.getElementById("feed")!;
const emptyEl = document.getElementById("empty");
const stepCountEl = document.getElementById("stepCount");
const processingEl = document.getElementById("processing")!;

const btnNewCapture = document.getElementById("newCapture") as HTMLButtonElement;
const btnPause = document.getElementById("pause") as HTMLButtonElement | null;
const btnResume = document.getElementById("resume") as HTMLButtonElement | null;
const btnUndo = document.getElementById("undo") as HTMLButtonElement | null;
const btnStop = document.getElementById("stop") as HTMLButtonElement | null;
const btnCancelOptions = document.getElementById("cancelOptions") as HTMLButtonElement | null;
const btnSignIn = document.getElementById("signIn") as HTMLButtonElement;
const btnRefresh = document.getElementById("refreshAuth") as HTMLButtonElement;
const btnConnect = document.getElementById("connect") as HTMLButtonElement;
const btnSaveToken = document.getElementById("saveToken") as HTMLButtonElement;

// Image 3 & Image 4 elements
const capturingIdle = document.getElementById("capturingIdle")!;
const fixedBottomBar = document.getElementById("fixedBottomBar")!;
const footerPauseBtn = document.getElementById("footerPauseBtn") as HTMLButtonElement;
const footerUndoBtn = document.getElementById("footerUndoBtn") as HTMLButtonElement;
const footerCompleteBtn = document.getElementById("footerCompleteBtn") as HTMLButtonElement;
const footerMicBtn = document.getElementById("footerMicBtn") as HTMLButtonElement | null;
const micBadge = document.getElementById("micBadge") as HTMLElement | null;
const closePanelBtn = document.getElementById("closePanelBtn") as HTMLButtonElement | null;
const btnLaunchDesktopRec = document.getElementById("btnLaunchDesktopRec") as HTMLButtonElement | null;

// Video Preview Elements
const videoPreviewCard = document.getElementById("videoPreviewCard") as HTMLElement;
const recordedVideoPlayer = document.getElementById("recordedVideoPlayer") as HTMLVideoElement;
const btnDownloadVideo = document.getElementById("btnDownloadVideo") as HTMLButtonElement;

let lastEventCount = 0;
let optionsDispose: (() => void) | null = null;
let optionsOpen = false;
let recordedVideoUrl: string | null = null;
let isScreenRecording = false;

function formatSeconds(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function updateMicUI(active: boolean) {
  if (!footerMicBtn || !micBadge) return;
  if (active) {
    footerMicBtn.classList.add("active");
    micBadge.textContent = "Mic ON";
  } else {
    footerMicBtn.classList.remove("active");
    micBadge.textContent = "Mic OFF";
  }
}

function send(msg: ExtMessage, cb?: (res: ExtMessage) => void) {
  chrome.runtime.sendMessage(msg, (res) => {
    if (res?.type === "STATE") {
      render(res.state);
      cb?.(res);
    }
  });
}

function statusLabel(state: CaptureState): { text: string; cls: string } {
  if (state.openingTab) {
    return { text: state.openingMessage || "Opening…", cls: "pill warn" };
  }
  switch (state.status) {
    case "connecting":
      return { text: "Connecting…", cls: "pill warn" };
    case "capturing":
      return { text: "Recording", cls: "pill rec" };
    case "paused":
      return { text: "Paused", cls: "pill paused" };
    case "starting":
      return { text: "Starting…", cls: "pill warn" };
    case "uploading":
      return { text: "Uploading…", cls: "pill processing" };
    case "processing":
      return { text: "Processing…", cls: "pill processing" };
    case "completed":
      return { text: "Guide Created", cls: "pill ok" };
    case "failed":
      return { text: "Failed", cls: "pill rec" };
    default:
      return {
        text: state.signedIn ? "Ready" : "Not connected",
        cls: state.signedIn ? "pill ok" : "pill",
      };
  }
}

function closeOptions() {
  optionsDispose?.();
  optionsDispose = null;
  optionsOpen = false;
  captureOptionsCard.hidden = true;
  controlsCard.hidden = false;
  feedCard.hidden = false;
  if (btnCancelOptions) btnCancelOptions.hidden = true;
  btnNewCapture.hidden = false;
  idleHint.hidden = false;
  advancedBlock.hidden = false;
}

function openOptions(initialSource: RecordingSource = "screen") {
  if (!workspaceEl.value.trim()) {
    errorEl.textContent = "Select a workspace first.";
    errorEl.hidden = false;
    return;
  }
  errorEl.textContent = "";
  errorEl.hidden = true;
  chrome.storage.session.set({ selectedWorkspaceId: workspaceEl.value });
  chrome.storage.local.set({ zuvigo_active_workspace_id: workspaceEl.value });
  optionsDispose?.();
  optionsOpen = true;
  captureOptionsCard.hidden = false;
  feedCard.hidden = true;
  capturingIdle.hidden = true;
  idleHint.hidden = true;
  advancedBlock.hidden = true;
  controlsCard.hidden = true;
  if (btnCancelOptions) btnCancelOptions.hidden = false;

  optionsDispose = mountCaptureOptions({
    root: captureOptionsRoot,
    showClose: true,
    initialSource,
    getApiBase: () => apiBase(),
    getWorkspaceId: () => workspaceEl.value.trim() || null,
    onClose: () => closeOptions(),
    onStarted: () => {
      closeOptions();
    },
    onStartDesktopRecording: async ({ source, mode, includeMic, includeSystemAudio }) => {
      await startScreenRecordingFlow(source, mode, includeMic, includeSystemAudio);
      closeOptions();
    },
  });
}

async function startScreenRecordingFlow(
  source: RecordingSource,
  mode: RecordingMode,
  includeMic: boolean,
  includeSystemAudio: boolean,
) {
  try {
    screenRecSource.textContent =
      source === "screen" ? "Desktop" : source === "window" ? "Window" : "Tab";
    screenRecTimer.textContent = "00:00";
    screenRecPill.hidden = false;
    isScreenRecording = true;

    await screenRecorder.start({
      source,
      includeMic,
      includeSystemAudio,
      onSurfaceSelected: (surface) => {
        if (source === "screen") {
          if (surface === "monitor") {
            screenRecSource.textContent = "Entire Screen";
            errorEl.hidden = true;
          } else if (surface === "browser") {
            screenRecSource.textContent = "Chrome Tab";
            errorEl.textContent =
              "Notice: You shared a 'Chrome Tab' instead of 'Entire Screen' in Chrome's sharing popup. Desktop apps outside the browser will not be recorded in this video. To record all desktop apps, click Stop, then select the 'Entire Screen' tab in Chrome's popup next time.";
            errorEl.hidden = false;
          } else if (surface === "window") {
            screenRecSource.textContent = "Window";
          }
        } else {
          screenRecSource.textContent =
            surface === "monitor"
              ? "Entire Screen"
              : surface === "window"
                ? "Window"
                : "Browser Tab";
        }
      },
      onTick: (sec) => {
        screenRecTimer.textContent = formatSeconds(sec);
      },
      onEnded: () => {
        void stopAllRecording();
      },
      onStateChange: (status) => {
        if (status === "paused") {
          screenRecPill.style.opacity = "0.5";
        } else {
          screenRecPill.style.opacity = "1";
        }
      },
    });

    updateMicUI(includeMic);

    // Also begin capture session in background worker for unified multi-tab guide recording
    let activeTabId = 0;
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (activeTab?.id && activeTab.url && /^https?:\/\//i.test(activeTab.url)) {
        activeTabId = activeTab.id;
      }
    } catch {
      // ignore
    }

    send({
      type: "BEGIN_CAPTURE_ON_TAB",
      tabId: activeTabId,
      workspaceId: workspaceEl.value.trim(),
      apiBase: apiBase(),
      captureSource: source,
      recordingMode: mode,
      includeMic,
      includeSystemAudio,
    });
  } catch (err) {
    isScreenRecording = false;
    screenRecPill.hidden = true;
    const msg = (err as Error).message || "Could not start desktop recording";
    if (msg.includes("Permission") || msg.includes("denied")) {
      errorEl.textContent = "Screen capture was cancelled.";
    } else {
      errorEl.textContent = msg;
    }
    errorEl.hidden = false;
  }
}

async function stopAllRecording() {
  if (isScreenRecording || screenRecorder.isRecording()) {
    isScreenRecording = false;
    screenRecPill.hidden = true;
    try {
      const res = await screenRecorder.stop();
      if (res && res.url) {
        recordedVideoUrl = res.url;
        recordedVideoPlayer.src = res.url;
        videoPreviewCard.hidden = false;
        chrome.runtime.sendMessage({
          type: "SCREEN_RECORDING_READY",
          videoBlobUrl: res.url,
        }).catch(() => {});
      }
    } catch (err) {
      console.warn("Error stopping screen recorder:", err);
    }
  }
  send({ type: "STOP_CAPTURE" });
}

function formatInstruction(e: any): string {
  if (e.type === "TAB_CHANGE") {
    const title = e.metadata?.title || "tab";
    return `Switch to <strong>${escapeHtml(String(title))}</strong> tab`;
  }
  if (e.type === "NAVIGATION" || e.type === "PAGE_LOAD") {
    if (e.metadata?.phase === "after") return "Page loaded";
    if (e.url) return `Navigate to ${escapeHtml(e.url)}`;
    return "Navigate to page";
  }
  if (e.metadata?.resultText && typeof e.metadata.resultText === "string") {
    return escapeHtml(e.metadata.resultText);
  }
  if (e.type === "CLICK") {
    const raw =
      e.element?.text ||
      e.element?.ariaLabel ||
      e.element?.alt ||
      e.element?.title ||
      e.element?.name ||
      e.element?.role ||
      "this field";
    return `Click ${escapeHtml(String(raw).trim())}.`;
  }
  if (e.type === "INPUT" || e.type === "CHANGE") {
    const val = typeof e.metadata?.text === "string" ? e.metadata.text : "";
    const key = typeof e.metadata?.key === "string" ? e.metadata.key : "";
    if (val) {
      return `Type "${escapeHtml(val)}" ${key ? `<span class="step-kbd">${escapeHtml(key)}</span>` : ""}`;
    }
    return `Fill ${escapeHtml(String(e.element?.name || e.element?.tag || "input"))}.`;
  }
  return escapeHtml(eventLabel(e));
}

function render(state: CaptureState) {
  const st = statusLabel(state);
  statusPill.className = st.cls;
  statusPill.innerHTML =
    state.openingTab
      ? `<span class="dot"></span> ${escapeHtml(state.openingMessage || "Opening…")}`
      : state.status === "capturing" && state.waitingNav
        ? `<span class="dot"></span> Loading…`
        : state.status === "capturing"
          ? `<span class="dot"></span> Recording`
          : st.text;

  if (state.status === "capturing" && screenRecorder.isRecording()) {
    screenRecPill.hidden = false;
    const actualSurface = screenRecorder.getActualSurface();
    screenRecSource.textContent =
      actualSurface === "monitor"
        ? "Entire Screen"
        : actualSurface === "window"
          ? "Window"
          : actualSurface === "browser"
            ? (state.captureSource === "screen" ? "Chrome Tab" : "Browser Tab")
            : (state.captureSource === "screen" ? "Entire Screen" : "Window");
  } else if (state.status !== "capturing") {
    screenRecPill.hidden = true;
  }

  if (state.videoBlobUrl && !recordedVideoUrl) {
    recordedVideoUrl = state.videoBlobUrl;
    recordedVideoPlayer.src = state.videoBlobUrl;
    videoPreviewCard.hidden = false;
  }

  if (state.openingTab && state.openingMessage) {
    if (openingBanner) {
      openingBanner.hidden = false;
      openingBanner.textContent = state.openingMessage;
    }
    if (!optionsOpen) {
      captureOptionsCard.hidden = false;
    }
  } else if (state.status === "capturing" && optionsOpen) {
    closeOptions();
  } else if (!optionsOpen && openingBanner) {
    openingBanner.hidden = true;
  }

  if (state.signedIn) {
    authLine.innerHTML = `Signed in as <strong>${escapeHtml(state.userEmail ?? "user")}</strong>`;
    authCard.hidden = true;
  } else {
    authLine.textContent =
      state.status === "connecting"
        ? "Connecting — finish sign-in in the web tab"
        : "Not connected — click Connect extension";
    authCard.hidden = false;
  }

  if (state.apiBase) apiBaseEl.value = state.apiBase;

  const current = workspaceEl.value;
  workspaceEl.innerHTML = "";
  if (state.workspaces.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = state.signedIn ? "No workspace" : "Connect to load workspaces";
    workspaceEl.appendChild(opt);
  } else {
    for (const w of state.workspaces) {
      const opt = document.createElement("option");
      opt.value = w.id;
      opt.textContent = `${w.name} (${w.role})`;
      workspaceEl.appendChild(opt);
    }
    workspaceEl.value = state.workspaceId || current || state.workspaces[0]!.id;
  }

  const capturing = state.status === "capturing";
  const paused = state.status === "paused";
  const live = capturing || paused;
  const busy =
    state.openingTab ||
    state.status === "connecting" ||
    state.status === "starting" ||
    state.status === "uploading" ||
    state.status === "processing";

  btnConnect.disabled = busy;
  btnNewCapture.disabled = !state.signedIn || !workspaceEl.value || busy || live || optionsOpen;
  workspaceEl.disabled = live || busy || optionsOpen;

  const processing = state.status === "processing" || state.status === "uploading";

  authCard.hidden = state.signedIn;
  controlsCard.hidden = true;
  capturingIdle.hidden = true;
  feedCard.hidden = true;
  fixedBottomBar.hidden = true;
  processingEl.hidden = true;
  if (!optionsOpen && !state.openingTab) {
    captureOptionsCard.hidden = true;
  }

  if (optionsOpen || state.openingTab) {
    captureOptionsCard.hidden = false;
    controlsCard.hidden = true;
    capturingIdle.hidden = true;
    feedCard.hidden = true;
    fixedBottomBar.hidden = true;
    processingEl.hidden = true;
    idleHint.hidden = true;
    advancedBlock.hidden = true;
  } else if (processing) {
    processingEl.hidden = false;
  } else if (live) {
    fixedBottomBar.hidden = false;
    if (state.events.length === 0 && !recordedVideoUrl) {
      capturingIdle.hidden = false;
    } else {
      feedCard.hidden = false;
    }
    footerPauseBtn.title = paused ? "Resume capture" : "Pause capture";
    footerPauseBtn.innerHTML = paused
      ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`
      : `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
    footerUndoBtn.disabled = state.events.length === 0;
  } else {
    // Idle / Ready / Completed
    controlsCard.hidden = false;
    idleHint.hidden = !state.signedIn;
    advancedBlock.hidden = false;
    if (recordedVideoUrl || state.events.length > 0) {
      feedCard.hidden = false;
    }
  }

  if (state.lastError) {
    errorEl.textContent = state.lastError;
    errorEl.hidden = false;
  } else {
    errorEl.textContent = "";
    errorEl.hidden = true;
  }

  if (stepCountEl) stepCountEl.textContent = String(state.events.length);
  if (emptyEl) emptyEl.hidden = state.events.length > 0 || processing || Boolean(recordedVideoUrl);

  const loadingRow =
    state.waitingNav
      ? `<li class="step-card" style="opacity: 0.7;">
        <div class="step-card-header">
          <div class="step-number-bubble">…</div>
          <div class="step-instruction">Waiting for page to load…</div>
        </div>
      </li>`
      : "";

  feedEl.innerHTML =
    state.events
      .map((e, i) => {
        const instruction = formatInstruction(e);
        let screenshotBox = "";

        if (e.screenshotDataUrl && e.screenshotDataUrl !== "[inline]") {
          let circleHtml = "";
          const hl = (e.element?.highlight || {}) as { x?: number; y?: number; w?: number; h?: number };
          if (typeof hl.x === "number" && typeof hl.y === "number") {
            const cx = Math.max(5, Math.min(95, Math.round((hl.x + (hl.w || 0) / 2) * 100)));
            const cy = Math.max(5, Math.min(95, Math.round((hl.y + (hl.h || 0) / 2) * 100)));
            circleHtml = `<div class="click-target-circle" style="left: ${cx}%; top: ${cy}%;"></div>`;
          }

          screenshotBox = `
            <div class="step-screenshot-box">
              <img class="step-screenshot-img" src="${e.screenshotDataUrl}" alt="Step ${i + 1}" />
              ${circleHtml}
            </div>
          `;
        }

        return `
          <li class="step-card">
            <div class="step-card-header">
              <div class="step-number-bubble">${i + 1}</div>
              <div class="step-instruction">${instruction}</div>
              <button class="step-delete-btn" title="Delete step" data-undo-step="${i}" type="button">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
              </button>
            </div>
            ${screenshotBox}
          </li>
        `;
      })
      .join("") + loadingRow;

  const deleteBtns = feedEl.querySelectorAll<HTMLButtonElement>("[data-undo-step]");
  deleteBtns.forEach((btn) => {
    btn.onclick = (ev) => {
      ev.stopPropagation();
      send({ type: "UNDO_LAST" });
    };
  });

  if (state.events.length > lastEventCount) {
    feedEl.scrollTop = feedEl.scrollHeight;
  }
  lastEventCount = state.events.length;
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function apiBase() {
  return apiBaseEl.value.trim() || "https://readyscribe.zuvigo.com";
}

btnNewCapture.onclick = () => openOptions();
if (btnCancelOptions) btnCancelOptions.onclick = () => closeOptions();

if (btnLaunchDesktopRec) {
  btnLaunchDesktopRec.onclick = () => openOptions("screen");
}

if (btnDownloadVideo) {
  btnDownloadVideo.onclick = () => {
    if (!recordedVideoUrl) return;
    const a = document.createElement("a");
    a.href = recordedVideoUrl;
    a.download = `readyscribe-recording-${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
}

// Fixed bottom toolbar handlers
footerPauseBtn.onclick = () => {
  chrome.runtime.sendMessage({ type: "GET_STATE" }, (res) => {
    if (res?.state?.status === "paused") {
      if (screenRecorder.isRecording()) screenRecorder.resume();
      send({ type: "RESUME_CAPTURE" });
    } else {
      if (screenRecorder.isRecording()) screenRecorder.pause();
      send({ type: "PAUSE_CAPTURE" });
    }
  });
};

if (footerMicBtn) {
  footerMicBtn.onclick = () => {
    const active = screenRecorder.toggleMic();
    updateMicUI(active);
    chrome.runtime.sendMessage({ type: "SET_MIC_ENABLED", enabled: active });
  };
}

footerUndoBtn.onclick = () => send({ type: "UNDO_LAST" });
footerCompleteBtn.onclick = () => void stopAllRecording();

if (closePanelBtn) {
  closePanelBtn.onclick = () => {
    window.close();
  };
}

if (btnPause) btnPause.onclick = () => send({ type: "PAUSE_CAPTURE" });
if (btnResume) btnResume.onclick = () => send({ type: "RESUME_CAPTURE" });
if (btnUndo) btnUndo.onclick = () => send({ type: "UNDO_LAST" });
if (btnStop) btnStop.onclick = () => void stopAllRecording();

btnSignIn.onclick = () => {
  chrome.tabs.create({ url: `${apiBase()}/login` });
};

btnConnect.onclick = () => {
  errorEl.textContent = "Waiting for web connect tab…";
  errorEl.hidden = false;
  send({ type: "CONNECT_EXTENSION", apiBase: apiBase() });
};

btnRefresh.onclick = () => {
  send({ type: "BOOTSTRAP", apiBase: apiBase() });
};

btnSaveToken.onclick = () => {
  const token = tokenPasteEl.value.trim();
  if (!token) {
    errorEl.textContent = "Paste a token from Dashboard → Settings first.";
    errorEl.hidden = false;
    return;
  }
  errorEl.textContent = "Saving token…";
  errorEl.hidden = false;
  send({ type: "SET_TOKEN", token, apiBase: apiBase() }, () => {
    tokenPasteEl.value = "";
  });
};

workspaceEl.onchange = () => {
  chrome.storage.session.set({ selectedWorkspaceId: workspaceEl.value });
  chrome.storage.local.set({ zuvigo_active_workspace_id: workspaceEl.value });
};

chrome.runtime.onMessage.addListener((msg: ExtMessage) => {
  if (msg.type === "STATE") render(msg.state);
});

send({ type: "GET_STATE" }, () => {
  send({ type: "BOOTSTRAP", apiBase: apiBase() });
});
