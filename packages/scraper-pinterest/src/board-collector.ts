import { AppConfig, PinBatch, PinRecord } from "@pinshuffle/core";
import { waitForPinterestSurface } from "@pinshuffle/scraper-sdk";
import type { Page } from "playwright";

export async function* collectPinsFromBoard(
  page: Page,
  boardUrl: string,
  config: AppConfig
): AsyncIterable<PinBatch> {
  const targetLimit =
    config.maxPinsToLoad === "all"
      ? Number.POSITIVE_INFINITY
      : config.maxPinsToLoad;
  const pinMap = new Map<string, PinRecord>();
  let previousHeight = 0;
  let noGrowthRounds = 0;
  let unchangedHeightRounds = 0;
  let round = 0;
  const maxRounds = Number.isFinite(targetLimit)
    ? Math.max(220, Number(targetLimit) * 3)
    : 3_000;

  while (pinMap.size < targetLimit && round < maxRounds) {
    round += 1;
    const visiblePins = await page.$$eval(
      "a[href*='/pin/']",
      (anchors, source) => {
        const pinRecords: Array<{
          id: string;
          url: string;
          title?: string;
          image?: string;
          sourceBoardUrl: string;
          scrapedAt: string;
        }> = [];
        const seenIds = new Set<string>();

        for (const anchor of anchors) {
          const href = (anchor as HTMLAnchorElement).href;
          if (!href) {
            continue;
          }

          const match = href.match(/\/pin\/(\d+)/i);
          if (!match) {
            continue;
          }

          const id = match[1];
          if (seenIds.has(id)) {
            continue;
          }

          seenIds.add(id);
          const imageElement = anchor.querySelector("img");
          pinRecords.push({
            id,
            url: `https://www.pinterest.com/pin/${id}/`,
            title:
              imageElement?.getAttribute("alt") ||
              anchor.getAttribute("aria-label") ||
              undefined,
            image: imageElement?.getAttribute("src") || undefined,
            sourceBoardUrl: source,
            scrapedAt: new Date().toISOString()
          });
        }

        return pinRecords;
      },
      boardUrl
    );

    const beforeCount = pinMap.size;
    for (const pin of visiblePins) {
      pinMap.set(pin.id, pin);
    }

    const afterCount = pinMap.size;
    const newPinsFound = afterCount > beforeCount;
    noGrowthRounds = newPinsFound ? 0 : noGrowthRounds + 1;

    yield {
      boardUrl,
      pins: Array.from(pinMap.values()),
      finished: false,
      stats: {
        batchSize: afterCount - beforeCount,
        uniquePinsCaptured: afterCount,
        round
      }
    };

    if (pinMap.size >= targetLimit) {
      break;
    }

    const scrollInfo = await page
      .evaluate(() => ({
        scrollTop: window.scrollY || document.documentElement.scrollTop || 0,
        scrollHeight: Math.max(
          document.body.scrollHeight,
          document.documentElement.scrollHeight
        ),
        viewportHeight:
          window.innerHeight || document.documentElement.clientHeight || 0
      }))
      .catch(() => ({
        scrollTop: 0,
        scrollHeight: previousHeight,
        viewportHeight: 0
      }));

    unchangedHeightRounds =
      scrollInfo.scrollHeight === previousHeight
        ? unchangedHeightRounds + 1
        : 0;
    previousHeight = scrollInfo.scrollHeight;
    const nearBottom =
      scrollInfo.scrollTop + scrollInfo.viewportHeight >=
      scrollInfo.scrollHeight - 260;
    const endMarkerDetected =
      round % 6 === 0 ? await detectEndOfBoardMarker(page) : false;

    if (
      (nearBottom && noGrowthRounds >= 12 && unchangedHeightRounds >= 8) ||
      (endMarkerDetected && noGrowthRounds >= 5)
    ) {
      break;
    }

    await page.mouse.wheel(0, Math.max(1800, config.batchSize * 140));
    await page
      .evaluate(
        (distance) => window.scrollBy(0, distance),
        Math.max(1800, config.batchSize * 140)
      )
      .catch(() => undefined);
    await waitForPinterestSurface(page, config.delayMsRange);
  }

  yield {
    boardUrl,
    pins: Array.from(pinMap.values()).slice(
      0,
      Number.isFinite(targetLimit) ? Number(targetLimit) : undefined
    ),
    finished: true,
    stats: {
      batchSize: 0,
      uniquePinsCaptured: pinMap.size,
      round
    }
  };
}

export async function detectEndOfBoardMarker(page: Page): Promise<boolean> {
  const bodyText = (await page.textContent("body").catch(() => "")) ?? "";
  return [
    /you'?ve reached the end/i,
    /end of results/i,
    /no more ideas/i,
    /all done/i
  ].some((pattern) => pattern.test(bodyText));
}
