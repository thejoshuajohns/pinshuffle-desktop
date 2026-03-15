import {
  ApplyState,
  BoardSummary,
  PinRecord,
  ShufflePlan
} from "@pinshuffle/core";
import { readJsonFile, writeJsonFile } from "./fs-utils";
import { workspacePaths } from "./paths";

export interface LegacyPinsFile {
  timestamp: string;
  sourceBoardUrls: string[];
  boardSummaries: BoardSummary[];
  pins: PinRecord[];
  inProgress?: boolean;
  activeBoardUrl?: string;
}

export class LegacyWorkspaceBridge {
  writePinsSnapshot(snapshot: LegacyPinsFile): void {
    writeJsonFile(workspacePaths.rootPins, snapshot);
  }

  readPinsSnapshot(): LegacyPinsFile | null {
    return readJsonFile<LegacyPinsFile>(workspacePaths.rootPins);
  }

  writePlan(plan: ShufflePlan): void {
    writeJsonFile(workspacePaths.rootPlan, plan);
  }

  readPlan(): ShufflePlan | null {
    return readJsonFile<ShufflePlan>(workspacePaths.rootPlan);
  }

  writeState(state: ApplyState): void {
    writeJsonFile(workspacePaths.rootState, state);
  }

  readState(): ApplyState | null {
    return readJsonFile<ApplyState>(workspacePaths.rootState);
  }
}
