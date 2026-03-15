import { AppConfig, PinRecord, sha256 } from "@pinshuffle/core";

export function createSourceFingerprint(
  config: AppConfig,
  pins: PinRecord[]
): string {
  return sha256(
    JSON.stringify({
      sourceBoardUrls: [...config.sourceBoardUrls].sort(),
      pinIds: pins.map((pin) => pin.id).sort()
    })
  );
}

export function createStableSeed(config: AppConfig, pins: PinRecord[]): string {
  if (config.seed) {
    return config.seed;
  }

  return sha256(
    JSON.stringify({
      destinationBoardName: config.destinationBoardName.trim(),
      sourceBoardUrls: config.sourceBoardUrls.map((url) => url.trim()),
      pins: pins.map((pin) => pin.id),
      strategy: config.shuffleStrategy
    })
  );
}
