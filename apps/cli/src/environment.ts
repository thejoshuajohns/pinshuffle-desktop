import { AppConfig, normalizeConfig } from "@pinshuffle/core";
import { PipelineRunner } from "@pinshuffle/pipeline";
import {
  PinterestAuthService,
  PinterestBoardPublisher,
  PinterestPinScraper
} from "@pinshuffle/scraper-pinterest";
import { UserConfigStore } from "@pinshuffle/storage";

export interface CliEnvironment {
  configStore: UserConfigStore;
  authService: PinterestAuthService;
  runner: PipelineRunner;
  normalizeConfig: typeof normalizeConfig;
}

export function createCliEnvironment(): CliEnvironment {
  const configStore = new UserConfigStore();
  const authService = new PinterestAuthService();
  const pinScraper = new PinterestPinScraper();
  const boardPublisher = new PinterestBoardPublisher();
  const runner = new PipelineRunner({
    authService,
    pinScraper,
    boardPublisher
  });

  return {
    configStore,
    authService,
    runner,
    normalizeConfig
  };
}
