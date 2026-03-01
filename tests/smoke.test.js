const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { normalizeConfig, SPEED_PROFILES } = require("../dist/config.js");
const { computePlanHash, loadPlan } = require("../dist/plan.js");
const { createInitialState, loadState, saveState } = require("../dist/state.js");

test("normalizeConfig supports all-mode and speed profile defaults", () => {
  const config = normalizeConfig({
    sourceBoardUrls: ["https://www.pinterest.com/user/board/"],
    destinationBoardName: "Smoke Test Board",
    pinsToCopy: "all",
    maxPinsToLoad: "all",
    speedProfile: "fast"
  });

  assert.equal(config.pinsToCopy, "all");
  assert.equal(config.maxPinsToLoad, "all");
  assert.equal(config.speedProfile, "fast");
  assert.deepEqual(config.delayMsRange, SPEED_PROFILES.fast.delayMsRange);
  assert.equal(config.batchSize, SPEED_PROFILES.fast.batchSize);
});

test("computePlanHash is deterministic and order-sensitive", () => {
  const baseInput = {
    destinationBoardName: "Board A",
    seedUsed: "seed-1",
    selectedPins: [
      { id: "1", url: "https://www.pinterest.com/pin/1/" },
      { id: "2", url: "https://www.pinterest.com/pin/2/" }
    ]
  };

  const hashA = computePlanHash(baseInput);
  const hashB = computePlanHash(baseInput);
  const hashC = computePlanHash({
    ...baseInput,
    selectedPins: [...baseInput.selectedPins].reverse()
  });

  assert.equal(hashA, hashB);
  assert.notEqual(hashA, hashC);
});

test("loadPlan backfills planHash for legacy plan.json", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pin-shuffle-plan-"));
  const planPath = path.join(tempDir, "plan.json");

  const legacyPlan = {
    destinationBoardName: "Legacy Board",
    seedUsed: "legacy-seed",
    selectedPins: [{ id: "123", url: "https://www.pinterest.com/pin/123/" }],
    totalAvailable: 1,
    createdAt: "2026-03-01T00:00:00.000Z"
  };

  fs.writeFileSync(planPath, JSON.stringify(legacyPlan, null, 2), "utf8");

  const loaded = loadPlan(planPath);
  assert.ok(typeof loaded.planHash === "string" && loaded.planHash.length > 0);
  assert.equal(
    loaded.planHash,
    computePlanHash({
      destinationBoardName: legacyPlan.destinationBoardName,
      seedUsed: legacyPlan.seedUsed,
      selectedPins: legacyPlan.selectedPins
    })
  );

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("state persistence keeps planHash for resume safety", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pin-shuffle-state-"));
  const statePath = path.join(tempDir, "state.json");

  const state = createInitialState("Resume Board", "abc123hash");
  saveState(state, statePath);
  const loaded = loadState(statePath);

  assert.ok(loaded);
  assert.equal(loaded.destinationBoardName, "Resume Board");
  assert.equal(loaded.planHash, "abc123hash");
  assert.deepEqual(loaded.savedIds, []);

  fs.rmSync(tempDir, { recursive: true, force: true });
});
