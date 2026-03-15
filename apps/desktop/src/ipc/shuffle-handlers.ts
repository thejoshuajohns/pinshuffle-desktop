import { ipcMain } from "electron";
import { createJobId, ReorderProgress, ShuffleStrategy } from "@pinshuffle/core";
import { PinterestBoardShuffler } from "@pinshuffle/pipeline";
import {
  PinterestBoardFeedInterceptor
} from "@pinshuffle/scraper-pinterest";
import { SequenceReorderEngine } from "@pinshuffle/reorder";
import { SqliteShuffleStore } from "@pinshuffle/storage-sqlite";
import { broadcast, activeRuns, activeControllers } from "./shared";

export function registerShuffleHandlers(
  boardShuffler: PinterestBoardShuffler,
  feedInterceptor: PinterestBoardFeedInterceptor,
  reorderEngine: SequenceReorderEngine,
  store: SqliteShuffleStore
): void {
  ipcMain.handle(
    "shuffle:run",
    async (
      _event,
      payload: {
        boardUrl: string;
        newBoardName: string;
        strategy?: ShuffleStrategy;
        seed?: string | null;
      }
    ) => {
      const runId = createJobId("shuffle");
      const controller = new AbortController();
      activeControllers.set(runId, controller);

      const runPromise = boardShuffler
        .shuffleBoard({
          boardUrl: payload.boardUrl,
          newBoardName: payload.newBoardName,
          strategy: payload.strategy,
          seed: payload.seed,
          headless: true,
          signal: controller.signal,
          onProgress: (progress) => broadcastReorderProgress(runId, progress)
        })
        .catch(() => undefined)
        .finally(() => {
          activeRuns.delete(runId);
          activeControllers.delete(runId);
        });

      activeRuns.set(runId, runPromise);
      return { runId };
    }
  );

  ipcMain.handle(
    "shuffle:preview",
    async (
      _event,
      payload: {
        boardUrl: string;
        strategy?: ShuffleStrategy;
        seed?: string | null;
      }
    ) => {
      const capture = await feedInterceptor.captureBoardFeed({
        boardUrl: payload.boardUrl,
        headless: true
      });

      const instructions = reorderEngine.generateReorderPlan({
        pins: capture.pins,
        strategy: payload.strategy ?? "random",
        seed: payload.seed ?? null
      });

      const pinMap = new Map(capture.pins.map((p) => [p.pinId, p]));
      const sortedInstructions = [...instructions].sort(
        (a, b) => a.newSequence - b.newSequence
      );
      const orderedPins = sortedInstructions
        .map((inst) => pinMap.get(inst.pinId))
        .filter(Boolean);

      return { pins: orderedPins };
    }
  );

  ipcMain.handle("shuffle:history", async (_event, boardId?: string) =>
    store.getShuffleRuns(boardId)
  );

  ipcMain.handle("shuffle:cancel", (_event, runId: string) => {
    const controller = activeControllers.get(runId);
    if (!controller) return false;
    controller.abort();
    return true;
  });
}

function broadcastReorderProgress(runId: string, progress: ReorderProgress) {
  broadcast("pipeline:event", {
    type: "reorder.progress",
    timestamp: new Date().toISOString(),
    jobId: runId,
    ...progress
  });
}
