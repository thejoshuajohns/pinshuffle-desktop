import { createHash } from "node:crypto";

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function createJobId(prefix = "job"): string {
  return `${prefix}-${new Date().toISOString().replace(/[:.]/g, "-")}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function asCountLabel(value: number | "all"): string {
  return value === "all" ? "all" : String(value);
}

export function roundRobin<T>(groups: T[][]): T[] {
  const queues = groups
    .map((group) => [...group])
    .filter((group) => group.length > 0);
  const result: T[] = [];

  while (queues.some((group) => group.length > 0)) {
    for (const group of queues) {
      const item = group.shift();
      if (item) {
        result.push(item);
      }
    }
  }

  return result;
}

export function groupBy<T>(
  items: T[],
  getKey: (item: T) => string
): Record<string, T[]> {
  return items.reduce<Record<string, T[]>>((accumulator, item) => {
    const key = getKey(item);
    accumulator[key] ??= [];
    accumulator[key].push(item);
    return accumulator;
  }, {});
}

export function pinIdAsNumber(id: string): number {
  const numeric = Number.parseInt(id, 10);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function safeImageHost(image?: string): string {
  if (!image) {
    return "no-image";
  }

  try {
    return new URL(image).hostname;
  } catch {
    return "invalid-image";
  }
}
