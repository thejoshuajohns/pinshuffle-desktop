import {
  JobRecord,
  JobStatus,
  SelectorAuditResult,
  SerializedError,
  StepName
} from "./types";

export type PipelineEvent =
  | {
      type: "job.created" | "job.updated";
      timestamp: string;
      job: JobRecord;
    }
  | {
      type: "step.started" | "step.completed" | "step.skipped";
      timestamp: string;
      jobId: string;
      step: StepName;
      message: string;
    }
  | {
      type: "step.failed";
      timestamp: string;
      jobId: string;
      step: StepName;
      message: string;
      error: SerializedError;
    }
  | {
      type:
        | "job.completed"
        | "job.segment.completed"
        | "job.failed"
        | "job.cancelled";
      timestamp: string;
      jobId: string;
      status: JobStatus;
      message: string;
      error?: SerializedError;
    }
  | {
      type: "job.log";
      timestamp: string;
      jobId: string;
      level: "debug" | "info" | "warn" | "error";
      message: string;
      context?: Record<string, unknown>;
    }
  | {
      type: "selector.audit";
      timestamp: string;
      jobId: string;
      results: SelectorAuditResult[];
    }
  | {
      type: "reorder.progress";
      timestamp: string;
      jobId: string;
      step: import("./types").ReorderStepName;
      phase: "started" | "progress" | "completed" | "failed";
      message: string;
      detail?: {
        current?: number;
        total?: number;
        pinId?: string;
        method?: import("./types").ReorderMethod;
      };
    };
