import path from "node:path";
import { ArtifactStore } from "@pinshuffle/core";
import {
  appendJsonLine,
  ensureDir,
  readJsonFile,
  writeJsonFile,
  writeTextFile
} from "./fs-utils";
import { getJobDir } from "./paths";

export class FileSystemArtifactStore implements ArtifactStore {
  async ensureJobDir(jobId: string): Promise<string> {
    const dir = getJobDir(jobId);
    ensureDir(dir);
    ensureDir(path.join(dir, "checkpoints"));
    ensureDir(path.join(dir, "artifacts"));
    ensureDir(path.join(dir, "logs"));
    ensureDir(path.join(dir, "screenshots"));
    return dir;
  }

  resolveJobPath(jobId: string, relativePath: string): string {
    return path.join(getJobDir(jobId), relativePath);
  }

  async writeJson<T>(
    jobId: string,
    relativePath: string,
    value: T
  ): Promise<string> {
    await this.ensureJobDir(jobId);
    const filePath = this.resolveJobPath(jobId, relativePath);
    writeJsonFile(filePath, value);
    return filePath;
  }

  async readJson<T>(jobId: string, relativePath: string): Promise<T | null> {
    return readJsonFile<T>(this.resolveJobPath(jobId, relativePath));
  }

  async appendJsonLine(
    jobId: string,
    relativePath: string,
    value: unknown
  ): Promise<string> {
    await this.ensureJobDir(jobId);
    const filePath = this.resolveJobPath(jobId, relativePath);
    appendJsonLine(filePath, value);
    return filePath;
  }

  async writeText(
    jobId: string,
    relativePath: string,
    value: string
  ): Promise<string> {
    await this.ensureJobDir(jobId);
    const filePath = this.resolveJobPath(jobId, relativePath);
    writeTextFile(filePath, value);
    return filePath;
  }
}
