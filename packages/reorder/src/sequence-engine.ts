import {
  BoardPin,
  ReorderEngine,
  ReorderInstruction,
  ShuffleStrategy
} from "@pinshuffle/core";
import { applyStrategy } from "./strategies";

/**
 * Generates ReorderInstructions by shuffling the pin array according to the
 * chosen strategy and assigning new sequence values that reflect the desired
 * ordering.
 *
 * Sequence values are spaced by SEQUENCE_GAP to allow future insertions
 * without a full re-sequence.
 */
const SEQUENCE_GAP = 65536;

export class SequenceReorderEngine implements ReorderEngine {
  generateReorderPlan(input: {
    pins: BoardPin[];
    strategy: ShuffleStrategy;
    seed: string | null;
  }): ReorderInstruction[] {
    if (input.pins.length === 0) {
      return [];
    }

    const shuffled = applyStrategy(input.pins, input.strategy, input.seed);
    const instructions: ReorderInstruction[] = [];

    for (let i = 0; i < shuffled.length; i++) {
      const pin = shuffled[i];
      const newSequence = (i + 1) * SEQUENCE_GAP;
      if (pin.sequence !== newSequence) {
        instructions.push({
          pinId: pin.pinId,
          boardId: pin.boardId,
          oldSequence: pin.sequence,
          newSequence
        });
      }
    }

    return instructions;
  }
}
