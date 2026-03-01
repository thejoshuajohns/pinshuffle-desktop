import { launchPinterestSession } from "./auth";
import { AppConfig, PATHS, writeJson } from "./config";
import { detectBlockingMessage } from "./selectors";

export interface PinRecord {
  id: string;
  url: string;
  title?: string;
  image?: string;
  sourceBoardUrl: string;
}

export interface PinsFile {
  timestamp: string;
  sourceBoardUrls: string[];
  boardSummaries: Array<{
    boardUrl: string;
    loadedPins: number;
    uniquePinsCaptured: number;
  }>;
  pins: PinRecord[];
  inProgress?: boolean;
  activeBoardUrl?: string;
}

interface PinIndex {
  entries: Map<string, PinRecord>;
  aliases: Map<string, string>;
}

interface ScrapeProgressMeta {
  round: number;
  newPinsFound: boolean;
}

const END_OF_BOARD_PATTERNS: RegExp[] = [/you'?ve reached the end/i, /end of results/i, /no more ideas/i, /all done/i];

export async function runScrape(config: AppConfig): Promise<PinsFile> {
  const session = await launchPinterestSession(false);
  const globalPinIndex = createPinIndex();
  const boardSummaries: PinsFile["boardSummaries"] = [];
  const runTimestamp = new Date().toISOString();

  const persistSnapshot = (activeBoardUrl?: string, activeBoardPins: PinRecord[] = []): void => {
    const mergedPins = dedupePins([...pinIndexValues(globalPinIndex), ...activeBoardPins]);
    const summaries = [...boardSummaries];

    if (activeBoardUrl) {
      summaries.push({
        boardUrl: activeBoardUrl,
        loadedPins: activeBoardPins.length,
        uniquePinsCaptured: activeBoardPins.length
      });
    }

    const snapshot: PinsFile = {
      timestamp: runTimestamp,
      sourceBoardUrls: config.sourceBoardUrls,
      boardSummaries: summaries,
      pins: mergedPins,
      ...(activeBoardUrl
        ? {
            inProgress: true,
            activeBoardUrl
          }
        : {})
    };

    writeJson(PATHS.pins, snapshot);
  };

  try {
    persistSnapshot();

    for (const boardUrl of config.sourceBoardUrls) {
      console.log(`Scraping board: ${boardUrl}`);

      await session.page.goto(boardUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60_000
      });

      await randomDelay(config.delayMsRange);
      const blockMessage = await detectBlockingMessage(session.page);
      if (blockMessage) {
        throw new Error(`Pinterest appears blocked/rate-limited (${blockMessage}). Stop and retry later.`);
      }

      const boardPins = await collectPinsFromBoard(
        session.page,
        boardUrl,
        config.maxPinsToLoad,
        config.delayMsRange,
        config.batchSize,
        (partialPins, meta) => {
          if (meta.newPinsFound || meta.round % 5 === 0) {
            persistSnapshot(boardUrl, partialPins);
          }
        }
      );

      for (const pin of boardPins) {
        upsertPin(globalPinIndex, pin);
      }

      boardSummaries.push({
        boardUrl,
        loadedPins: boardPins.length,
        uniquePinsCaptured: boardPins.length
      });

      persistSnapshot();
      console.log(`Captured ${boardPins.length} pins from ${boardUrl}`);
    }
  } finally {
    await session.context.close();
    await session.browser.close();
  }

  const pinsFile: PinsFile = {
    timestamp: runTimestamp,
    sourceBoardUrls: config.sourceBoardUrls,
    boardSummaries,
    pins: pinIndexValues(globalPinIndex)
  };

  writeJson(PATHS.pins, pinsFile);
  console.log(`Wrote ${pinsFile.pins.length} unique pins to ${PATHS.pins}`);
  return pinsFile;
}

