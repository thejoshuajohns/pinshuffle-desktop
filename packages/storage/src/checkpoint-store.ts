import { CheckpointStore } from "@pinshuffle/core";
import { FileSystemArtifactStore } from "./artifact-store";

export class FileSystemCheckpointStore implements CheckpointStore {
  constructor(private readonly artifacts: FileSystemArtifactStore) {}

  async read<T>(jobId: string, key: string): Promise<T | null> {
    return this.artifacts.readJson<T>(jobId, `checkpoints/${key}.json`);
  }

  async write<T>(jobId: string, key: string, value: T): Promise<void> {
    await this.artifacts.writeJson(jobId, `checkpoints/${key}.json`, value);
  }

  async exists(jobId: string, key: string): Promise<boolean> {
    const value = await this.read(jobId, key);
    return value !== null;
  }
}
