import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { normalizeConfig } from "@pinshuffle/core";
import { PipelineRunner } from "@pinshuffle/pipeline";
import { FakeAuthService, FakeBoardPublisher, FakePinScraper } from "../helpers/fakes";

test("dry-run pipeline creates resumable job artifacts", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pinshuffle-smoke-"));
  const originalCwd = process.cwd();
  process.chdir(tempDir);

  try {
    const runner = new PipelineRunner({
      authService: new FakeAuthService(),
      pinScraper: new FakePinScraper([{ boardUrl: "https://www.pinterest.com/user/board/", pins: [{ id: "9", url: "https://www.pinterest.com/pin/9/", sourceBoardUrl: "https://www.pinterest.com/user/board/", scrapedAt: "2026-03-14T00:00:00.000Z" }], finished: true, stats: { batchSize: 1, uniquePinsCaptured: 1, round: 1 } }]),
      boardPublisher: new FakeBoardPublisher()
    });

    const config = normalizeConfig({
      sourceBoardUrls: ["https://www.pinterest.com/user/board/"],
      destinationBoardName: "Smoke Board",
      seed: "smoke-seed"
    });

    const result = await runner.run(config, {
      dryRun: true,
      resume: false
    });

    expect(result.job.status).toBe("completed");
    expect(
      fs.existsSync(
        path.join(
          tempDir,
          ".pinshuffle/jobs",
          result.job.id,
          "checkpoints",
          "shuffle-plan.json"
        )
      )
    ).toBeTruthy();
    expect(fs.existsSync(path.join(tempDir, "plan.json"))).toBeTruthy();
  } finally {
    process.chdir(originalCwd);
  }
});
