import {
  PipelineStep,
  PipelineStepContext,
  StepResult
} from "@pinshuffle/core";
import { LegacyPinsFile, LegacyWorkspaceBridge } from "@pinshuffle/storage";

export class PlanStep implements PipelineStep {
  readonly name = "plan" as const;
  private readonly legacyBridge = new LegacyWorkspaceBridge();

  async run(context: PipelineStepContext): Promise<StepResult> {
    const checkpointKey = "shuffle-plan";
    if (
      context.options.resume &&
      (await context.checkpointStore.exists(context.job.id, checkpointKey))
    ) {
      await context.emitLog(
        "info",
        "Skipping plan step because checkpoint already exists."
      );
      return {
        status: "skipped",
        summary: "Plan checkpoint already exists.",
        checkpointKey
      };
    }

    const scraped = await context.checkpointStore.read<LegacyPinsFile>(
      context.job.id,
      "scrape-result"
    );
    if (!scraped) {
      throw new Error("No scraped pins available. Run scrape first.");
    }
    if (scraped.pins.length === 0) {
      throw new Error(
        "Scrape checkpoint exists but contains 0 pins. " +
          "Re-run with --no-resume to start a fresh scrape, or check that your auth session is valid with auth-check."
      );
    }

    const plan = context.shufflePlanner.createPlan({
      jobId: context.job.id,
      config: context.config,
      pins: scraped.pins
    });

    await context.checkpointStore.write(context.job.id, checkpointKey, plan);
    await context.artifactStore.writeJson(
      context.job.id,
      "artifacts/plan.json",
      plan
    );
    this.legacyBridge.writePlan(plan);
    await context.updateJob({
      status: "planned",
      latestCompletedStep: "plan",
      artifacts: {
        ...context.job.artifacts,
        planFilePath: context.artifactStore.resolveJobPath(
          context.job.id,
          "artifacts/plan.json"
        )
      }
    });

    return {
      status: "success",
      summary: `Planned ${plan.selectedPins.length} pins with strategy ${plan.strategy}.`,
      checkpointKey
    };
  }
}
