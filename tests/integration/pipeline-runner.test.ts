import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { normalizeConfig } from "@pinshuffle/core";
import { PipelineRunner } from "@pinshuffle/pipeline";
import { FakeAuthService, FakeBoardPublisher, FakePinScraper } from "../helpers/fakes";

const originalCwd = process.cwd();

afterEach(() => {
  process.chdir(originalCwd);
});

describe("PipelineRunner integration", () => {
  it("writes job artifacts and legacy compatibility files", async () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "pinshuffle-integration-")
    );
    process.chdir(tempDir);

    const runner = new PipelineRunner({
      authService: new FakeAuthService(),
      pinScraper: new FakePinScraper(),
      boardPublisher: new FakeBoardPublisher()
    });

    const config = normalizeConfig({
      sourceBoardUrls: ["https://www.pinterest.com/user/board/"],
      destinationBoardName: "Integration Board",
      seed: "integration-seed"
    });

    const result = await runner.run(config, {
      dryRun: false,
      resume: false
    });

    expect(result.job.status).toBe("completed");
    expect(
      fs.existsSync(
        path.join(
          tempDir,
          ".pinshuffle/jobs",
          result.job.id,
          "artifacts",
          "pins.json"
        )
      )
    ).toBe(true);
    expect(fs.existsSync(path.join(tempDir, "pins.json"))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, "plan.json"))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, "state.json"))).toBe(true);
  });

  it("skips already-saved pins when resuming apply", async () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "pinshuffle-resume-")
    );
    process.chdir(tempDir);

    const publisher = new FakeBoardPublisher();
    const runner = new PipelineRunner({
      authService: new FakeAuthService(),
      pinScraper: new FakePinScraper(),
      boardPublisher: publisher
    });

    const config = normalizeConfig({
      sourceBoardUrls: ["https://www.pinterest.com/user/board/"],
      destinationBoardName: "Resume Board",
      seed: "resume-seed"
    });

    const firstRun = await runner.run(config, {
      dryRun: false,
      resume: false
    });

    const firstPublishCount = publisher.publishedIds.length;
    const secondRun = await runner.run(config, {
      dryRun: false,
      resume: true,
      jobId: firstRun.job.id
    });

    expect(secondRun.job.status).toBe("completed");
    expect(publisher.publishedIds.length).toBe(firstPublishCount);
  });

  it("reuses the current job for apply-only runs even when apply resume is disabled", async () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "pinshuffle-apply-no-resume-")
    );
    process.chdir(tempDir);

    const publisher = new FakeBoardPublisher();
    const runner = new PipelineRunner({
      authService: new FakeAuthService(),
      pinScraper: new FakePinScraper(),
      boardPublisher: publisher
    });

    const config = normalizeConfig({
      sourceBoardUrls: ["https://www.pinterest.com/user/board/"],
      destinationBoardName: "Apply Reset Board",
      seed: "apply-reset-seed"
    });

    const firstRun = await runner.run(config, {
      dryRun: false,
      resume: false
    });

    const secondRun = await runner.run(config, {
      dryRun: false,
      resume: false,
      startAt: "apply",
      endAt: "apply"
    });

    expect(secondRun.job.id).toBe(firstRun.job.id);
    expect(secondRun.job.status).toBe("completed");
    expect(publisher.publishedIds).toHaveLength(4);
  });

  it("keeps partial runs distinct from fully completed jobs in the event stream", async () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "pinshuffle-partial-events-")
    );
    process.chdir(tempDir);

    const runner = new PipelineRunner({
      authService: new FakeAuthService(),
      pinScraper: new FakePinScraper(),
      boardPublisher: new FakeBoardPublisher()
    });

    const config = normalizeConfig({
      sourceBoardUrls: ["https://www.pinterest.com/user/board/"],
      destinationBoardName: "Partial Event Board",
      seed: "partial-event-seed"
    });

    const result = await runner.run(config, {
      dryRun: true,
      resume: false,
      endAt: "scrape"
    });

    const eventTypes = result.events.map((event) => event.type);
    expect(eventTypes).toContain("job.segment.completed");
    expect(eventTypes).not.toContain("job.completed");
    expect(result.job.status).toBe("scraping");
  });
});
