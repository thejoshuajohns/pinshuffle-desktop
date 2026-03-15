import path from "node:path";

export const workspacePaths = {
  get rootDir() {
    return path.resolve(".pinshuffle");
  },
  get jobsDir() {
    return path.resolve(".pinshuffle", "jobs");
  },
  get currentJobFile() {
    return path.resolve(".pinshuffle", "current-job.json");
  },
  get authState() {
    return path.resolve(".auth", "storageState.json");
  },
  get rootConfig() {
    return path.resolve("config.json");
  },
  get rootPins() {
    return path.resolve("pins.json");
  },
  get rootPlan() {
    return path.resolve("plan.json");
  },
  get rootState() {
    return path.resolve("state.json");
  },
  get rootDebugDir() {
    return path.resolve("debug");
  }
} as const;

export function getJobDir(jobId: string): string {
  return path.join(workspacePaths.jobsDir, jobId);
}

export function getJobFile(jobId: string): string {
  return path.join(getJobDir(jobId), "job.json");
}
