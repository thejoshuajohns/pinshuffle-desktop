import { contextBridge, ipcRenderer } from "electron";
import type {
  AppConfig,
  ApplyState,
  AuthCheckResult,
  BoardPin,
  JobRecord,
  PipelineEvent,
  ShuffleRun,
  ShuffleStrategy
} from "@pinshuffle/core";

contextBridge.exposeInMainWorld("desktopApi", {
  loadConfig: (): Promise<AppConfig | null> =>
    ipcRenderer.invoke("config:load"),
  saveConfig: (config: AppConfig): Promise<AppConfig> =>
    ipcRenderer.invoke("config:save", config),

  // Legacy pipeline (still available for compatibility)
  startPipeline: (
    payload: Partial<{
      mode: "run" | "preview" | "scrape" | "apply" | "doctor";
      config: AppConfig;
      dryRun: boolean;
      resume: boolean;
      maxPins: number;
      jobId: string;
    }>
  ): Promise<{ jobId: string }> =>
    ipcRenderer.invoke("pipeline:start", payload),
  cancelPipeline: (jobId: string): Promise<boolean> =>
    ipcRenderer.invoke("pipeline:cancel", jobId),
  listJobs: (): Promise<JobRecord[]> =>
    ipcRenderer.invoke("pipeline:list-jobs"),
  getApplyState: (jobId: string): Promise<ApplyState | null> =>
    ipcRenderer.invoke("pipeline:get-apply-state", jobId),
  getEvents: (jobId?: string): Promise<PipelineEvent[]> =>
    ipcRenderer.invoke("pipeline:get-events", jobId),

  // Shuffle pipeline — always copies to a new board
  shuffleBoard: (payload: {
    boardUrl: string;
    newBoardName: string;
    strategy?: ShuffleStrategy;
    seed?: string | null;
  }): Promise<{ runId: string }> =>
    ipcRenderer.invoke("shuffle:run", payload),
  previewShuffle: (payload: {
    boardUrl: string;
    strategy?: ShuffleStrategy;
    seed?: string | null;
  }): Promise<{ pins: BoardPin[] }> =>
    ipcRenderer.invoke("shuffle:preview", payload),
  getShuffleHistory: (
    boardId?: string
  ): Promise<ShuffleRun[]> =>
    ipcRenderer.invoke("shuffle:history", boardId),
  cancelShuffle: (runId: string): Promise<boolean> =>
    ipcRenderer.invoke("shuffle:cancel", runId),

  // Auth
  login: (payload: {
    promptForEnter: boolean;
    timeoutMs: number;
  }): Promise<boolean> => ipcRenderer.invoke("auth:login", payload),
  checkAuth: (timeoutMs?: number): Promise<AuthCheckResult> =>
    ipcRenderer.invoke("auth:check", timeoutMs),
  logout: (): Promise<boolean> => ipcRenderer.invoke("auth:logout"),

  // Utilities
  pickBoard: (payload?: { timeoutMs?: number }): Promise<{ boardUrl: string }> =>
    ipcRenderer.invoke("board:pick", payload),
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke("shell:open-external", url),
  runDoctor: (payload: { pinUrl?: string; timeoutMs?: number }) =>
    ipcRenderer.invoke("doctor:run", payload),
  onPipelineEvent: (callback: (event: PipelineEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: PipelineEvent) =>
      callback(data);
    ipcRenderer.on("pipeline:event", listener);
    return () => ipcRenderer.removeListener("pipeline:event", listener);
  }
});
