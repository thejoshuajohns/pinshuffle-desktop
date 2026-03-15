import {
  AuthCheckResult,
  AuthService,
  BoardPublisher,
  BoardRef,
  PinBatch,
  PinScraper,
  PublishProgress,
  ShufflePlan,
  AppConfig
} from "@pinshuffle/core";

export class FakeAuthService implements AuthService {
  async login(): Promise<void> {}

  async checkStoredAuth(): Promise<AuthCheckResult> {
    return {
      authenticated: true,
      reason: "ok",
      checkedAt: new Date().toISOString()
    };
  }

  clearStoredAuth(): boolean {
    return true;
  }

  async ensureAuthenticated(): Promise<void> {}
}

export class FakePinScraper implements PinScraper {
  readonly pins: PinBatch[];

  constructor(
    pins?: PinBatch[]
  ) {
    this.pins = pins ?? [
      {
        boardUrl: "https://www.pinterest.com/user/board/",
        pins: [
          {
            id: "1",
            url: "https://www.pinterest.com/pin/1/",
            sourceBoardUrl: "https://www.pinterest.com/user/board/",
            scrapedAt: "2026-03-14T00:00:00.000Z"
          },
          {
            id: "2",
            url: "https://www.pinterest.com/pin/2/",
            sourceBoardUrl: "https://www.pinterest.com/user/board/",
            scrapedAt: "2026-03-14T00:00:01.000Z"
          }
        ],
        finished: true,
        stats: {
          batchSize: 2,
          uniquePinsCaptured: 2,
          round: 1
        }
      }
    ];
  }

  async *scrapeBoards(): AsyncIterable<PinBatch> {
    for (const batch of this.pins) {
      yield batch;
    }
  }
}

export class FakeBoardPublisher implements BoardPublisher {
  readonly publishedIds: string[] = [];

  async ensureBoard(_config: AppConfig): Promise<BoardRef> {
    return {
      id: "fake-board",
      name: "Fake Board"
    };
  }

  async *publishPins(request: {
    plan: ShufflePlan;
  }): AsyncIterable<PublishProgress> {
    for (let index = 0; index < request.plan.selectedPins.length; index += 1) {
      const pin = request.plan.selectedPins[index];
      this.publishedIds.push(pin.id);
      yield {
        index,
        total: request.plan.selectedPins.length,
        pin,
        attempts: 1,
        status: "saved",
        board: {
          id: "fake-board",
          name: "Fake Board"
        }
      };
    }
  }
}
