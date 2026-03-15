import {
  createLogger,
  PipelineRunOptions,
  PipelineStep,
  PipelineStepContext,
  serializeError
} from "@pinshuffle/core";
import {
  FileSystemArtifactStore,
  FileSystemCheckpointStore,
  FileSystemJobRepository,
  PersistentPipelineEventBus
} from "@pinshuffle/storage";
import { DefaultShufflePlanner } from "@pinshuffle/shuffle";
import { AuthStep } from "./steps/auth-step";
import { ApplyStep } from "./steps/apply-step";
import { PlanStep } from "./steps/plan-step";
import { ScrapeStep } from "./steps/scrape-step";

export interface PipelineServices {
  authService: PipelineStepContext["authService"];
  pinScraper: PipelineStepContext["pinScraper"];
  boardPublisher: PipelineStepContext["boardPublisher"];
}

export class PipelineRunner {
  readonly artifactStore = new FileSystemArtifactStore();
  readonly checkpointStore = new FileSystemCheckpointStore(this.artifactStore);
  readonly jobRepository = new FileSystemJobRepository(this.artifactStore);
  readonly eventBus = new PersistentPipelineEventBus(this.artifactStore);
  readonly shufflePlanner = new DefaultShufflePlanner();
  private readonly steps: PipelineStep[] = [
    new AuthStep(),
    new ScrapeStep(),
    new PlanStep(),
    new ApplyStep()
  ];
  private readonly activeControllers = new Map<string, AbortController>();

  constructor(private readonly services: PipelineServices) {}

