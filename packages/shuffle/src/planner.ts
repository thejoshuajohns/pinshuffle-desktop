import {
  AppConfig,
  PinRecord,
  ShufflePlan,
  ShufflePlanner,
  sha256
} from "@pinshuffle/core";
import { createSourceFingerprint, createStableSeed } from "./seed";
import { createStrategyRegistry, VisualClusterScorer } from "./strategies";

export class DefaultShufflePlanner implements ShufflePlanner {
  private readonly strategies;

  constructor(visualClusterScorer?: VisualClusterScorer) {
    this.strategies = createStrategyRegistry(visualClusterScorer);
  }

  createPlan(input: {
    jobId: string;
    config: AppConfig;
    pins: PinRecord[];
  }): ShufflePlan {
    const uniquePins = dedupePins(input.pins);
    if (uniquePins.length === 0) {
      throw new Error("No pins available to build a shuffle plan.");
    }

    const strategy = this.strategies[input.config.shuffleStrategy];
    const sourceFingerprint = createSourceFingerprint(input.config, uniquePins);
    const seedUsed = createStableSeed(input.config, uniquePins);
    const shuffled = strategy.shuffle(uniquePins, seedUsed);
    const limit =
      input.config.pinsToCopy === "all"
        ? shuffled.length
        : Math.min(input.config.pinsToCopy, shuffled.length);
    const selectedPins = shuffled.slice(0, limit).map((pin) => ({
      id: pin.id,
      url: pin.url,
      sourceBoardUrl: pin.sourceBoardUrl,
      title: pin.title,
      image: pin.image
    }));

    return {
      jobId: input.jobId,
      destinationBoardName: input.config.destinationBoardName,
      strategy: input.config.shuffleStrategy,
      seedUsed,
      sourceFingerprint,
      planHash: computePlanHash({
        destinationBoardName: input.config.destinationBoardName,
        strategy: input.config.shuffleStrategy,
        seedUsed,
        selectedPins
      }),
      selectedPins,
      totalAvailable: uniquePins.length,
      createdAt: new Date().toISOString()
    };
  }
}

export function computePlanHash(input: {
  destinationBoardName: string;
  strategy: string;
  seedUsed: string;
  selectedPins: Array<Pick<PinRecord, "id" | "url" | "sourceBoardUrl">>;
}): string {
  return sha256(
    JSON.stringify({
      destinationBoardName: input.destinationBoardName.trim(),
      strategy: input.strategy,
      seedUsed: input.seedUsed,
      selectedPins: input.selectedPins.map((pin) => ({
        id: pin.id.trim(),
        url: pin.url.trim(),
        sourceBoardUrl: pin.sourceBoardUrl.trim()
      }))
    })
  );
}

function dedupePins(pins: PinRecord[]): PinRecord[] {
  const map = new Map<string, PinRecord>();

  for (const pin of pins) {
    const key = pin.id || pin.url;
    if (!map.has(key)) {
      map.set(key, canonicalizePin(pin));
    }
  }

  return Array.from(map.values());
}

function canonicalizePin(pin: PinRecord): PinRecord {
  const trimmedUrl = pin.url.trim();

  try {
    const parsed = new URL(trimmedUrl);
    const match = parsed.pathname.match(/\/pin\/(\d+)/i);
    const url = match
      ? `https://www.pinterest.com/pin/${match[1]}/`
      : trimmedUrl;
    return {
      ...pin,
      url
    };
  } catch {
    return pin;
  }
}
