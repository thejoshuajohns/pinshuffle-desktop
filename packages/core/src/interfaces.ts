import type { Logger } from "pino";
import {
  AppConfig,
  AuthCheckResult,
  BoardFeedCapture,
  BoardPin,
  BoardRef,
  JobRecord,
  PinBatch,
  PinRecord,
  PublishProgress,
  ReorderInstruction,
  ReorderProgress,
  SelectorAuditResult,
  ShufflePlan,
  ShuffleRun,
  StepName,
  StepResult
} from "./index";
import { PipelineEvent } from "./events";

export interface LoginOptions {
  promptForEnter: boolean;
  timeoutMs: number;
}

export interface PipelineRunOptions {
  dryRun?: boolean;
  resume?: boolean;
  startAt?: StepName;
  endAt?: StepName;
  maxPins?: number;
  configPath?: string;
  jobId?: string;
}

export interface AuthService {
  login(options: Partial<LoginOptions>): Promise<void>;
  checkStoredAuth(timeoutMs: number): Promise<AuthCheckResult>;
  clearStoredAuth(): boolean;
  ensureAuthenticated(config: AppConfig): Promise<void>;
}

export interface PinScrapeRequest {
  config: AppConfig;
  logger: Logger;
  signal?: AbortSignal;
}

export interface PinScraper {
  scrapeBoards(request: PinScrapeRequest): AsyncIterable<PinBatch>;
}

export interface PublishRequest {
  config: AppConfig;
  plan: ShufflePlan;
  logger: Logger;
  signal?: AbortSignal;
  maxPins?: number;
}

export interface BoardPublisher {
  ensureBoard(config: AppConfig, logger: Logger): Promise<BoardRef>;
  publishPins(request: PublishRequest): AsyncIterable<PublishProgress>;
}

export interface ShufflePlanner {
  createPlan(input: {
    jobId: string;
    config: AppConfig;
    pins: PinRecord[];
  }): ShufflePlan;
}

export interface JobRepository {
  create(input: {
    config: AppConfig;
    dryRun: boolean;
    resume: boolean;
    configPath?: string;
    jobId?: string;
  }): Promise<JobRecord>;
  get(jobId: string): Promise<JobRecord | null>;
  getCurrentJobId(): Promise<string | null>;
  setCurrentJobId(jobId: string): Promise<void>;
  save(job: JobRecord): Promise<JobRecord>;
  list(): Promise<JobRecord[]>;
}

export interface CheckpointStore {
  read<T>(jobId: string, key: string): Promise<T | null>;
  write<T>(jobId: string, key: string, value: T): Promise<void>;
  exists(jobId: string, key: string): Promise<boolean>;
}

export interface ArtifactStore {
  writeJson<T>(jobId: string, relativePath: string, value: T): Promise<string>;
  readJson<T>(jobId: string, relativePath: string): Promise<T | null>;
  appendJsonLine(
    jobId: string,
    relativePath: string,
    value: unknown
  ): Promise<string>;
  writeText(
    jobId: string,
    relativePath: string,
    value: string
  ): Promise<string>;
  ensureJobDir(jobId: string): Promise<string>;
  resolveJobPath(jobId: string, relativePath: string): string;
}

export interface PipelineEventBus {
  publish(event: PipelineEvent): Promise<void>;
  subscribe(listener: (event: PipelineEvent) => void): () => void;
  getEvents(jobId?: string): PipelineEvent[];
}

export interface PipelineStep {
  readonly name: StepName;
  run(context: PipelineStepContext): Promise<StepResult>;
}

// ---------------------------------------------------------------------------
// Reorder pipeline interfaces — network-first board shuffle
// ---------------------------------------------------------------------------

/** Captures board pins via network interception instead of DOM scraping. */
export interface BoardFeedInterceptor {
  captureBoardFeed(input: {
    boardUrl: string;
    headless: boolean;
    maxPins?: number;
    signal?: AbortSignal;
  }): Promise<BoardFeedCapture>;
}

/** Generates new sequence values for a set of pins. */
export interface ReorderEngine {
  generateReorderPlan(input: {
    pins: BoardPin[];
    strategy: import("./types").ShuffleStrategy;
    seed: string | null;
  }): ReorderInstruction[];
}

/** Saves pins to a board via Pinterest's internal API (repin). */
export interface BulkSaveApi {
  /** Create a new board and return its ID. */
  createBoard(
    name: string,
    context: { headers: Record<string, string>; cookies: string }
  ): Promise<{ boardId: string; boardUrl: string } | null>;

  /** Save (repin) a single pin to a board. */
  savePin(
    pinId: string,
    boardId: string,
    context: { headers: Record<string, string>; cookies: string }
  ): Promise<boolean>;

  /** Save multiple pins in order with throttling. */
  bulkSave(input: {
    pinIds: string[];
    boardId: string;
    context: { headers: Record<string, string>; cookies: string };
    delayMs?: number;
    signal?: AbortSignal;
    onProgress?: (saved: number, total: number, pinId: string) => void;
  }): Promise<BulkSaveResult>;
}

export interface BulkSaveResult {
  totalPins: number;
  savedCount: number;
  failedCount: number;
  failures: Array<{ pinId: string; error: string; attempts: number }>;
  durationMs: number;
  completedAt: string;
}

/** Full shuffle-board orchestrator — always copies to a new board. */
export interface BoardShuffler {
  shuffleBoard(input: {
    boardUrl: string;
    newBoardName: string;
    strategy?: import("./types").ShuffleStrategy;
    seed?: string | null;
    headless?: boolean;
    onProgress?: (progress: ReorderProgress) => void;
    signal?: AbortSignal;
  }): Promise<ShuffleRun>;
}

/** SQLite-backed persistence for pins, boards, and shuffle history. */
export interface ShuffleStore {
  saveBoardPins(boardId: string, pins: BoardPin[]): Promise<void>;
  getBoardPins(boardId: string): Promise<BoardPin[]>;
  saveShuffleRun(run: ShuffleRun): Promise<void>;
  getShuffleRuns(boardId?: string): Promise<ShuffleRun[]>;
  getShuffleRun(runId: string): Promise<ShuffleRun | null>;
  savePinPositions(
    runId: string,
    instructions: ReorderInstruction[]
  ): Promise<void>;
  getPinPositions(runId: string): Promise<ReorderInstruction[]>;
  close(): Promise<void>;
}

export interface PipelineStepContext {
  job: JobRecord;
  config: AppConfig;
  options: Required<Pick<PipelineRunOptions, "dryRun" | "resume">> &
    Omit<PipelineRunOptions, "dryRun" | "resume">;
  logger: Logger;
  jobRepository: JobRepository;
  checkpointStore: CheckpointStore;
  artifactStore: ArtifactStore;
  eventBus: PipelineEventBus;
  authService: AuthService;
  pinScraper: PinScraper;
  boardPublisher: BoardPublisher;
  shufflePlanner: ShufflePlanner;
  updateJob(patch: Partial<JobRecord>): Promise<JobRecord>;
  emitLog(
    level: "debug" | "info" | "warn" | "error",
    message: string,
    context?: Record<string, unknown>
  ): Promise<void>;
  auditSelectors(results: SelectorAuditResult[]): Promise<void>;
  signal?: AbortSignal;
}
