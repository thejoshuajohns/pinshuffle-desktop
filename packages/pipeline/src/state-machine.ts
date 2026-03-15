import { JobRecord, JobStatus, StepName } from "@pinshuffle/core";

const stepToStatus: Record<StepName, JobStatus> = {
  auth: "auth_ready",
  scrape: "scraping",
  plan: "planned",
  apply: "applying"
};

export function statusForStep(step: StepName): JobStatus {
  return stepToStatus[step];
}

export function withStep(job: JobRecord, step: StepName): JobRecord {
  return {
    ...job,
    currentStep: step,
    status: step === "apply" ? "applying" : statusForStep(step)
  };
}
