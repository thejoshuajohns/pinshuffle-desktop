import {
  BoardFeedCapture,
  BoardFeedInterceptor,
  BoardPin,
  CapturedApiRequest
} from "@pinshuffle/core";
import {
  launchBrowserSession,
  waitForPinterestSurface
} from "@pinshuffle/scraper-sdk";
import { getAuthProfileDir, getAuthStatePath } from "./auth-service";
import { assertAuthenticatedPinterestSurface } from "./auth-state";
import {
  isPinterestApiResponse,
  extractPinsFromApiResponse
} from "./api-response-parser";
import {
  extractBoardIdFromPage,
  extractPinsFromDom
} from "./dom-pin-extractor";

export class PinterestBoardFeedInterceptor implements BoardFeedInterceptor {
  async captureBoardFeed(input: {
    boardUrl: string;
    headless: boolean;
    maxPins?: number;
    signal?: AbortSignal;
  }): Promise<BoardFeedCapture> {
    const session = await launchBrowserSession({
      headless: input.headless,
      persistentProfileDir: getAuthProfileDir(),
      storageStatePath: getAuthStatePath()
    });

    const pins: BoardPin[] = [];
    const apiRequests: CapturedApiRequest[] = [];
    const seenPinIds = new Set<string>();
    let boardId = "";
    let bookmark: string | undefined;
    let totalPinCount: number | undefined;
    const maxPins = input.maxPins ?? Number.POSITIVE_INFINITY;

    try {
      const page = session.page;

      page.on("response", async (response) => {
        const url = response.url();
        if (!isPinterestApiResponse(url)) return;

        try {
          const request = response.request();
          apiRequests.push({
            url,
            method: request.method(),
            headers: await request.allHeaders(),
            body: request.postData() ?? undefined,
            resourceType: request.resourceType(),
            timestamp: new Date().toISOString()
          });

          const contentType = response.headers()["content-type"] ?? "";
          if (!contentType.includes("json")) return;

          const body = await response.json().catch(() => null);
          if (!body) return;

          const extracted = extractPinsFromApiResponse(body, input.boardUrl);
          if (extracted.boardId) boardId = extracted.boardId;
          if (extracted.bookmark) bookmark = extracted.bookmark;
          if (extracted.totalPinCount !== undefined) {
            totalPinCount = extracted.totalPinCount;
          }

          for (const pin of extracted.pins) {
            if (!seenPinIds.has(pin.pinId)) {
              seenPinIds.add(pin.pinId);
              pins.push(pin);
            }
          }
        } catch {
          // Silently skip unparseable responses
        }
      });

      await page.goto(input.boardUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60_000
      });
      await waitForPinterestSurface(page, [500, 1200]);
      await assertAuthenticatedPinterestSurface(
        page,
        "Pinterest needs you to sign in again before loading board pins."
      );

      if (!boardId) {
        boardId = await extractBoardIdFromPage(page, input.boardUrl);
      }

      let noNewPinsRounds = 0;
      const maxScrollRounds = Math.max(200, maxPins * 2);

      for (let round = 0; round < maxScrollRounds; round++) {
        if (input.signal?.aborted) break;
        if (pins.length >= maxPins) break;

        const beforeCount = pins.length;
        await page.mouse.wheel(0, 2400);
        await page
          .evaluate((d) => window.scrollBy(0, d), 2400)
          .catch(() => undefined);
        await waitForPinterestSurface(page, [300, 800]);

        if (pins.length === beforeCount) {
          noNewPinsRounds++;
          if (noNewPinsRounds >= 15) break;
        } else {
          noNewPinsRounds = 0;
        }
      }

      if (pins.length === 0) {
        const domPins = await extractPinsFromDom(page, input.boardUrl, boardId);
        for (const pin of domPins) {
          if (!seenPinIds.has(pin.pinId)) {
            seenPinIds.add(pin.pinId);
            pins.push(pin);
          }
        }
      }

      return {
        boardId,
        boardUrl: input.boardUrl,
        pins: pins.slice(0, Number.isFinite(maxPins) ? maxPins : undefined),
        bookmark,
        totalPinCount,
        apiRequests,
        capturedAt: new Date().toISOString()
      };
    } finally {
      await session.context.close().catch(() => undefined);
      await session.browser.close().catch(() => undefined);
    }
  }
}
