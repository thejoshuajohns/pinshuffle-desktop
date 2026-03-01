#!/usr/bin/env node

import { Command } from "commander";
import { runApply } from "./apply";
import { checkStoredPinterestAuth, clearSavedAuthState, runLogin } from "./auth";
import { runDiagnose } from "./diagnose";
import {
  AppConfig,
  DEFAULT_CONFIG,
  PATHS,
  SPEED_PROFILES,
  SpeedProfile,
  formatPathForLog,
  loadConfig,
  normalizeConfig,
  saveConfig
} from "./config";
import { runPlan } from "./plan";
import { runScrape } from "./scrape";

const program = new Command();

program
  .name("pinterest-shuffle")
  .description("Create a new Pinterest board with shuffled pins from one or more source boards.")
  .version("1.0.0");

program
  .command("init")
  .description("Create config.json with source board(s), destination board, and automation settings.")
  .requiredOption("-s, --source <url...>", "Source board URL(s). Use one URL for MVP or multiple for v2.")
  .requiredOption("-d, --destination <name>", "Destination board name.")
  .option("-p, --pins <count>", "Pins to copy (default 50, max 300, or 'all').")
  .option("-m, --max-load <count>", "Max pins to load while scraping (default 200, or 'all').")
  .option("--speed <profile>", "Speed profile: conservative | balanced | fast.")
  .option("--seed <seed>", "Seed for deterministic shuffle.")
  .option("--delay-min <ms>", "Minimum action delay in milliseconds (default 250).")
  .option("--delay-max <ms>", "Maximum action delay in milliseconds (default 900).")
  .option("-b, --batch-size <count>", "Scrape scroll batch size (default 20).")
  .action((options: InitOptions) => {
    const delayMin = options.delayMin !== undefined ? parseInteger(options.delayMin, "delay-min") : undefined;
    const delayMax = options.delayMax !== undefined ? parseInteger(options.delayMax, "delay-max") : undefined;
    const speedProfile = options.speed !== undefined ? parseSpeedProfile(options.speed) : DEFAULT_CONFIG.speedProfile;
    const speedDefaults = SPEED_PROFILES[speedProfile];

    if ((delayMin === undefined) !== (delayMax === undefined)) {
      throw new Error("Provide both --delay-min and --delay-max together.");
    }

    const candidate: Partial<AppConfig> & {
      sourceBoardUrls: string[];
      destinationBoardName: string;
    } = {
      sourceBoardUrls: options.source,
      destinationBoardName: options.destination,
      pinsToCopy: options.pins !== undefined ? parseCountOption(options.pins, "pins") : DEFAULT_CONFIG.pinsToCopy,
      maxPinsToLoad:
        options.maxLoad !== undefined ? parseCountOption(options.maxLoad, "max-load") : DEFAULT_CONFIG.maxPinsToLoad,
      speedProfile,
      seed: options.seed ?? DEFAULT_CONFIG.seed,
      delayMsRange:
        delayMin !== undefined && delayMax !== undefined ? [delayMin, delayMax] : [...speedDefaults.delayMsRange],
      batchSize:
        options.batchSize !== undefined ? parseInteger(options.batchSize, "batch-size") : speedDefaults.batchSize
    };

    const config = normalizeConfig(candidate);
    saveConfig(config, PATHS.config);

    console.log(`Created ${formatPathForLog(PATHS.config)} with ${config.sourceBoardUrls.length} source board(s).`);
  });

program
  .command("login")
  .description("Launch headed browser and save Playwright storage state after manual login.")
  .option("--prompt", "Wait for Enter in terminal after manual login.", true)
  .option("--no-prompt", "Auto-detect login session without terminal Enter (desktop-friendly).")
  .option("--timeout-ms <ms>", "Timeout for login auto-detection in milliseconds.", "600000")
  .action(async (options: LoginCliOptions) => {
    await runLogin({
      promptForEnter: Boolean(options.prompt),
      timeoutMs: parseInteger(options.timeoutMs, "timeout-ms")
    });
  });

