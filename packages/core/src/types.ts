export type SpeedProfile = "conservative" | "balanced" | "fast";
export type ShuffleStrategy =
  | "random"
  | "board-interleave"
  | "recency-balance"
  | "visual-cluster"
  | "reverse"
  | "interleave-clusters"
  | "deterministic-seed";
export type StepName = "auth" | "scrape" | "plan" | "apply";
export type ReorderStepName = "auth" | "fetch" | "shuffle" | "save";
export type ReorderMethod = "bulk-save" | "unknown";
export type JobStatus =
  | "created"
  | "auth_ready"
  | "scraping"
  | "planned"
  | "applying"
  | "completed"
  | "failed"
  | "cancelled";

export interface PinRecord {
  id: string;
  url: string;
  sourceBoardUrl: string;
  title?: string;
  image?: string;
  scrapedAt: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface PinBatch {
  boardUrl: string;
  pins: PinRecord[];
  finished: boolean;
  stats: {
    batchSize: number;
    uniquePinsCaptured: number;
    round: number;
  };
}

export interface BoardSummary {
  boardUrl: string;
  loadedPins: number;
  uniquePinsCaptured: number;
}

export interface BoardRef {
  id: string;
  name: string;
  url?: string;
}

export interface PublishProgress {
  index: number;
  total: number;
  pin: Pick<PinRecord, "id" | "url">;
  attempts: number;
  status: "saved" | "skipped" | "failed";
  board: BoardRef;
  screenshotPath?: string;
  error?: string;
}

export interface ShufflePlan {
  jobId: string;
  destinationBoardName: string;
  strategy: ShuffleStrategy;
  seedUsed: string;
  sourceFingerprint: string;
  planHash: string;
  selectedPins: Array<
    Pick<PinRecord, "id" | "url" | "sourceBoardUrl" | "title" | "image">
  >;
  totalAvailable: number;
  createdAt: string;
}

export interface JobArtifacts {
  pinsFilePath?: string;
  planFilePath?: string;
  stateFilePath?: string;
  configFilePath?: string;
  debugDir?: string;
}

export interface JobRecord {
  id: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  destinationBoardName: string;
  sourceBoardUrls: string[];
  dryRun: boolean;
  resume: boolean;
  configPath?: string;
  currentStep?: StepName;
  latestCompletedStep?: StepName;
  error?: SerializedError;
  artifacts: JobArtifacts;
}

export interface StepResult {
  status: "success" | "skipped" | "failed";
  summary: string;
  checkpointKey?: string;
}

export interface ApplyFailure {
  id: string;
  url: string;
  error: string;
  attempts: number;
  lastTriedAt: string;
  screenshotPath?: string;
}

export interface ApplyState {
  destinationBoardName: string;
  boardUrl?: string;
  planHash: string;
  index: number;
  savedIds: string[];
  failures: ApplyFailure[];
  startedAt: string;
  updatedAt: string;
}

export interface AuthCheckResult {
  authenticated: boolean;
  reason: string;
  checkedAt: string;
}

export interface SelectorCandidate {
  key: string;
  query: string;
  kind: "role" | "label" | "placeholder" | "css" | "text";
  optional?: boolean;
}

export interface SelectorAuditResult {
  name: string;
  ok: boolean;
  matchedSelectorKey?: string;
  note: string;
}

export interface SelectorCatalog {
  boardLinks: SelectorCandidate[];
  blockingMessages: RegExp[];
  createBoardTrigger: SelectorCandidate[];
  boardNameInput: SelectorCandidate[];
  createConfirm: SelectorCandidate[];
  boardPickerTrigger: SelectorCandidate[];
  boardSearchInput: SelectorCandidate[];
  boardOption: (boardName: string) => SelectorCandidate[];
  saveDialogReady: SelectorCandidate[];
  savedIndicator: (boardName: string) => SelectorCandidate[];
}

export interface SerializedError {
  message: string;
  stack?: string;
  code?: string;
}

// ---------------------------------------------------------------------------
// Reorder types — used by the network-first board shuffle pipeline
// ---------------------------------------------------------------------------

/** A pin as returned by Pinterest's internal board feed API. */
export interface BoardPin {
  pinId: string;
  boardId: string;
  sequence: number;
  title?: string;
  imageUrl?: string;
  description?: string;
  dominantColor?: string;
  link?: string;
  createdAt?: string;
}

/** Captured Pinterest API request metadata for replay / reverse-engineering. */
export interface CapturedApiRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  resourceType: string;
  timestamp: string;
}

/** Result of intercepting board feed network requests. */
export interface BoardFeedCapture {
  boardId: string;
  boardUrl: string;
  pins: BoardPin[];
  bookmark?: string;
  totalPinCount?: number;
  apiRequests: CapturedApiRequest[];
  capturedAt: string;
}

/** A single pin reorder instruction. */
export interface ReorderInstruction {
  pinId: string;
  boardId: string;
  oldSequence: number;
  newSequence: number;
}

/** Result of a batch reorder operation. */
export interface ReorderResult {
  method: ReorderMethod;
  totalPins: number;
  reorderedCount: number;
  failedCount: number;
  failures: Array<{
    pinId: string;
    error: string;
    attempts: number;
  }>;
  durationMs: number;
  completedAt: string;
}

/** Tracks a full shuffle run for audit/history. */
export interface ShuffleRun {
  id: string;
  boardId: string;
  boardUrl: string;
  strategy: ShuffleStrategy;
  seed: string | null;
  pinCount: number;
  method: ReorderMethod;
  result: ReorderResult | null;
  createdAt: string;
  completedAt?: string;
  /** Set when shuffle copies to a new board instead of reordering in place. */
  newBoardId?: string;
  newBoardUrl?: string;
  newBoardName?: string;
}

/** Progress event emitted during the reorder pipeline. */
export interface ReorderProgress {
  step: ReorderStepName;
  phase: "started" | "progress" | "completed" | "failed";
  message: string;
  detail?: {
    current?: number;
    total?: number;
    pinId?: string;
    method?: ReorderMethod;
  };
}
