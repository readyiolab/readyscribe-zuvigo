import type { RecordingSource } from "./shared";

export interface ScreenRecorderOptions {
  source: RecordingSource;
  includeMic?: boolean;
  includeSystemAudio?: boolean;
  onStateChange?: (status: "idle" | "recording" | "paused" | "stopped") => void;
  onTick?: (elapsedSeconds: number) => void;
  onEnded?: () => void;
}

export interface ScreenRecordingResult {
  blob: Blob;
  url: string;
  durationSeconds: number;
}

export class ScreenRecorderService {
  private mediaRecorder: MediaRecorder | null = null;
  private displayStream: MediaStream | null = null;
  private micStream: MediaStream | null = null;
  private combinedStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private chunks: Blob[] = [];
  private startTime = 0;
  private pausedDuration = 0;
  private pauseStartedAt = 0;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private isMicMuted = false;
  private status: "idle" | "recording" | "paused" | "stopped" = "idle";
  private options: ScreenRecorderOptions | null = null;

  public getStatus() {
    return this.status;
  }

  public isRecording() {
    return this.status === "recording" || this.status === "paused";
  }

  public async start(options: ScreenRecorderOptions): Promise<MediaStream> {
    this.options = options;
    this.chunks = [];
    this.pausedDuration = 0;
    this.status = "idle";

    const displayConstraints: DisplayMediaStreamOptions = {
      video: {
        displaySurface:
          options.source === "screen"
            ? "monitor"
            : options.source === "window"
              ? "window"
              : "browser",
        frameRate: { ideal: 30, max: 60 },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: options.includeSystemAudio
        ? {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          }
        : false,
      selfBrowserSurface: "exclude",
      systemAudio: options.includeSystemAudio ? "include" : "exclude",
    } as DisplayMediaStreamOptions;

    // 1. Capture Display Stream
    this.displayStream = await navigator.mediaDevices.getDisplayMedia(displayConstraints);

    // Watch for user clicking the native browser "Stop sharing" bar
    const videoTrack = this.displayStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.onended = () => {
        if (this.status === "recording" || this.status === "paused") {
          this.options?.onEnded?.();
        }
      };
    }

    // 2. Capture Microphone Stream if enabled
    if (options.includeMic) {
      try {
        this.micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch (err) {
        console.warn("Could not capture microphone audio:", err);
        this.micStream = null;
      }
    }

    // 3. Audio Mixing Pipeline (Web Audio API)
    const audioTracks: MediaStreamTrack[] = [];
    const displayAudioTrack = this.displayStream.getAudioTracks()[0];
    const micAudioTrack = this.micStream?.getAudioTracks()[0];

    if (displayAudioTrack && micAudioTrack) {
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.audioContext = new AudioCtx();
        const dest = this.audioContext.createMediaStreamDestination();

        const displaySource = this.audioContext.createMediaStreamSource(
          new MediaStream([displayAudioTrack]),
        );
        const micSource = this.audioContext.createMediaStreamSource(
          new MediaStream([micAudioTrack]),
        );

        displaySource.connect(dest);
        micSource.connect(dest);

        const mixedTrack = dest.stream.getAudioTracks()[0];
        if (mixedTrack) audioTracks.push(mixedTrack);
      } catch (err) {
        console.warn("Audio mixing fallback to display/mic audio:", err);
        audioTracks.push(micAudioTrack || displayAudioTrack);
      }
    } else if (displayAudioTrack) {
      audioTracks.push(displayAudioTrack);
    } else if (micAudioTrack) {
      audioTracks.push(micAudioTrack);
    }

    // 4. Construct Final Combined Stream
    const tracks: MediaStreamTrack[] = [videoTrack, ...audioTracks].filter(
      (t): t is MediaStreamTrack => t != null,
    );
    this.combinedStream = new MediaStream(tracks);

    // 5. Initialize MediaRecorder
    let mimeType = "video/webm;codecs=vp9,opus";
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = "video/webm;codecs=vp8,opus";
    }
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = "video/webm";
    }

    this.mediaRecorder = new MediaRecorder(this.combinedStream, {
      mimeType,
      videoBitsPerSecond: 3_000_000,
    });

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.chunks.push(event.data);
      }
    };

    this.startTime = Date.now();
    this.mediaRecorder.start(1000); // 1-second chunks for continuous recording stability
    this.status = "recording";
    options.onStateChange?.("recording");

    this.startTimer();
    return this.combinedStream;
  }

  public pause() {
    if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
      this.mediaRecorder.pause();
      this.status = "paused";
      this.pauseStartedAt = Date.now();
      this.stopTimer();
      this.options?.onStateChange?.("paused");
    }
  }

  public resume() {
    if (this.mediaRecorder && this.mediaRecorder.state === "paused") {
      this.mediaRecorder.resume();
      this.status = "recording";
      if (this.pauseStartedAt > 0) {
        this.pausedDuration += Date.now() - this.pauseStartedAt;
        this.pauseStartedAt = 0;
      }
      this.startTimer();
      this.options?.onStateChange?.("recording");
    }
  }

  public toggleMic(enabled?: boolean): boolean {
    if (!this.micStream) return false;
    const track = this.micStream.getAudioTracks()[0];
    if (!track) return false;

    if (enabled !== undefined) {
      track.enabled = enabled;
      this.isMicMuted = !enabled;
    } else {
      track.enabled = !track.enabled;
      this.isMicMuted = !track.enabled;
    }
    return track.enabled;
  }

  public isMicActive(): boolean {
    const track = this.micStream?.getAudioTracks()[0];
    return Boolean(track && track.enabled);
  }

  public async stop(): Promise<ScreenRecordingResult | null> {
    this.stopTimer();

    if (!this.mediaRecorder || this.status === "idle" || this.status === "stopped") {
      this.cleanupStreams();
      return null;
    }

    const elapsedMs =
      Date.now() -
      this.startTime -
      this.pausedDuration -
      (this.pauseStartedAt > 0 ? Date.now() - this.pauseStartedAt : 0);
    const durationSeconds = Math.max(1, Math.round(elapsedMs / 1000));

    return new Promise((resolve) => {
      this.mediaRecorder!.onstop = () => {
        const mimeType = this.mediaRecorder?.mimeType || "video/webm";
        const blob = new Blob(this.chunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        this.status = "stopped";
        this.options?.onStateChange?.("stopped");
        this.cleanupStreams();
        resolve({ blob, url, durationSeconds });
      };

      if (this.mediaRecorder!.state !== "inactive") {
        this.mediaRecorder!.stop();
      } else {
        const mimeType = this.mediaRecorder?.mimeType || "video/webm";
        const blob = new Blob(this.chunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        this.status = "stopped";
        this.options?.onStateChange?.("stopped");
        this.cleanupStreams();
        resolve({ blob, url, durationSeconds });
      }
    });
  }

  private startTimer() {
    this.stopTimer();
    this.timerInterval = setInterval(() => {
      if (this.status === "recording") {
        const elapsedMs = Date.now() - this.startTime - this.pausedDuration;
        const seconds = Math.max(0, Math.floor(elapsedMs / 1000));
        this.options?.onTick?.(seconds);
      }
    }, 500);
  }

  private stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  private cleanupStreams() {
    if (this.displayStream) {
      this.displayStream.getTracks().forEach((t) => t.stop());
      this.displayStream = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    if (this.combinedStream) {
      this.combinedStream.getTracks().forEach((t) => t.stop());
      this.combinedStream = null;
    }
    if (this.audioContext && this.audioContext.state !== "closed") {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }
}

export const screenRecorder = new ScreenRecorderService();