  async run(
    config: PipelineStepContext["config"],
    options: PipelineRunOptions = {}
  ) {
    const resolvedOptions: Required<
      Pick<PipelineRunOptions, "dryRun" | "resume">
    > &
      PipelineRunOptions = {
      dryRun: options.dryRun ?? false,
      resume: options.resume ?? true,
      ...options
    };

    const requiresExistingJob = startsMidPipeline(resolvedOptions);
    const existingJobId =
      resolvedOptions.jobId ??
      (resolvedOptions.resume || requiresExistingJob
        ? await this.jobRepository.getCurrentJobId()
        : null);
    let job = existingJobId
      ? await this.jobRepository.get(existingJobId)
      : null;

    if (!job && requiresExistingJob) {
      throw new Error(
        resolvedOptions.jobId
          ? `Job ${resolvedOptions.jobId} does not exist or no longer has checkpoints to resume.`
          : "No existing job is available for this partial pipeline run."
      );
    }

    if (
      job &&
      resolvedOptions.jobId &&
      !resolvedOptions.resume &&
      !requiresExistingJob
    ) {
      throw new Error(
        `Job ${resolvedOptions.jobId} already exists. Resume it or omit the job id for a fresh run.`
      );
    }

    if (!job || (!resolvedOptions.resume && !requiresExistingJob)) {
      job = await this.jobRepository.create({
        config,
        dryRun: resolvedOptions.dryRun,
        resume: resolvedOptions.resume,
        configPath: resolvedOptions.configPath,
        jobId: resolvedOptions.jobId
      });
      await this.eventBus.publish({
        type: "job.created",
        timestamp: new Date().toISOString(),
        job
      });
    }

    const logger = createLogger(`pipeline:${job.id}`);
    const controller = new AbortController();
    this.activeControllers.set(job.id, controller);

    const updateJob: PipelineStepContext["updateJob"] = async (patch) => {
      if (!job) {
        throw new Error("Pipeline job was not initialized.");
      }

      job = await this.jobRepository.save({
        ...job,
        ...patch
      });

      await this.eventBus.publish({
        type: "job.updated",
        timestamp: new Date().toISOString(),
        job
      });

      return job;
    };

    const emitLog: PipelineStepContext["emitLog"] = async (
      level,
      message,
      context
    ) => {
      logger[level](context ?? {}, message);
      await this.eventBus.publish({
        type: "job.log",
        timestamp: new Date().toISOString(),
        jobId: job!.id,
        level,
        message,
        context
      });
    };

    const auditSelectors: PipelineStepContext["auditSelectors"] = async (
      results
    ) => {
      await this.eventBus.publish({
        type: "selector.audit",
        timestamp: new Date().toISOString(),
        jobId: job!.id,
        results
      });
    };

    const context: PipelineStepContext = {
      job,
      config,
      options: resolvedOptions,
      logger,
      jobRepository: this.jobRepository,
      checkpointStore: this.checkpointStore,
      artifactStore: this.artifactStore,
      eventBus: this.eventBus,
      authService: this.services.authService,
      pinScraper: this.services.pinScraper,
      boardPublisher: this.services.boardPublisher,
      shufflePlanner: this.shufflePlanner,
      updateJob,
      emitLog,
      auditSelectors,
      signal: controller.signal
    };

    try {
      const stepsToRun = filterSteps(
        this.steps,
        resolvedOptions.startAt,
        resolvedOptions.endAt
      );
      for (const step of stepsToRun) {
        if (controller.signal.aborted) {
          await updateJob({
            status: "cancelled"
          });
          await this.eventBus.publish({
            type: "job.cancelled",
            timestamp: new Date().toISOString(),
            jobId: job.id,
            status: "cancelled",
            message: "Pipeline execution was cancelled."
          });
          break;
        }

        await updateJob({
          currentStep: step.name
        });
        await this.eventBus.publish({
          type: "step.started",
          timestamp: new Date().toISOString(),
          jobId: job.id,
          step: step.name,
          message: `Starting ${step.name} step.`
        });

        const result = await step.run({
          ...context,
          job
        });

        await this.eventBus.publish({
          type: result.status === "skipped" ? "step.skipped" : "step.completed",
          timestamp: new Date().toISOString(),
          jobId: job.id,
          step: step.name,
          message: result.summary
        });
      }

      job = (await this.jobRepository.get(job.id)) ?? job;
      if (job.status !== "cancelled" && job.status !== "failed") {
        const finalStatus =
          resolvedOptions.endAt && resolvedOptions.endAt !== "apply"
            ? job.status
            : resolvedOptions.dryRun
              ? "completed"
              : job.status;
        job = await updateJob({
          status: finalStatus
        });
        await this.eventBus.publish({
          type:
            finalStatus === "completed"
              ? "job.completed"
              : "job.segment.completed",
          timestamp: new Date().toISOString(),
          jobId: job.id,
          status: job.status,
          message:
            finalStatus === "completed"
              ? "Pipeline run completed."
              : `Pipeline segment completed at ${job.latestCompletedStep ?? resolvedOptions.endAt ?? job.currentStep ?? "the latest checkpoint"}.`
        });
      }

      return {
        job,
        events: this.eventBus.getEvents(job.id)
      };
    } catch (error) {
      const serialized = serializeError(error);
      job = await updateJob({
        status: "failed",
        error: serialized
      });
      await this.eventBus.publish({
        type: "step.failed",
        timestamp: new Date().toISOString(),
        jobId: job.id,
        step: job.currentStep ?? resolvedOptions.startAt ?? "auth",
        message: serialized.message,
        error: serialized
      });
      await this.eventBus.publish({
        type: "job.failed",
        timestamp: new Date().toISOString(),
        jobId: job.id,
        status: "failed",
        message: serialized.message,
        error: serialized
      });
      throw error;
    } finally {
      this.activeControllers.delete(job.id);
    }
  }

  cancel(jobId: string): boolean {
    const controller = this.activeControllers.get(jobId);
    if (!controller) {
      return false;
    }

    controller.abort();
    return true;
  }
}

function startsMidPipeline(options: PipelineRunOptions): boolean {
  return Boolean(options.startAt && options.startAt !== "auth");
}

function filterSteps(
  steps: PipelineStep[],
  startAt?: PipelineRunOptions["startAt"],
  endAt?: PipelineRunOptions["endAt"]
) {
  const stepNames = steps.map((step) => step.name);
  const startIndex = startAt ? stepNames.indexOf(startAt) : 0;
  const endIndex = endAt ? stepNames.indexOf(endAt) : steps.length - 1;
  return steps.slice(
    startIndex === -1 ? 0 : startIndex,
    (endIndex === -1 ? steps.length - 1 : endIndex) + 1
  );
}
