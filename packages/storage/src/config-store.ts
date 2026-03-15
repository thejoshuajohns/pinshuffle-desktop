import { AppConfig, normalizeConfig } from "@pinshuffle/core";
import { readJsonFile, writeJsonFile } from "./fs-utils";
import { workspacePaths } from "./paths";

export class UserConfigStore {
  load(filePath = workspacePaths.rootConfig): AppConfig {
    const config = readJsonFile<AppConfig>(filePath);
    if (!config) {
      throw new Error(`File not found: ${filePath}`);
    }

    return normalizeConfig(config);
  }

  save(config: AppConfig, filePath = workspacePaths.rootConfig): void {
    writeJsonFile(filePath, config);
  }

  loadIfExists(filePath = workspacePaths.rootConfig): AppConfig | null {
    const config = readJsonFile<AppConfig>(filePath);
    return config ? normalizeConfig(config) : null;
  }
}
