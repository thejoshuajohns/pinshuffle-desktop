import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SqliteShuffleStore } from "@pinshuffle/storage-sqlite";
import { BoardPin, ReorderInstruction, ShuffleRun } from "@pinshuffle/core";

let store: SqliteShuffleStore;
let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pinshuffle-test-"));
  store = new SqliteShuffleStore(path.join(tmpDir, "test.db"));
});

afterEach(async () => {
  await store.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makePin(id: string, boardId: string, sequence: number): BoardPin {
  return {
    pinId: id,
    boardId,
    sequence,
    title: `Pin ${id}`,
    imageUrl: `https://example.com/${id}.jpg`
  };
}

describe("SqliteShuffleStore", () => {
  describe("board pins", () => {
    it("saves and retrieves board pins", async () => {
      const pins: BoardPin[] = [
        makePin("100", "board-1", 0),
        makePin("101", "board-1", 65536),
        makePin("102", "board-1", 131072)
      ];

      await store.saveBoardPins("board-1", pins);
      const retrieved = await store.getBoardPins("board-1");

      expect(retrieved).toHaveLength(3);
      expect(retrieved[0].pinId).toBe("100");
      expect(retrieved[1].pinId).toBe("101");
      expect(retrieved[2].pinId).toBe("102");
      expect(retrieved[0].sequence).toBe(0);
    });

    it("returns empty array for unknown board", async () => {
      const pins = await store.getBoardPins("nonexistent");
      expect(pins).toEqual([]);
    });

    it("upserts pins on duplicate", async () => {
      const pin1 = makePin("100", "board-1", 0);
      await store.saveBoardPins("board-1", [pin1]);

      const pin1Updated = { ...pin1, sequence: 65536, title: "Updated" };
      await store.saveBoardPins("board-1", [pin1Updated]);

      const retrieved = await store.getBoardPins("board-1");
      expect(retrieved).toHaveLength(1);
      expect(retrieved[0].sequence).toBe(65536);
      expect(retrieved[0].title).toBe("Updated");
    });

    it("handles large batches efficiently", async () => {
      const pins = Array.from({ length: 500 }, (_, i) =>
        makePin(String(i), "big-board", i * 65536)
      );

      const start = Date.now();
      await store.saveBoardPins("big-board", pins);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(2000);

      const retrieved = await store.getBoardPins("big-board");
      expect(retrieved).toHaveLength(500);
    });
  });

  describe("shuffle runs", () => {
    const run: ShuffleRun = {
      id: "run-001",
      boardId: "board-1",
      boardUrl: "https://www.pinterest.com/user/board/",
      strategy: "random",
      seed: "test-seed",
      pinCount: 50,
      method: "api",
      result: {
        method: "api",
        totalPins: 50,
        reorderedCount: 48,
        failedCount: 2,
        failures: [
          { pinId: "100", error: "timeout", attempts: 3 },
          { pinId: "101", error: "rate limited", attempts: 2 }
        ],
        durationMs: 12345,
        completedAt: "2026-03-15T12:00:00Z"
      },
      createdAt: "2026-03-15T11:55:00Z",
      completedAt: "2026-03-15T12:00:00Z"
    };

    it("saves and retrieves a shuffle run", async () => {
      await store.saveShuffleRun(run);
      const retrieved = await store.getShuffleRun("run-001");

      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe("run-001");
      expect(retrieved!.strategy).toBe("random");
      expect(retrieved!.result!.reorderedCount).toBe(48);
      expect(retrieved!.result!.failures).toHaveLength(2);
    });

    it("returns null for unknown run", async () => {
      const retrieved = await store.getShuffleRun("nonexistent");
      expect(retrieved).toBeNull();
    });

    it("lists runs by board", async () => {
      await store.saveShuffleRun(run);
      await store.saveShuffleRun({
        ...run,
        id: "run-002",
        boardId: "board-2"
      });

      const board1Runs = await store.getShuffleRuns("board-1");
      expect(board1Runs).toHaveLength(1);
      expect(board1Runs[0].id).toBe("run-001");

      const allRuns = await store.getShuffleRuns();
      expect(allRuns).toHaveLength(2);
    });

    it("upserts on save", async () => {
      await store.saveShuffleRun(run);
      await store.saveShuffleRun({
        ...run,
        method: "drag-drop",
        completedAt: "2026-03-15T13:00:00Z"
      });

      const retrieved = await store.getShuffleRun("run-001");
      expect(retrieved!.method).toBe("drag-drop");
    });
  });

  describe("pin positions", () => {
    it("saves and retrieves pin positions", async () => {
      const instructions: ReorderInstruction[] = [
        { pinId: "100", boardId: "board-1", oldSequence: 0, newSequence: 65536 },
        {
          pinId: "101",
          boardId: "board-1",
          oldSequence: 65536,
          newSequence: 131072
        },
        {
          pinId: "102",
          boardId: "board-1",
          oldSequence: 131072,
          newSequence: 196608
        }
      ];

      // Need a shuffle run first for FK
      await store.saveShuffleRun({
        id: "run-pos",
        boardId: "board-1",
        boardUrl: "https://example.com",
        strategy: "random",
        seed: null,
        pinCount: 3,
        method: "api",
        result: null,
        createdAt: new Date().toISOString()
      });

      await store.savePinPositions("run-pos", instructions);
      const retrieved = await store.getPinPositions("run-pos");

      expect(retrieved).toHaveLength(3);
      expect(retrieved[0].pinId).toBe("100");
      expect(retrieved[0].newSequence).toBe(65536);
      expect(retrieved[2].newSequence).toBe(196608);
    });

    it("returns empty for unknown run", async () => {
      const positions = await store.getPinPositions("nonexistent");
      expect(positions).toEqual([]);
    });
  });
});
