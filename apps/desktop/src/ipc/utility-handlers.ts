import { ipcMain, shell } from "electron";
import {
  pickPinterestBoard,
  runPinterestDiagnostics
} from "@pinshuffle/scraper-pinterest";

export function registerUtilityHandlers(): void {
  ipcMain.handle("board:pick", (_event, payload?: { timeoutMs?: number }) =>
    pickPinterestBoard(payload)
  );
  ipcMain.handle("shell:open-external", async (_event, targetUrl: string) => {
    const parsed = new URL(targetUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("Only http and https URLs can be opened externally.");
    }
    await shell.openExternal(parsed.toString());
  });
  ipcMain.handle(
    "doctor:run",
    async (_event, payload: { pinUrl?: string; timeoutMs?: number }) =>
      runPinterestDiagnostics(payload)
  );
}
