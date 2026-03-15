import { describe, expect, it } from "vitest";
import { normalizeConfig, speedProfiles } from "@pinshuffle/core";

describe("config normalization", () => {
  it("applies speed profile defaults and all-mode counts", () => {
    const config = normalizeConfig({
      sourceBoardUrls: ["https://www.pinterest.com/user/board/"],
      destinationBoardName: "Shuffle Board",
      pinsToCopy: "all",
      maxPinsToLoad: "all",
      speedProfile: "fast"
    });

    expect(config.pinsToCopy).toBe("all");
    expect(config.maxPinsToLoad).toBe("all");
    expect(config.delayMsRange).toEqual(speedProfiles.fast.delayMsRange);
    expect(config.batchSize).toBe(speedProfiles.fast.batchSize);
  });
});
