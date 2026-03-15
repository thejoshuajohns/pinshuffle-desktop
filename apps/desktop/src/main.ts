import path from "node:path";
import { app, BrowserWindow } from "electron";
import { PipelineRunner, PinterestBoardShuffler } from "@pinshuffle/pipeline";
import {
  PinterestAuthService,
  PinterestBoardFeedInterceptor,
  PinterestBoardPublisher,
  PinterestBulkSaveApi,
  PinterestPinScraper
} from "@pinshuffle/scraper-pinterest";
import { SequenceReorderEngine } from "@pinshuffle/reorder";
import { SqliteShuffleStore } from "@pinshuffle/storage-sqlite";
import { UserConfigStore } from "@pinshuffle/storage";
import {
  registerShuffleHandlers,
  registerPipelineHandlers,
  registerAuthHandlers,
  registerUtilityHandlers,
  broadcast
} from "./ipc";

// -- Services --
const configStore = new UserConfigStore();
const authService = new PinterestAuthService();
const feedInterceptor = new PinterestBoardFeedInterceptor();
const reorderEngine = new SequenceReorderEngine();
const store = new SqliteShuffleStore();
const bulkSaveApi = new PinterestBulkSaveApi();

// -- Orchestrators --
const boardShuffler = new PinterestBoardShuffler(
  authService,
  feedInterceptor,
  reorderEngine,
  store,
  bulkSaveApi
);

const runner = new PipelineRunner({
  authService,
  pinScraper: new PinterestPinScraper(),
  boardPublisher: new PinterestBoardPublisher()
});

// -- Register IPC handlers --
registerShuffleHandlers(boardShuffler, feedInterceptor, reorderEngine, store);
registerPipelineHandlers(runner, configStore);
registerAuthHandlers(authService);
registerUtilityHandlers();

// -- Event broadcasting --
runner.eventBus.subscribe((event) => {
  broadcast("pipeline:event", event);
});

// -- Window management --
function createWindow() {
  const window = new BrowserWindow({
    width: 760,
    height: 820,
    minWidth: 640,
    minHeight: 700,
    autoHideMenuBar: true,
    icon: path.resolve(__dirname, "../assets/icon.png"),
    webPreferences: {
      preload: path.resolve(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  window.loadFile(path.resolve(__dirname, "../src/renderer/index.html"));
}

// -- App lifecycle --
app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on("before-quit", async () => {
  await store.close().catch(() => undefined);
});
