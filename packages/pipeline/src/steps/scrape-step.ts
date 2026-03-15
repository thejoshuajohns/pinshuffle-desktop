import {
  PipelineStep,
  PipelineStepContext,
  PinRecord,
  StepResult
} from "@pinshuffle/core";
import { LegacyPinsFile, LegacyWorkspaceBridge } from "@pinshuffle/storage";

export class ScrapeStep implements PipelineStep {
  readonly name = "scrape" as const;
  private readonly legacyBridge = new LegacyWorkspaceBridge();

  async run(context: PipelineStepContext): Promise<StepResult> {
    const checkpointKey = "scrape-result";
    if (context.options.resume) {
      const existing = await context.checkpointStore.read<LegacyPinsFile>(
        context.job.id,
        checkpointKey
      );
      if (existing && existing.pins.length > 0) {
        await context.emitLog(
          "info",
          "Skipping scrape step because checkpoint already exists."
        );
        return {
          status: "skipped",
          summary: "Scrape checkpoint already exists.",
          checkpointKey
        };
      }
      if (existing && existing.pins.length === 0) {
        await context.emitLog(
          "warn",
          "Discarding empty scrape checkpoint — re-scraping."
        );
      }
    }

    const pinsById = new Map<string, PinRecord>();
    const boardSummaries = new Map<
      string,
      { loadedPins: number; uniquePinsCaptured: number }
    >();
    const startedAt = new Date().toISOString();

    for await (const batch of context.pinScraper.scrapeBoards({
      config: context.config,
      logger: context.logger,
      signal: context.signal
    })) {
      for (const pin of batch.pins) {
        pinsById.set(pin.id, pin);
      }

      boardSummaries.set(batch.boardUrl, {
        loadedPins: batch.pins.length,
        uniquePinsCaptured: batch.stats.uniquePinsCaptured
      });

      const snapshot: LegacyPinsFile = {
        timestamp: startedAt,
        sourceBoardUrls: context.config.sourceBoardUrls,
        boardSummaries: Array.from(boardSummaries.entries()).map(
          ([boardUrl, summary]) => ({
            boardUrl,
            ...summary
          })
        ),
        pins: Array.from(pinsById.values()),
        inProgress: !batch.finished,
        activeBoardUrl: batch.finished ? undefined : batch.boardUrl
      };

      this.legacyBridge.writePinsSnapshot(snapshot);
      await context.artifactStore.writeJson(
        context.job.id,
        "artifacts/pins.json",
        snapshot
      );
      await context.emitLog(
        "info",
        `Scraped ${batch.stats.uniquePinsCaptured} unique pins from ${batch.boardUrl}.`
      );
    }

    const finalSnapshot: LegacyPinsFile = {
      timestamp: startedAt,
      sourceBoardUrls: context.config.sourceBoardUrls,
      boardSummaries: Array.from(boardSummaries.entries()).map(
        ([boardUrl, summary]) => ({
          boardUrl,
          ...summary
        })
      ),
      pins: Array.from(pinsById.values())
    };

    if (finalSnapshot.pins.length === 0) {
      throw new Error("No pins were found on the selected board.");
    }

    await context.checkpointStore.write(
      context.job.id,
      checkpointKey,
      finalSnapshot
    );
    await context.artifactStore.writeJson(
      context.job.id,
      "artifacts/pins.json",
      finalSnapshot
    );
    this.legacyBridge.writePinsSnapshot(finalSnapshot);
    await context.updateJob({
      status: "scraping",
      latestCompletedStep: "scrape",
      artifacts: {
        ...context.job.artifacts,
        pinsFilePath: context.artifactStore.resolveJobPath(
          context.job.id,
          "artifacts/pins.json"
        )
      }
    });

    return {
      status: "success",
      summary: `Captured ${finalSnapshot.pins.length} unique pins.`,
      checkpointKey
    };
  }
}
