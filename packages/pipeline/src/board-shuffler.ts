import {
  BoardShuffler,
  BoardFeedInterceptor,
  ReorderEngine,
  ShuffleStore,
  AuthService,
  BulkSaveApi,
  ReorderProgress,
  ShuffleRun,
  ShuffleStrategy,
  createJobId
} from "@pinshuffle/core";
import { extractApiContext } from "@pinshuffle/scraper-pinterest";

/**
 * The main `shuffleBoard()` orchestrator.
 *
 * Pipeline:
 *   1. authenticate (ensure valid session)
 *   2. fetch board pins via network interception
 *   3. generate shuffled sequence values
 *   4. create a new board and save pins in shuffled order
 *
 * Always copies to a new board — the original board is never modified.
 */
export class PinterestBoardShuffler implements BoardShuffler {
  constructor(
    private readonly authService: AuthService,
    private readonly feedInterceptor: BoardFeedInterceptor,
    private readonly reorderEngine: ReorderEngine,
    private readonly store: ShuffleStore,
    private readonly bulkSaveApi: BulkSaveApi
  ) {}

  async shuffleBoard(input: {
    boardUrl: string;
    newBoardName: string;
    strategy?: ShuffleStrategy;
    seed?: string | null;
    headless?: boolean;
    onProgress?: (progress: ReorderProgress) => void;
    signal?: AbortSignal;
  }): Promise<ShuffleRun> {
    const strategy = input.strategy ?? "random";
    const seed = input.seed ?? null;
    const headless = input.headless ?? false;
    const runId = createJobId("shuffle");

    const emit = (progress: ReorderProgress) => {
      input.onProgress?.(progress);
    };

    // -- Step 1: Authenticate --
    emit({
      step: "auth",
      phase: "started",
      message: "Verifying Pinterest authentication..."
    });

    await this.authService.ensureAuthenticated({
      sourceBoardUrls: [input.boardUrl],
      destinationBoardName: input.newBoardName,
      pinsToCopy: "all",
      maxPinsToLoad: "all",
      speedProfile: "balanced",
      seed: null,
      delayMsRange: [250, 900],
      batchSize: 20,
      shuffleStrategy: strategy,
      reorderMode: "api-first",
      scrapeConcurrency: 1,
      publishConcurrency: 1,
      loginTimeoutMs: 600_000,
      authCheckTimeoutMs: 30_000,
      headless
    });

    emit({
      step: "auth",
      phase: "completed",
      message: "Pinterest authentication verified."
    });

    // -- Step 2: Fetch board pins via network interception --
    emit({
      step: "fetch",
      phase: "started",
      message: "Capturing board pins via network interception..."
    });

    const capture = await this.feedInterceptor.captureBoardFeed({
      boardUrl: input.boardUrl,
      headless,
      signal: input.signal
    });

    emit({
      step: "fetch",
      phase: "completed",
      message: `Captured ${capture.pins.length} pins from board.`,
      detail: { total: capture.pins.length }
    });

    if (capture.pins.length === 0) {
      throw new Error(
        "No pins were captured from the board. The board may be empty or " +
          "Pinterest's API format may have changed."
      );
    }

    // Persist captured pins
    await this.store.saveBoardPins(capture.boardId, capture.pins);

    // -- Step 3: Generate shuffle order --
    emit({
      step: "shuffle",
      phase: "started",
      message: `Generating ${strategy} shuffle order for ${capture.pins.length} pins...`
    });

    const instructions = this.reorderEngine.generateReorderPlan({
      pins: capture.pins,
      strategy,
      seed
    });

    emit({
      step: "shuffle",
      phase: "completed",
      message: `Generated ${instructions.length} reorder instructions.`,
      detail: { total: instructions.length }
    });

    // Build the shuffled pin ID list (sorted by new sequence).
    // Pinterest displays pins newest-first (last saved pin appears at top),
    // so we reverse the save order: save the last-desired pin first, so it
    // ends up at the bottom, and the first-desired pin last, so it appears
    // at the top.
    const sortedInstructions = [...instructions].sort(
      (a, b) => a.newSequence - b.newSequence
    );
    const shuffledPinIds = sortedInstructions
      .map((inst) => inst.pinId)
      .reverse();

    // Create the shuffle run record
    const run: ShuffleRun = {
      id: runId,
      boardId: capture.boardId,
      boardUrl: input.boardUrl,
      strategy,
      seed,
      pinCount: capture.pins.length,
      method: "unknown",
      result: null,
      createdAt: new Date().toISOString()
    };
    await this.store.saveShuffleRun(run);
    await this.store.savePinPositions(runId, instructions);

    if (instructions.length === 0) {
      run.method = "bulk-save";
      run.result = {
        method: "bulk-save",
        totalPins: capture.pins.length,
        reorderedCount: 0,
        failedCount: 0,
        failures: [],
        durationMs: 0,
        completedAt: new Date().toISOString()
      };
      run.completedAt = new Date().toISOString();
      await this.store.saveShuffleRun(run);
      return run;
    }

    const apiContext = extractApiContext(capture.apiRequests);
    if (!apiContext) {
      throw new Error(
        "Could not extract API credentials from captured network requests. " +
          "Pinterest may have changed their API format, or the session may have expired."
      );
    }

    // -- Step 4: Create new board and save pins --
    emit({
      step: "save",
      phase: "started",
      message: `Creating new board "${input.newBoardName}"...`
    });

    const board = await this.bulkSaveApi.createBoard(
      input.newBoardName,
      apiContext
    );
    if (!board) {
      throw new Error(
        `Failed to create board "${input.newBoardName}" via API. ` +
          "Pinterest may have changed their API format, or the session may have expired."
      );
    }

    run.newBoardId = board.boardId;
    run.newBoardUrl = board.boardUrl;
    run.newBoardName = input.newBoardName;

    emit({
      step: "save",
      phase: "progress",
      message: `Board created. Saving ${shuffledPinIds.length} pins to "${input.newBoardName}"...`,
      detail: { total: shuffledPinIds.length }
    });

    const saveResult = await this.bulkSaveApi.bulkSave({
      pinIds: shuffledPinIds,
      boardId: board.boardId,
      context: apiContext,
      signal: input.signal,
      onProgress: (saved, total, pinId) => {
        emit({
          step: "save",
          phase: "progress",
          message: `Saved ${saved}/${total} pins...`,
          detail: { current: saved, total, pinId }
        });
      }
    });

    emit({
      step: "save",
      phase: "completed",
      message: `Saved ${saveResult.savedCount}/${saveResult.totalPins} pins to "${input.newBoardName}".`,
      detail: {
        current: saveResult.savedCount,
        total: saveResult.totalPins,
        method: "bulk-save"
      }
    });

    run.method = "bulk-save";
    run.result = {
      method: "bulk-save",
      totalPins: saveResult.totalPins,
      reorderedCount: saveResult.savedCount,
      failedCount: saveResult.failedCount,
      failures: saveResult.failures,
      durationMs: saveResult.durationMs,
      completedAt: saveResult.completedAt
    };
    run.completedAt = new Date().toISOString();
    await this.store.saveShuffleRun(run);

    return run;
  }
}
