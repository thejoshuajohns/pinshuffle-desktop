import {
  ApplyState,
  PipelineStep,
  PipelineStepContext,
  ShufflePlan,
  StepResult
} from "@pinshuffle/core";
import { LegacyWorkspaceBridge } from "@pinshuffle/storage";

export class ApplyStep implements PipelineStep {
  readonly name = "apply" as const;
  private readonly legacyBridge = new LegacyWorkspaceBridge();

  async run(context: PipelineStepContext): Promise<StepResult> {
    const checkpointKey = "apply-state";
    const plan = await context.checkpointStore.read<ShufflePlan>(
      context.job.id,
      "shuffle-plan"
    );
    if (!plan) {
      throw new Error("No shuffle plan available. Run plan first.");
    }

    if (context.options.dryRun) {
      const dryRunState = createInitialState(
        plan.destinationBoardName,
        plan.planHash
      );
      await context.checkpointStore.write(
        context.job.id,
        checkpointKey,
        dryRunState
      );
      this.legacyBridge.writeState(dryRunState);
      await context.updateJob({
        status: "completed",
        latestCompletedStep: "apply",
        artifacts: {
          ...context.job.artifacts,
          stateFilePath: context.artifactStore.resolveJobPath(
            context.job.id,
            "checkpoints/apply-state.json"
          )
        }
      });
      return {
        status: "success",
        summary: `Dry run complete for ${plan.selectedPins.length} planned pins.`,
        checkpointKey
      };
    }

    let applyState =
      (context.options.resume
        ? await context.checkpointStore.read<ApplyState>(
            context.job.id,
            checkpointKey
          )
        : null) ?? createInitialState(plan.destinationBoardName, plan.planHash);

    await context.checkpointStore.write(
      context.job.id,
      checkpointKey,
      applyState
    );
    this.legacyBridge.writeState(applyState);

    const remainingPins = plan.selectedPins.filter(
      (pin) => !applyState.savedIds.includes(pin.id)
    );
    const effectiveSelectedPins = remainingPins.slice(
      0,
      context.options.maxPins ?? remainingPins.length
    );
    const effectivePlan: ShufflePlan = {
      ...plan,
      selectedPins: effectiveSelectedPins
    };
    const selectedPinIds = new Set(effectiveSelectedPins.map((pin) => pin.id));

    if (effectiveSelectedPins.length === 0) {
      await context.updateJob({
        status: "completed",
        latestCompletedStep: "apply"
      });
      return {
        status: "skipped",
        summary: "No remaining pins needed publishing.",
        checkpointKey
      };
    }

    for await (const progress of context.boardPublisher.publishPins({
      config: context.config,
      plan: effectivePlan,
      logger: context.logger,
      signal: context.signal,
      maxPins: context.options.maxPins
    })) {
      applyState.index = progress.index;
      if (progress.board.url && !applyState.boardUrl) {
        applyState.boardUrl = progress.board.url;
      }
      if (progress.status === "saved") {
        if (!applyState.savedIds.includes(progress.pin.id)) {
          applyState.savedIds.push(progress.pin.id);
        }
        applyState.failures = applyState.failures.filter(
          (failure) => failure.id !== progress.pin.id
        );
      } else if (progress.status === "failed") {
        applyState.failures = applyState.failures.filter(
          (failure) => failure.id !== progress.pin.id
        );
        applyState.failures.push({
          id: progress.pin.id,
          url: progress.pin.url,
          error: progress.error ?? "Unknown error",
          attempts: progress.attempts,
          lastTriedAt: new Date().toISOString(),
          screenshotPath: progress.screenshotPath
        });
      }

      applyState.updatedAt = new Date().toISOString();
      await context.checkpointStore.write(
        context.job.id,
        checkpointKey,
        applyState
      );
      this.legacyBridge.writeState(applyState);
      await context.emitLog(
        progress.status === "saved" ? "info" : "warn",
        `${progress.status.toUpperCase()} ${progress.pin.url}`,
        {
          attempts: progress.attempts,
          screenshotPath: progress.screenshotPath
        }
      );
    }

    await context.updateJob({
      status: "completed",
      latestCompletedStep: "apply",
      artifacts: {
        ...context.job.artifacts,
        stateFilePath: context.artifactStore.resolveJobPath(
          context.job.id,
          "checkpoints/apply-state.json"
        )
      }
    });

    const totalSaved = applyState.savedIds.filter((id) =>
      selectedPinIds.has(id)
    ).length;
    return {
      status: "success",
      summary: `Saved ${totalSaved}/${selectedPinIds.size} pins.`,
      checkpointKey
    };
  }
}

function createInitialState(
  destinationBoardName: string,
  planHash: string
): ApplyState {
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
