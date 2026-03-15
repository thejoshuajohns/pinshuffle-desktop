import {
  PinRecord,
  ShuffleStrategy,
  roundRobin,
  groupBy,
  pinIdAsNumber,
  safeImageHost
} from "@pinshuffle/core";
import { createSeededRandom, fisherYatesShuffle } from "./random";

export interface VisualClusterScorer {
  score(pin: PinRecord): string;
}

export interface ShuffleStrategyDefinition {
  name: ShuffleStrategy;
  shuffle(pins: PinRecord[], seed: string): PinRecord[];
}

class DefaultVisualClusterScorer implements VisualClusterScorer {
  score(pin: PinRecord): string {
    const firstWord =
      pin.title
        ?.trim()
        .toLowerCase()
        .split(/\s+/)
        .find((token) => token.length > 2) ?? "untitled";
    const imageHost = safeImageHost(pin.image);
    return `${imageHost}:${firstWord}`;
  }
}

const defaultVisualClusterScorer = new DefaultVisualClusterScorer();

export function createStrategyRegistry(
  visualClusterScorer: VisualClusterScorer = defaultVisualClusterScorer
): Record<ShuffleStrategy, ShuffleStrategyDefinition> {
  return {
    random: {
      name: "random",
      shuffle(pins, seed) {
        return fisherYatesShuffle(pins, createSeededRandom(seed));
      }
    },
    "board-interleave": {
      name: "board-interleave",
      shuffle(pins, seed) {
        const random = createSeededRandom(seed);
        const groups = groupBy(pins, (pin) => pin.sourceBoardUrl);
        const orderedGroups = fisherYatesShuffle(
          Object.values(groups),
          random
        ).map((group) => fisherYatesShuffle(group, random));

        return roundRobin(orderedGroups);
      }
    },
    "recency-balance": {
      name: "recency-balance",
      shuffle(pins, seed) {
        const random = createSeededRandom(seed);
        const sorted = [...pins].sort(
          (left, right) => pinIdAsNumber(right.id) - pinIdAsNumber(left.id)
        );
        const recent = sorted.filter((_, index) => index % 2 === 0);
        const older = sorted.filter((_, index) => index % 2 === 1);
        return roundRobin([
          fisherYatesShuffle(recent, random),
          fisherYatesShuffle(older, random)
        ]);
      }
    },
    "visual-cluster": {
      name: "visual-cluster",
      shuffle(pins, seed) {
        const random = createSeededRandom(seed);
        const groups = groupBy(pins, (pin) => visualClusterScorer.score(pin));
        const clusterGroups = fisherYatesShuffle(
          Object.values(groups),
          random
        ).map((group) => fisherYatesShuffle(group, random));
        return roundRobin(clusterGroups);
      }
    },
    reverse: {
      name: "reverse",
      shuffle(pins) {
        return [...pins].reverse();
      }
    },
    "interleave-clusters": {
      name: "interleave-clusters",
      shuffle(pins, seed) {
        const random = createSeededRandom(seed);
        const groups = groupBy(pins, (pin) => {
          const word =
            pin.title
              ?.toLowerCase()
              .split(/\s+/)
              .find((token) => token.length > 2) ?? "none";
          return word;
        });
        const shuffledGroups = fisherYatesShuffle(
          Object.values(groups),
          random
        ).map((group) => fisherYatesShuffle(group, random));
        return roundRobin(shuffledGroups);
      }
    },
    "deterministic-seed": {
      name: "deterministic-seed",
      shuffle(pins, seed) {
        return fisherYatesShuffle(pins, createSeededRandom(seed));
      }
    }
  };
}

