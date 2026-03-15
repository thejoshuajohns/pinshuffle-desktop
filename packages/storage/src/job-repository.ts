import {
  AppConfig,
  JobRecord,
  JobRepository,
  createJobId
} from "@pinshuffle/core";
import { readJsonFile, writeJsonFile } from "./fs-utils";
import { FileSystemArtifactStore } from "./artifact-store";
import { getJobDir, getJobFile, workspacePaths } from "./paths";

interface CurrentJobPointer {
  jobId: string;
  updatedAt: string;
}

export class FileSystemJobRepository implements JobRepository {
  constructor(private readonly artifacts: FileSystemArtifactStore) {}

  async create(input: {
    config: AppConfig;
    dryRun: boolean;
    resume: boolean;
    configPath?: string;
    jobId?: string;
  }): Promise<JobRecord> {
    const now = new Date().toISOString();
    const jobId = input.jobId ?? createJobId("pinshuffle");
    await this.artifacts.ensureJobDir(jobId);

    const job: JobRecord = {
      id: jobId,
      status: "created",
      createdAt: now,
      updatedAt: now,
      destinationBoardName: input.config.destinationBoardName,
      sourceBoardUrls: input.config.sourceBoardUrls,
      dryRun: input.dryRun,
      resume: input.resume,
      configPath: input.configPath,
      artifacts: {
        configFilePath: workspacePaths.rootConfig
      }
    };

    await this.save(job);
    await this.setCurrentJobId(jobId);
    return job;
  }

  async get(jobId: string): Promise<JobRecord | null> {
    return readJsonFile<JobRecord>(getJobFile(jobId));
  }

  async getCurrentJobId(): Promise<string | null> {
    const pointer = readJsonFile<CurrentJobPointer>(
      workspacePaths.currentJobFile
    );
    return pointer?.jobId ?? null;
  }

  async setCurrentJobId(jobId: string): Promise<void> {
    writeJsonFile(workspacePaths.currentJobFile, {
      jobId,
      updatedAt: new Date().toISOString()
    } satisfies CurrentJobPointer);
  }

  async save(job: JobRecord): Promise<JobRecord> {
    const nextJob = {
      ...job,
      updatedAt: new Date().toISOString()
    };

    writeJsonFile(getJobFile(job.id), nextJob);
    return nextJob;
  }

  async list(): Promise<JobRecord[]> {
    const fs = await import("node:fs");
    const jobsDir = workspacePaths.jobsDir;
    if (!fs.existsSync(jobsDir)) {
      return [];
    }

    return fs
      .readdirSync(jobsDir)
      .map((entry) => readJsonFile<JobRecord>(getJobFile(entry)))
      .filter((entry): entry is JobRecord => entry !== null)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  resolveJobDir(jobId: string): string {
    return getJobDir(jobId);
  }
}
