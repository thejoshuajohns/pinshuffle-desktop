import {
  BoardPin,
  ShuffleStrategy,
  roundRobin,
  groupBy,
  pinIdAsNumber,
  safeImageHost
} from "@pinshuffle/core";
import { createSeededRandom, fisherYatesShuffle } from "./random";

/**
 * Apply a shuffle strategy to an array of BoardPins.
 * Returns a new array in the desired order.
 */
export function applyStrategy(
  pins: BoardPin[],
  strategy: ShuffleStrategy,
  seed: string | null
): BoardPin[] {
  const effectiveSeed = seed ?? defaultSeed(pins);
  const random = createSeededRandom(effectiveSeed);

  switch (strategy) {
    case "random":
      return fisherYatesShuffle(pins, random);

    case "reverse":
      return [...pins].reverse();

    case "interleave-clusters":
      return interleaveClusters(pins, random);

    case "deterministic-seed":
      return fisherYatesShuffle(pins, createSeededRandom(effectiveSeed));

    case "board-interleave":
      return boardInterleave(pins, random);

    case "recency-balance":
      return recencyBalance(pins, random);

    case "visual-cluster":
      return visualCluster(pins, random);

    default:
      return fisherYatesShuffle(pins, random);
  }
}

function defaultSeed(pins: BoardPin[]): string {
  return `pinshuffle-${pins.length}-${pins[0]?.boardId ?? "none"}`;
}

/**
 * Interleave clusters: group pins by dominant color or title keyword,
 * then round-robin from shuffled groups so visually similar pins are spread
 * apart.
 */
function interleaveClusters(
  pins: BoardPin[],
  random: () => number
): BoardPin[] {
  const groups = groupBy(pins, (pin) => {
    if (pin.dominantColor) {
      return pin.dominantColor.slice(0, 4);
    }
    const word =
      pin.title
        ?.toLowerCase()
        .split(/\s+/)
        .find((w) => w.length > 2) ?? "none";
    return word;
  });

  const shuffledGroups = fisherYatesShuffle(Object.values(groups), random).map(
    (group) => fisherYatesShuffle(group, random)
  );

  return roundRobin(shuffledGroups);
}

/**
 * Board interleave: group pins by boardId (useful when merging multiple
 * boards), then round-robin.
 */
function boardInterleave(pins: BoardPin[], random: () => number): BoardPin[] {
  const groups = groupBy(pins, (pin) => pin.boardId);
  const shuffledGroups = fisherYatesShuffle(Object.values(groups), random).map(
    (group) => fisherYatesShuffle(group, random)
  );
  return roundRobin(shuffledGroups);
}

/**
 * Recency balance: sort by pinId (as a proxy for creation time), split into
 * recent/older halves, shuffle each, then interleave.
 */
function recencyBalance(pins: BoardPin[], random: () => number): BoardPin[] {
  const sorted = [...pins].sort(
    (a, b) => pinIdAsNumber(b.pinId) - pinIdAsNumber(a.pinId)
  );
  const recent = sorted.filter((_, i) => i % 2 === 0);
  const older = sorted.filter((_, i) => i % 2 === 1);
  return roundRobin([
    fisherYatesShuffle(recent, random),
    fisherYatesShuffle(older, random)
  ]);
}

/**
 * Visual cluster: group by image host + title keyword, then round-robin.
 */
function visualCluster(pins: BoardPin[], random: () => number): BoardPin[] {
  const groups = groupBy(pins, (pin) => {
    const host = safeImageHost(pin.imageUrl);
    const word =
      pin.title
        ?.toLowerCase()
        .split(/\s+/)
        .find((w) => w.length > 2) ?? "untitled";
    return `${host}:${word}`;
  });
  const shuffledGroups = fisherYatesShuffle(Object.values(groups), random).map(
    (group) => fisherYatesShuffle(group, random)
  );
  return roundRobin(shuffledGroups);
}

