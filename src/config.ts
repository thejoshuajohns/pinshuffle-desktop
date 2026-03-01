import fs from "node:fs";
import path from "node:path";

export interface AppConfig {
  sourceBoardUrls: string[];
  destinationBoardName: string;
  pinsToCopy: number | "all";
  maxPinsToLoad: number | "all";
  speedProfile: SpeedProfile;
  seed: string | null;
  delayMsRange: [number, number];
  batchSize: number;
}

export type SpeedProfile = "conservative" | "balanced" | "fast";

interface SpeedProfilePreset {
  delayMsRange: [number, number];
  batchSize: number;
}

export const PATHS = {
  config: path.resolve("config.json"),
  pins: path.resolve("pins.json"),
  plan: path.resolve("plan.json"),
  state: path.resolve("state.json"),
  authState: path.resolve(".auth", "storageState.json"),
  debugDir: path.resolve("debug")
} as const;

export const SPEED_PROFILES: Record<SpeedProfile, SpeedProfilePreset> = {
  conservative: {
    delayMsRange: [600, 1_400],
    batchSize: 12
  },
  balanced: {
    delayMsRange: [250, 900],
    batchSize: 20
  },
  fast: {
    delayMsRange: [120, 450],
    batchSize: 28
  }
};

export const DEFAULT_CONFIG: Omit<AppConfig, "sourceBoardUrls" | "destinationBoardName"> = {
  pinsToCopy: 50,
  maxPinsToLoad: 200,
  speedProfile: "balanced",
  seed: null,
  delayMsRange: [...SPEED_PROFILES.balanced.delayMsRange],
  batchSize: SPEED_PROFILES.balanced.batchSize
};

export function normalizeConfig(
  input: Partial<AppConfig> & {
    sourceBoardUrls: string[];
    destinationBoardName: string;
  }
): AppConfig {
  const sourceBoardUrls = Array.from(
    new Set(
      input.sourceBoardUrls
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    )
  );

  if (sourceBoardUrls.length === 0) {
    throw new Error("config.sourceBoardUrls must contain at least one Pinterest board URL.");
  }

  const destinationBoardName = input.destinationBoardName.trim();
  if (!destinationBoardName) {
    throw new Error("config.destinationBoardName is required.");
  }

  const speedProfile = normalizeSpeedProfile(input.speedProfile ?? DEFAULT_CONFIG.speedProfile);
  const profileDefaults = SPEED_PROFILES[speedProfile];
  const pinsToCopy = normalizeCopyCount(input.pinsToCopy ?? DEFAULT_CONFIG.pinsToCopy, "pinsToCopy", 300);
  const maxPinsToLoad = normalizeCopyCount(input.maxPinsToLoad ?? DEFAULT_CONFIG.maxPinsToLoad, "maxPinsToLoad", 500_000);
  const batchSize = clampInt(input.batchSize ?? profileDefaults.batchSize, 1, 500, "batchSize");
  const delayMsRange = normalizeDelayRange(input.delayMsRange ?? profileDefaults.delayMsRange);
  const seed = normalizeSeed(input.seed);

  return {
    sourceBoardUrls,
    destinationBoardName,
    pinsToCopy,
    maxPinsToLoad,
    speedProfile,
    seed,
    delayMsRange,
    batchSize
  };
}

export function loadConfig(filePath = PATHS.config): AppConfig {
  const config = readJson<AppConfig>(filePath);
  return normalizeConfig(config);
}

export function saveConfig(config: AppConfig, filePath = PATHS.config): void {
  writeJson(filePath, config);
}

export function readJson<T>(filePath: string): T {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw) as T;
}

export function readJsonIfExists<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return readJson<T>(filePath);
}

export function writeJson(filePath: string, value: unknown): void {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

export function ensureRuntimeDirs(): void {
  fs.mkdirSync(path.dirname(PATHS.authState), { recursive: true });
  fs.mkdirSync(PATHS.debugDir, { recursive: true });
}

export function formatPathForLog(filePath: string): string {
  return path.relative(process.cwd(), filePath) || filePath;
}

function normalizeSeed(seed: string | null | undefined): string | null {
  if (seed === null || seed === undefined) {
    return null;
  }

  const trimmed = seed.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeSpeedProfile(profile: string | undefined): SpeedProfile {
  if (!profile) {
    return DEFAULT_CONFIG.speedProfile;
  }

  const lowered = profile.trim().toLowerCase();
  if (lowered === "conservative" || lowered === "balanced" || lowered === "fast") {
    return lowered;
  }

  throw new Error("speedProfile must be one of: conservative, balanced, fast.");
}

function normalizeDelayRange(range: [number, number] | number[]): [number, number] {
  if (!Array.isArray(range) || range.length !== 2) {
    throw new Error("delayMsRange must be [min,max].");
  }

  const min = clampInt(range[0], 0, 60_000, "delayMsRange[0]");
  const max = clampInt(range[1], 0, 60_000, "delayMsRange[1]");

  if (min > max) {
    throw new Error("delayMsRange minimum must be <= maximum.");
  }

  return [min, max];
}

function normalizeCopyCount(
  value: number | "all",
  fieldName: string,
  maxNumericValue: number
): number | "all" {
  if (value === "all") {
    return "all";
  }

  return clampInt(value, 1, maxNumericValue, fieldName);
}

function clampInt(value: number, min: number, max: number, fieldName: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a finite number.`);
  }

  const parsed = Math.trunc(value);
  if (parsed < min || parsed > max) {
    throw new Error(`${fieldName} must be between ${min} and ${max}.`);
  }

  return parsed;
}
