import { ipcMain } from "electron";
import { createJobId } from "@pinshuffle/core";
import { PipelineRunner } from "@pinshuffle/pipeline";
import { UserConfigStore } from "@pinshuffle/storage";
import { activeRuns } from "./shared";

interface DesktopRunRequest {
  mode: "run" | "preview" | "scrape" | "apply" | "doctor";
  config?: ReturnType<UserConfigStore["load"]>;
  dryRun?: boolean;
  resume?: boolean;
  maxPins?: number;
  jobId?: string;
}

export function registerPipelineHandlers(
  runner: PipelineRunner,
  configStore: UserConfigStore
): void {
  ipcMain.handle("config:load", () => configStore.loadIfExists());
  ipcMain.handle("config:save", (_event, config) => {
    configStore.save(config);
    return config;
  });

  ipcMain.handle("pipeline:start", async (_event, payload: DesktopRunRequest) => {
    if (payload.config) {
      configStore.save(payload.config);
    }

    const config = configStore.load();
    const jobId = payload.jobId ?? createJobId("desktop");
    const options = mapModeToPipelineOptions(payload, jobId);

    const runPromise = runner
      .run(config, options)
      .catch(() => undefined)
      .finally(() => {
        activeRuns.delete(jobId);
      });

    activeRuns.set(jobId, runPromise);
    return { jobId };
  });

  ipcMain.handle("pipeline:cancel", (_event, jobId: string) =>
    runner.cancel(jobId)
  );
  ipcMain.handle("pipeline:list-jobs", () => runner.jobRepository.list());
  ipcMain.handle("pipeline:get-apply-state", (_event, jobId: string) =>
    runner.checkpointStore.read(jobId, "apply-state")
  );
  ipcMain.handle("pipeline:get-events", (_event, jobId?: string) =>
    runner.eventBus.getEvents(jobId)
  );
}

function mapModeToPipelineOptions(payload: DesktopRunRequest, jobId: string) {
  switch (payload.mode) {
    case "preview":
      return {
        jobId,
        dryRun: true,
        resume: payload.resume ?? true,
        maxPins: payload.maxPins
      };
    case "scrape":
      return {
        jobId,
        dryRun: true,
        resume: payload.resume ?? true,
        endAt: "scrape" as const
      };
    case "apply":
      return {
        jobId,
        dryRun: payload.dryRun ?? false,
        resume: payload.resume ?? true,
        startAt: "apply" as const,
        endAt: "apply" as const,
        maxPins: payload.maxPins
      };
    case "doctor":
      return {
        jobId,
        dryRun: true,
        resume: payload.resume ?? true,
        startAt: "plan" as const,
        endAt: "plan" as const
      };
    case "run":
    default:
      return {
        jobId,
        dryRun: payload.dryRun ?? false,
        resume: payload.resume ?? true,
        maxPins: payload.maxPins
      };
  }
}