async function collectPinsFromBoard(
  page: import("playwright").Page,
  boardUrl: string,
  maxPinsToLoad: number | "all",
  delayMsRange: [number, number],
  batchSize: number,
  onProgress?: (pins: PinRecord[], meta: ScrapeProgressMeta) => void
): Promise<PinRecord[]> {
  const targetLimit = maxPinsToLoad === "all" ? Number.POSITIVE_INFINITY : maxPinsToLoad;
  const pinIndex = createPinIndex();

  let noGrowthRounds = 0;
  let unchangedHeightRounds = 0;
  let previousHeight = 0;
  let rounds = 0;

  const maxRounds = Number.isFinite(targetLimit) ? Math.max(220, Number(targetLimit) * 3) : 3_000;

  while (pinIndex.entries.size < targetLimit && rounds < maxRounds) {
    rounds += 1;

    const visiblePins = await page.$$eval(
      "a[href*='/pin/']",
      (anchors, source) => {
        const pinRecords: Array<{
          id: string;
          url: string;
          title?: string;
          image?: string;
          sourceBoardUrl: string;
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
          const title = imageElement?.getAttribute("alt") || anchor.getAttribute("aria-label") || undefined;
          const image = imageElement?.getAttribute("src") || undefined;

          pinRecords.push({
            id,
            url: `https://www.pinterest.com/pin/${id}/`,
            title,
            image,
            sourceBoardUrl: source
          });
        }

        return pinRecords;
      },
      boardUrl
    );

    const beforeCount = pinIndex.entries.size;

    for (const pin of visiblePins) {
      upsertPin(pinIndex, pin);
    }

    const afterCount = pinIndex.entries.size;
    const newPinsFound = afterCount > beforeCount;
    noGrowthRounds = newPinsFound ? 0 : noGrowthRounds + 1;

    if (onProgress) {
      onProgress(pinIndexValues(pinIndex), { round: rounds, newPinsFound });
    }

    if (pinIndex.entries.size >= targetLimit) {
      break;
    }

    const scrollInfo = await page
      .evaluate(() => {
        const scrollTop =
          window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || document.scrollingElement?.scrollTop || 0;
        const scrollHeight = Math.max(
          document.body.scrollHeight,
          document.documentElement.scrollHeight,
          document.scrollingElement?.scrollHeight || 0
        );
        const viewportHeight =
          window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight || 0;

        return {
          scrollTop,
          scrollHeight,
          viewportHeight
        };
      })
      .catch(() => ({
        scrollTop: 0,
        scrollHeight: previousHeight,
        viewportHeight: 0
      }));

    unchangedHeightRounds = scrollInfo.scrollHeight === previousHeight ? unchangedHeightRounds + 1 : 0;
    previousHeight = scrollInfo.scrollHeight;

    const nearBottom = scrollInfo.scrollTop + scrollInfo.viewportHeight >= scrollInfo.scrollHeight - 260;
    const endMarkerDetected = rounds % 6 === 0 ? await detectEndOfBoardMarker(page) : false;

    if (nearBottom && noGrowthRounds >= 12 && unchangedHeightRounds >= 8) {
      console.log(`  board end detected by scroll stability at ${pinIndex.entries.size} pins`);
      break;
    }

    if (endMarkerDetected && noGrowthRounds >= 5) {
      console.log(`  board end marker detected at ${pinIndex.entries.size} pins`);
      break;
    }

    await page.mouse.wheel(0, Math.max(1800, batchSize * 140));
    await page
      .evaluate((distance) => {
        window.scrollBy(0, distance);
      }, Math.max(1800, batchSize * 140))
      .catch(() => undefined);
    await randomDelay(delayMsRange);

    if (rounds % 4 === 0) {
      const targetLabel = Number.isFinite(targetLimit) ? String(targetLimit) : "all";
      console.log(`  progress: ${pinIndex.entries.size}/${targetLabel} pins loaded`);
    }
  }

  return pinIndexValues(pinIndex).slice(0, Number.isFinite(targetLimit) ? Number(targetLimit) : undefined);
}

async function detectEndOfBoardMarker(page: import("playwright").Page): Promise<boolean> {
  const bodyText = (await page.textContent("body").catch(() => "")) ?? "";
  return END_OF_BOARD_PATTERNS.some((pattern) => pattern.test(bodyText));
}

function createPinIndex(): PinIndex {
  return {
    entries: new Map<string, PinRecord>(),
    aliases: new Map<string, string>()
  };
}

function pinIndexValues(index: PinIndex): PinRecord[] {
  return Array.from(index.entries.values());
}

function dedupePins(pins: PinRecord[]): PinRecord[] {
  const index = createPinIndex();

  for (const pin of pins) {
    upsertPin(index, pin);
  }

  return pinIndexValues(index);
}

function upsertPin(index: PinIndex, pin: PinRecord): void {
  const normalizedPin = {
    ...pin,
    url: canonicalPinUrl(pin.url)
  };

  const aliases = getPinAliases(normalizedPin);
  let primaryKey: string | null = null;

  for (const alias of aliases) {
    const existingPrimary = index.aliases.get(alias);
    if (existingPrimary) {
      primaryKey = existingPrimary;
      break;
    }
  }

  if (!primaryKey) {
    primaryKey = aliases[0] ?? `url:${normalizedPin.url}`;
  }

  const existing = index.entries.get(primaryKey);
  index.entries.set(primaryKey, {
    ...(existing ?? {}),
    ...normalizedPin
  });

  for (const alias of aliases) {
    index.aliases.set(alias, primaryKey);
  }
}

function getPinAliases(pin: PinRecord): string[] {
  const aliases = [`url:${canonicalPinUrl(pin.url)}`];

  if (pin.id.trim().length > 0) {
    aliases.unshift(`id:${pin.id.trim()}`);
  }

  return aliases;
}

function canonicalPinUrl(url: string): string {
  const trimmed = url.trim();

  try {
    const parsed = new URL(trimmed);
    const match = parsed.pathname.match(/\/pin\/(\d+)/i);

    if (match) {
      return `https://www.pinterest.com/pin/${match[1]}/`;
    }

    parsed.search = "";
    parsed.hash = "";
    parsed.pathname = `${parsed.pathname.replace(/\/+$/, "")}/`;
    return parsed.toString();
  } catch {
    return trimmed;
  }
}

async function randomDelay(range: [number, number]): Promise<void> {
  const [min, max] = range;
  const duration = min + Math.floor(Math.random() * (max - min + 1));
  await new Promise((resolve) => setTimeout(resolve, duration));
}
