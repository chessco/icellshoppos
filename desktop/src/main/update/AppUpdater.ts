/**
 * AppUpdater — Windows auto-update foundation (Phase A.6).
 *
 * Thin wrapper around electron-updater's `autoUpdater` singleton. Owns all
 * update state and is the ONLY module that touches electron-updater. The
 * main process exposes its four operations (getStatus/check/download/install)
 * to the renderer via narrow IPC channels — the renderer never imports this
 * module or electron-updater directly (see desktop/src/preload/index.ts).
 *
 * Download is triggered automatically once an update is found ("background,
 * non-blocking" per the approved UX policy) but install/restart is never
 * automatic — quitAndInstall() only runs when explicitly requested via IPC,
 * so a cashier mid-sale is never interrupted.
 */

import { app } from "electron";
import { autoUpdater } from "electron-updater";

export type UpdatePhase =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "not-available"
  | "error";

export interface UpdateState {
  phase: UpdatePhase;
  currentVersion: string;
  availableVersion?: string;
  downloadProgress?: number;
  error?: string;
}

export type UpdateStateListener = (state: UpdateState) => void;

export class AppUpdater {
  private state: UpdateState;
  private listeners = new Set<UpdateStateListener>();
  private initialized = false;

  constructor() {
    this.state = {
      phase: "idle",
      currentVersion: app.getVersion(),
    };
  }

  /** Wires electron-updater's event listeners. Call once, only when app.isPackaged. */
  init(): void {
    if (this.initialized) return;
    this.initialized = true;

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.logger = {
      info: (msg) => console.log("[AppUpdater]", msg),
      warn: (msg) => console.warn("[AppUpdater]", msg),
      error: (msg) => console.error("[AppUpdater]", msg),
      debug: (msg) => console.debug("[AppUpdater]", msg),
    };

    autoUpdater.on("checking-for-update", () => {
      this.setState({ phase: "checking", error: undefined });
    });

    autoUpdater.on("update-available", (info) => {
      this.setState({ phase: "available", availableVersion: info.version, error: undefined });
      // Background, non-blocking download policy: fetch it now so it's ready
      // to install by the time staff choose to restart. Never auto-installs.
      this.downloadUpdate().catch((err) => {
        console.error("[AppUpdater] Background download failed:", err);
      });
    });

    autoUpdater.on("update-not-available", () => {
      this.setState({ phase: "not-available", availableVersion: undefined });
    });

    autoUpdater.on("download-progress", (progress) => {
      this.setState({ phase: "downloading", downloadProgress: Math.round(progress.percent) });
    });

    autoUpdater.on("update-downloaded", (info) => {
      this.setState({ phase: "downloaded", availableVersion: info.version, downloadProgress: 100 });
    });

    autoUpdater.on("error", (err) => {
      this.setState({ phase: "error", error: err.message || "Unknown update error" });
    });
  }

  onStateChanged(listener: UpdateStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getStatus(): UpdateState {
    return { ...this.state };
  }

  async checkForUpdates(): Promise<void> {
    if (!this.initialized) return;
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      this.setState({
        phase: "error",
        error: err instanceof Error ? err.message : "Update check failed",
      });
    }
  }

  async downloadUpdate(): Promise<void> {
    if (!this.initialized) return;
    if (this.state.phase === "downloading" || this.state.phase === "downloaded") return;
    try {
      await autoUpdater.downloadUpdate();
    } catch (err) {
      this.setState({
        phase: "error",
        error: err instanceof Error ? err.message : "Update download failed",
      });
    }
  }

  /** Quits and installs the downloaded update. No-op if nothing was downloaded. */
  quitAndInstall(): void {
    if (this.state.phase !== "downloaded") return;
    autoUpdater.quitAndInstall();
  }

  private setState(patch: Partial<UpdateState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) {
      listener(this.getStatus());
    }
  }
}

export const appUpdater = new AppUpdater();
