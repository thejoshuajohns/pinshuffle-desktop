import {
  PipelineStep,
  PipelineStepContext,
  StepResult
} from "@pinshuffle/core";

export class AuthStep implements PipelineStep {
  readonly name = "auth" as const;

  async run(context: PipelineStepContext): Promise<StepResult> {
    const checkpointKey = "auth-ready";
    if (
      context.options.resume &&
      (await context.checkpointStore.exists(context.job.id, checkpointKey))
    ) {
      await context.emitLog(
        "info",
        "Skipping auth step because checkpoint already exists."
      );
      return {
        status: "skipped",
        summary: "Auth checkpoint already exists.",
        checkpointKey
      };
    }

    await context.authService.ensureAuthenticated(context.config);
    await context.checkpointStore.write(context.job.id, checkpointKey, {
      authenticatedAt: new Date().toISOString()
    });
    await context.updateJob({
      status: "auth_ready",
      latestCompletedStep: "auth"
    });

    return {
      status: "success",
      summary: "Pinterest authentication verified.",
      checkpointKey
    };
  }
}
