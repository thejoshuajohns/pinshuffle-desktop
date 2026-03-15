import {
  AppConfig,
  PinBatch,
  PinScrapeRequest,
  PinScraper
} from "@pinshuffle/core";
import {
  AsyncPushQueue,
  launchBrowserSession,
  waitForPinterestSurface
} from "@pinshuffle/scraper-sdk";
import type { BrowserContext } from "playwright";
import { getAuthProfileDir, getAuthStatePath } from "./auth-service";
import { assertAuthenticatedPinterestSurface } from "./auth-state";
import { detectBlockingMessage } from "./pinterest.selectors";
import { collectPinsFromBoard } from "./board-collector";

export class PinterestPinScraper implements PinScraper {
  async *scrapeBoards(request: PinScrapeRequest): AsyncIterable<PinBatch> {
    const queue = new AsyncPushQueue<PinBatch>();
    const session = await launchBrowserSession({
      headless: request.config.headless,
      persistentProfileDir: getAuthProfileDir(),
      storageStatePath: getAuthStatePath()
    });

    const runPromise = runScrapeQueue(
      session.context,
      request.config,
      request,
      queue
    )
      .then(() => {
        queue.close();
      })
      .catch((error) => {
        queue.fail(error);
      })
      .finally(async () => {
        await session.context.close().catch(() => undefined);
        await session.browser.close().catch(() => undefined);
      });

    try {
      for await (const item of queue) {
        yield item;
      }
    } finally {
      await runPromise;
    }
  }
}

async function runScrapeQueue(
  context: BrowserContext,
  config: AppConfig,
  request: PinScrapeRequest,
  queue: AsyncPushQueue<PinBatch>
): Promise<void> {
  const boardUrls = [...config.sourceBoardUrls];
  const workers = Array.from(
    { length: Math.max(1, config.scrapeConcurrency) },
    async () => {
      while (boardUrls.length > 0) {
        const boardUrl = boardUrls.shift();
        if (!boardUrl) {
          return;
        }

        const page = await context.newPage();
        try {
          request.logger.info({ boardUrl }, "Scraping board");
          await page.goto(boardUrl, {
            waitUntil: "domcontentloaded",
            timeout: 60_000
          });
          await waitForPinterestSurface(page, config.delayMsRange);
          await assertAuthenticatedPinterestSurface(
            page,
            "Pinterest needs you to sign in again before this board can be opened."
          );

          const bodyText =
            (await page.textContent("body").catch(() => "")) ?? "";
          const blockMessage = detectBlockingMessage(bodyText);
          if (blockMessage) {
            throw new Error(
              `Pinterest appears blocked/rate-limited (${blockMessage}).`
            );
          }

          for await (const batch of collectPinsFromBoard(
            page,
            boardUrl,
            config
          )) {
            queue.push(batch);
          }
        } finally {
          await page.close().catch(() => undefined);
        }
      }
    }
  );

  await Promise.all(workers);
}
