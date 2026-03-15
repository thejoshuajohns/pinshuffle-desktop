import { AppConfig } from "@pinshuffle/core";

export function parseInteger(value: string, fieldName: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${fieldName} must be an integer.`);
  }
  return parsed;
}

export function parseCountOption(value: string, fieldName: string): number | "all" {
  if (value.trim().toLowerCase() === "all") {
    return "all";
  }
  return parseInteger(value, fieldName);
}

export function parseSpeedProfile(value: string): AppConfig["speedProfile"] {
  const normalized = value.trim().toLowerCase();
  if (normalized === "conservative" || normalized === "balanced" || normalized === "fast") {
    return normalized;
  }
  throw new Error("speed must be one of: conservative, balanced, fast.");
}
