import { BrowserWindow } from "electron";
import { PipelineEvent } from "@pinshuffle/core";

export const activeRuns = new Map<string, Promise<unknown>>();
export const activeControllers = new Map<string, AbortController>();

export function broadcast(channel: string, payload: PipelineEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(channel, payload);
  }
}
