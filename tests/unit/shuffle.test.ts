import { describe, expect, it } from "vitest";
import { normalizeConfig, PinRecord } from "@pinshuffle/core";
import { DefaultShufflePlanner } from "@pinshuffle/shuffle";

const pins: PinRecord[] = [
  {
    id: "1",
    url: "https://www.pinterest.com/pin/1/",
    sourceBoardUrl: "https://www.pinterest.com/source/a/",
    scrapedAt: "2026-03-14T00:00:00.000Z"
  },
  {
    id: "2",
    url: "https://www.pinterest.com/pin/2/",
    sourceBoardUrl: "https://www.pinterest.com/source/b/",
    scrapedAt: "2026-03-14T00:00:01.000Z"
  },
  {
    id: "3",
    url: "https://www.pinterest.com/pin/3/",
    sourceBoardUrl: "https://www.pinterest.com/source/a/",
    scrapedAt: "2026-03-14T00:00:02.000Z"
  }
];

describe("shuffle planner", () => {
  it("is deterministic for the same config and pins", () => {
    const planner = new DefaultShufflePlanner();
    const config = normalizeConfig({
      sourceBoardUrls: [
        "https://www.pinterest.com/source/a/",
        "https://www.pinterest.com/source/b/"
      ],
      destinationBoardName: "Shuffle Board",
      seed: "fixed-seed",
      shuffleStrategy: "random"
    });

    const planA = planner.createPlan({ jobId: "job-1", config, pins });
    const planB = planner.createPlan({ jobId: "job-1", config, pins });

    expect(planA.planHash).toBe(planB.planHash);
    expect(planA.selectedPins.map((pin) => pin.id)).toEqual(
      planB.selectedPins.map((pin) => pin.id)
    );
  });

  it("interleaves boards for the board-interleave strategy", () => {
    const planner = new DefaultShufflePlanner();
    const config = normalizeConfig({
      sourceBoardUrls: [
        "https://www.pinterest.com/source/a/",
        "https://www.pinterest.com/source/b/"
      ],
      destinationBoardName: "Shuffle Board",
      seed: "fixed-seed",
      shuffleStrategy: "board-interleave",
      pinsToCopy: "all"
    });

    const plan = planner.createPlan({ jobId: "job-2", config, pins });
    const boards = plan.selectedPins.map((pin) => pin.sourceBoardUrl);

    expect(boards[0]).not.toBe(boards[1]);
  });
});
