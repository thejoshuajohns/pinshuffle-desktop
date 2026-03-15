import { Command } from "commander";
import { AppConfig, defaultConfig, normalizeConfig, speedProfiles } from "@pinshuffle/core";
import { CliEnvironment } from "../environment";
import { parseCountOption, parseInteger, parseSpeedProfile } from "../parsers";

interface InitOptions {
  source: string[];
  destination: string;
  pins?: string;
  maxLoad?: string;
  speed?: string;
  seed?: string;
  strategy?: AppConfig["shuffleStrategy"];
  delayMin?: string;
  delayMax?: string;
  batchSize?: string;
  scrapeConcurrency?: string;
}

export function registerInitCommand(program: Command, env: CliEnvironment): void {
  program
    .command("init")
    .description("Create config.json with source board(s), destination board, and automation settings.")
    .requiredOption("-s, --source <url...>", "Source board URL(s).")
    .requiredOption("-d, --destination <name>", "Destination board name.")
    .option("-p, --pins <count>", "Pins to copy (default 50, max 500000, or 'all').")
    .option("-m, --max-load <count>", "Max pins to load while scraping (default 200, or 'all').")
    .option("--speed <profile>", "Speed profile: conservative | balanced | fast.")
    .option("--seed <seed>", "Seed for deterministic shuffle.")
    .option("--strategy <strategy>", "Shuffle strategy: random | board-interleave | recency-balance | visual-cluster.")
    .option("--delay-min <ms>", "Minimum action delay in milliseconds.")
    .option("--delay-max <ms>", "Maximum action delay in milliseconds.")
    .option("-b, --batch-size <count>", "Scrape batch size.")
    .option("--scrape-concurrency <count>", "How many boards to scrape concurrently.")
    .action((options: InitOptions) => {
      const speedProfile = options.speed
        ? parseSpeedProfile(options.speed)
        : defaultConfig.speedProfile;
      const speedDefaults = speedProfiles[speedProfile];
      const config = normalizeConfig({
        sourceBoardUrls: options.source,
        destinationBoardName: options.destination,
        pinsToCopy: options.pins ? parseCountOption(options.pins, "pins") : defaultConfig.pinsToCopy,
        maxPinsToLoad: options.maxLoad ? parseCountOption(options.maxLoad, "max-load") : defaultConfig.maxPinsToLoad,
        speedProfile,
        seed: options.seed ?? defaultConfig.seed,
        delayMsRange:
          options.delayMin !== undefined && options.delayMax !== undefined
            ? [parseInteger(options.delayMin, "delay-min"), parseInteger(options.delayMax, "delay-max")]
            : speedDefaults.delayMsRange,
        batchSize: options.batchSize ? parseInteger(options.batchSize, "batch-size") : speedDefaults.batchSize,
        scrapeConcurrency: options.scrapeConcurrency
          ? parseInteger(options.scrapeConcurrency, "scrape-concurrency")
          : defaultConfig.scrapeConcurrency,
        shuffleStrategy: options.strategy ?? defaultConfig.shuffleStrategy
      });

      env.configStore.save(config);
      console.log(`Created config.json with ${config.sourceBoardUrls.length} source board(s).`);
    });
}
