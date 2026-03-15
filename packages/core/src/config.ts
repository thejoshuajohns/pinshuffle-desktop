import { z } from "zod";
import { ShuffleStrategy, SpeedProfile } from "./types";

export const speedProfiles: Record<
  SpeedProfile,
  { delayMsRange: [number, number]; batchSize: number }
> = {
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

const copyCountSchema = z.union([
  z.literal("all"),
  z.number().int().min(1).max(500_000)
]);

const baseConfigSchema = z.object({
  sourceBoardUrls: z.array(z.string().url()).min(1),
  destinationBoardName: z.string().min(1),
  pinsToCopy: copyCountSchema.default(50),
  maxPinsToLoad: copyCountSchema.default(200),
  speedProfile: z
    .enum(["conservative", "balanced", "fast"])
    .default("balanced"),
  seed: z.string().trim().min(1).nullable().default(null),
  delayMsRange: z
    .tuple([
      z.number().int().min(0).max(60_000),
      z.number().int().min(0).max(60_000)
    ])
    .optional(),
  batchSize: z.number().int().min(1).max(500).optional(),
  shuffleStrategy: z
    .enum([
      "random",
      "board-interleave",
      "recency-balance",
      "visual-cluster",
      "reverse",
      "interleave-clusters",
      "deterministic-seed"
    ])
    .default("random"),
  reorderMode: z
    .enum(["api-first", "drag-drop-only", "legacy-repin"])
    .default("api-first"),
  scrapeConcurrency: z.number().int().min(1).max(8).default(2),
  publishConcurrency: z.number().int().min(1).max(1).default(1),
  loginTimeoutMs: z
    .number()
    .int()
    .min(10_000)
    .max(30 * 60_000)
    .default(10 * 60_000),
  authCheckTimeoutMs: z
    .number()
    .int()
    .min(5_000)
    .max(5 * 60_000)
    .default(30_000),
  headless: z.boolean().default(false)
});

export const appConfigSchema = baseConfigSchema.transform((input) => {
  const profileDefaults = speedProfiles[input.speedProfile];
  const delayMsRange = input.delayMsRange ?? profileDefaults.delayMsRange;
  const batchSize = input.batchSize ?? profileDefaults.batchSize;

  if (delayMsRange[0] > delayMsRange[1]) {
    throw new Error("delayMsRange minimum must be <= maximum.");
  }

  return {
    ...input,
    sourceBoardUrls: Array.from(
      new Set(input.sourceBoardUrls.map((url) => url.trim()))
    ),
    destinationBoardName: input.destinationBoardName.trim(),
    seed: input.seed?.trim() ? input.seed.trim() : null,
    delayMsRange,
    batchSize
  };
});

export type AppConfig = z.infer<typeof appConfigSchema>;

export const defaultConfig: Omit<
  AppConfig,
  "sourceBoardUrls" | "destinationBoardName"
> = {
  pinsToCopy: 50,
  maxPinsToLoad: 200,
  speedProfile: "balanced",
  seed: null,
  delayMsRange: [...speedProfiles.balanced.delayMsRange],
  batchSize: speedProfiles.balanced.batchSize,
  shuffleStrategy: "random" as ShuffleStrategy,
  reorderMode: "api-first" as const,
  scrapeConcurrency: 2,
  publishConcurrency: 1,
  loginTimeoutMs: 10 * 60_000,
  authCheckTimeoutMs: 30_000,
  headless: false
};

export function normalizeConfig(
  input: Partial<AppConfig> & {
    sourceBoardUrls: string[];
    destinationBoardName: string;
  }
): AppConfig {
  return appConfigSchema.parse(input);
}
