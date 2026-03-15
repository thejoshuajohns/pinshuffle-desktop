import { PipelineEvent, PipelineEventBus } from "@pinshuffle/core";
import { FileSystemArtifactStore } from "./artifact-store";

export class PersistentPipelineEventBus implements PipelineEventBus {
  private readonly listeners = new Set<(event: PipelineEvent) => void>();
  private readonly events: PipelineEvent[] = [];

  constructor(private readonly artifacts: FileSystemArtifactStore) {}

  async publish(event: PipelineEvent): Promise<void> {
    this.events.push(event);
    const jobId = "jobId" in event ? event.jobId : event.job.id;
    await this.artifacts.appendJsonLine(jobId, "logs/events.jsonl", event);

    for (const listener of this.listeners) {
      listener(event);
    }
  }

  subscribe(listener: (event: PipelineEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getEvents(jobId?: string): PipelineEvent[] {
    if (!jobId) {
      return [...this.events];
    }

    return this.events.filter((event) =>
      "jobId" in event ? event.jobId === jobId : event.job.id === jobId
    );
  }
}