program
  .command("auth-check")
  .description("Validate that saved auth state is still an authenticated Pinterest session.")
  .option("--timeout-ms <ms>", "Timeout for auth check navigation in milliseconds.", "30000")
  .option("--quiet", "Suppress success/failure output and rely on exit code.", false)
  .action(async (options: AuthCheckCliOptions) => {
    const result = await checkStoredPinterestAuth({
      timeoutMs: parseInteger(options.timeoutMs, "timeout-ms")
    });

    if (result.authenticated) {
      if (!options.quiet) {
        console.log("Pinterest auth session is valid.");
      }
      return;
    }

    if (!options.quiet) {
      console.error(`Pinterest auth session is invalid: ${result.reason}`);
      throw new Error(result.reason);
    }

    process.exitCode = 1;
  });

program
  .command("logout")
  .description("Delete saved Playwright auth state.")
  .action(() => {
    const removed = clearSavedAuthState();
    if (removed) {
      console.log(`Removed auth state at ${formatPathForLog(PATHS.authState)}.`);
      return;
    }

    console.log(`No auth state found at ${formatPathForLog(PATHS.authState)}.`);
  });

program
  .command("scrape")
  .description("Scrape source board(s) into pins.json.")
  .action(async () => {
    const config = loadConfig(PATHS.config);
    await runScrape(config);
  });

program
  .command("plan")
  .description("Create plan.json by shuffling scraped pins and selecting pinsToCopy.")
  .action(() => {
    const config = loadConfig(PATHS.config);
    runPlan(config);
  });

program
  .command("diagnose")
  .description("Run selector health diagnostics and write a report to debug/.")
  .option("--pin-url <url>", "Optional pin URL to inspect instead of plan/pins fallback.")
  .option("--timeout-ms <ms>", "Selector wait timeout in milliseconds.", "3000")
  .action(async (options: DiagnoseCliOptions) => {
    await runDiagnose({
      pinUrl: options.pinUrl,
      timeoutMs: parseInteger(options.timeoutMs, "timeout-ms")
    });
  });

program
  .command("apply")
  .description("Save planned pins to destination board in shuffled order.")
  .option("--dry-run", "Print planned saves only; do not modify Pinterest.", false)
  .option("--resume", "Resume from state.json if available.", true)
  .option("--no-resume", "Ignore state.json and start from the first planned pin.")
  .option("--max <count>", "Process only the first N planned pins.")
  .action(async (options: ApplyCliOptions) => {
    const config = loadConfig(PATHS.config);

    await runApply(config, {
      dryRun: Boolean(options.dryRun),
      resume: Boolean(options.resume),
      maxPins: options.max !== undefined ? parseInteger(options.max, "max") : undefined
    });
  });

void program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
});

function parseInteger(value: string, fieldName: string): number {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    throw new Error(`${fieldName} must be an integer.`);
  }

  return parsed;
}

function parseCountOption(value: string, fieldName: string): number | "all" {
  if (value.trim().toLowerCase() === "all") {
    return "all";
  }

  return parseInteger(value, fieldName);
}

function parseSpeedProfile(value: string): SpeedProfile {
  const normalized = value.trim().toLowerCase();
  if (normalized === "conservative" || normalized === "balanced" || normalized === "fast") {
    return normalized;
  }

  throw new Error("speed must be one of: conservative, balanced, fast.");
}

interface InitOptions {
  source: string[];
  destination: string;
  pins?: string;
  maxLoad?: string;
  speed?: string;
  seed?: string;
  delayMin?: string;
  delayMax?: string;
  batchSize?: string;
}

interface ApplyCliOptions {
  dryRun?: boolean;
  resume?: boolean;
  max?: string;
}

interface LoginCliOptions {
  prompt?: boolean;
  timeoutMs: string;
}

interface AuthCheckCliOptions {
  timeoutMs: string;
  quiet?: boolean;
}

interface DiagnoseCliOptions {
  pinUrl?: string;
  timeoutMs: string;
}
