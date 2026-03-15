import { Command } from "commander";
import { AppConfig } from "@pinshuffle/core";
import { CliEnvironment } from "../environment";

interface ShuffleCommandOptions {
  url: string;
  name: string;
  strategy: string;
  seed?: string;
  headless?: boolean;
}

export function registerShuffleCommand(program: Command, env: CliEnvironment): void {
  program
    .command("shuffle")
    .description("Shuffle a board's pins into a new board (original board is preserved).")
    .requiredOption("-u, --url <boardUrl>", "Pinterest board URL to shuffle.")
    .requiredOption("-n, --name <boardName>", "Name for the new board that will hold the shuffled pins.")
    .option("--strategy <strategy>", "Shuffle strategy: random | reverse | interleave-clusters | deterministic-seed | recency-balance | visual-cluster | board-interleave.", "random")
    .option("--seed <seed>", "Seed for deterministic shuffle.")
    .option("--headless", "Run browser in headless mode.", true)
    .option("--no-headless", "Run browser in headed mode.")
    .action(async (options: ShuffleCommandOptions) => {
      const { PinterestBoardShuffler } = await import("@pinshuffle/pipeline");
      const {
        PinterestBoardFeedInterceptor,
        PinterestBulkSaveApi
      } = await import("@pinshuffle/scraper-pinterest");
      const { SequenceReorderEngine } = await import("@pinshuffle/reorder");
      const { SqliteShuffleStore } = await import("@pinshuffle/storage-sqlite");

      const store = new SqliteShuffleStore();
      const shuffler = new PinterestBoardShuffler(
        env.authService,
        new PinterestBoardFeedInterceptor(),
        new SequenceReorderEngine(),
        store,
        new PinterestBulkSaveApi()
      );

      console.log(`Shuffling board: ${options.url}`);
      console.log(`New board: ${options.name}`);
      console.log(`Strategy: ${options.strategy}`);
      if (options.seed) console.log(`Seed: ${options.seed}`);

      const run = await shuffler.shuffleBoard({
        boardUrl: options.url,
        newBoardName: options.name,
        strategy: options.strategy as AppConfig["shuffleStrategy"],
        seed: options.seed ?? null,
        headless: Boolean(options.headless),
        onProgress: (progress) => {
          const detail = progress.detail;
          const suffix =
            detail?.current && detail?.total
              ? ` (${detail.current}/${detail.total})`
              : "";
          console.log(`[${progress.step}] ${progress.message}${suffix}`);
        }
      });

      console.log(`\nShuffle complete!`);
      console.log(`  Run ID: ${run.id}`);
      console.log(`  Source board: ${run.boardUrl}`);
      if (run.newBoardUrl) {
        console.log(`  New board: ${run.newBoardUrl}`);
      }
      console.log(`  Pins: ${run.pinCount}`);
      if (run.result) {
        console.log(`  Saved: ${run.result.reorderedCount}/${run.result.totalPins}`);
        if (run.result.failedCount > 0) {
          console.log(`  Failed: ${run.result.failedCount}`);
        }
        console.log(`  Duration: ${(run.result.durationMs / 1000).toFixed(1)}s`);
      }

      await store.close();
    });
}
