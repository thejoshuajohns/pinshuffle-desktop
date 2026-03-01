import { PATHS, readJsonIfExists, writeJson } from "./config";

export interface SaveFailure {
  id: string;
  url: string;
  error: string;
  attempts: number;
  lastTriedAt: string;
  screenshotPath?: string;
}

export interface ApplyState {
  destinationBoardName: string;
  planHash: string;
  index: number;
  savedIds: string[];
  failures: SaveFailure[];
  startedAt: string;
  updatedAt: string;
}

export function createInitialState(destinationBoardName: string, planHash: string): ApplyState {
  const now = new Date().toISOString();
  return {
    destinationBoardName,
    planHash,
    index: -1,
    savedIds: [],
    failures: [],
    startedAt: now,
    updatedAt: now
  };
}

export function loadState(filePath = PATHS.state): ApplyState | null {
  return readJsonIfExists<ApplyState>(filePath);
}

export function saveState(state: ApplyState, filePath = PATHS.state): void {
  state.updatedAt = new Date().toISOString();
  writeJson(filePath, state);
}
