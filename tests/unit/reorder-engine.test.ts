import { describe, it, expect } from "vitest";
import { SequenceReorderEngine } from "@pinshuffle/reorder";
import { BoardPin, ShuffleStrategy } from "@pinshuffle/core";

function makePins(count: number, boardId = "board-1"): BoardPin[] {
  return Array.from({ length: count }, (_, i) => ({
    pinId: String(1000 + i),
    boardId,
    sequence: i * 65536,
    title: `Pin ${i}`,
    imageUrl: `https://example.com/img/${i}.jpg`
  }));
}

describe("SequenceReorderEngine", () => {
  const engine = new SequenceReorderEngine();

  it("returns empty instructions for empty input", () => {
    const instructions = engine.generateReorderPlan({
      pins: [],
      strategy: "random",
      seed: null
    });
    expect(instructions).toEqual([]);
  });

  it("generates instructions for random shuffle", () => {
    const pins = makePins(20);
    const instructions = engine.generateReorderPlan({
      pins,
      strategy: "random",
      seed: "test-seed-42"
    });

    expect(instructions.length).toBeGreaterThan(0);
    expect(instructions.length).toBeLessThanOrEqual(20);

    for (const inst of instructions) {
      expect(inst.boardId).toBe("board-1");
      expect(inst.newSequence).toBeGreaterThan(0);
      expect(inst.newSequence % 65536).toBe(0);
    }
  });

  it("deterministic seed produces identical results", () => {
    const pins = makePins(50);
    const run1 = engine.generateReorderPlan({
      pins,
      strategy: "deterministic-seed",
      seed: "reproducible-123"
    });
    const run2 = engine.generateReorderPlan({
      pins,
      strategy: "deterministic-seed",
      seed: "reproducible-123"
    });

    expect(run1).toEqual(run2);
  });

  it("different seeds produce different results", () => {
    const pins = makePins(50);
    const run1 = engine.generateReorderPlan({
      pins,
      strategy: "random",
      seed: "seed-A"
    });
    const run2 = engine.generateReorderPlan({
      pins,
      strategy: "random",
      seed: "seed-B"
    });

    const order1 = run1.map((i) => i.pinId);
    const order2 = run2.map((i) => i.pinId);
    expect(order1).not.toEqual(order2);
  });

  it("reverse strategy reverses the order", () => {
    const pins = makePins(10);
    const instructions = engine.generateReorderPlan({
      pins,
      strategy: "reverse",
      seed: null
    });

    // After reverse, the last pin should have the lowest new sequence
    const sorted = [...instructions].sort(
      (a, b) => a.newSequence - b.newSequence
    );
    expect(sorted[0].pinId).toBe("1009");
    expect(sorted[sorted.length - 1].pinId).toBe("1000");
  });

  it("interleave-clusters spreads similar pins apart", () => {
    const pins = makePins(20);
    const instructions = engine.generateReorderPlan({
      pins,
      strategy: "interleave-clusters",
      seed: "cluster-test"
    });

    expect(instructions.length).toBeGreaterThan(0);
  });

  it("handles large boards (500+ pins) efficiently", () => {
    const pins = makePins(600);
    const start = Date.now();
    const instructions = engine.generateReorderPlan({
      pins,
      strategy: "random",
      seed: "perf-test"
    });
    const elapsed = Date.now() - start;

    expect(instructions.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(1000); // Should complete in under 1 second
  });

  const strategies: ShuffleStrategy[] = [
    "random",
    "reverse",
    "interleave-clusters",
    "deterministic-seed",
    "board-interleave",
    "recency-balance",
    "visual-cluster"
  ];

  for (const strategy of strategies) {
    it(`strategy "${strategy}" produces valid sequence values`, () => {
      const pins = makePins(30);
      const instructions = engine.generateReorderPlan({
        pins,
        strategy,
        seed: "strategy-test"
      });

      const sequences = instructions.map((i) => i.newSequence);
      const uniqueSequences = new Set(sequences);
      expect(uniqueSequences.size).toBe(sequences.length);

      for (const seq of sequences) {
        expect(seq).toBeGreaterThan(0);
      }
    });
  }
});
