import { ipcMain } from "electron";
import { PinterestAuthService } from "@pinshuffle/scraper-pinterest";

export function registerAuthHandlers(authService: PinterestAuthService): void {
  ipcMain.handle(
    "auth:login",
    async (_event, payload: { promptForEnter: boolean; timeoutMs: number }) => {
      await authService.login(payload);
      return true;
    }
  );
  ipcMain.handle("auth:check", async (_event, timeoutMs?: number) =>
    authService.checkStoredAuth(timeoutMs ?? 30_000)
  );
  ipcMain.handle("auth:logout", () => authService.clearStoredAuth());
}
