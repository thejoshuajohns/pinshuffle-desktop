import fs from "node:fs";
import path from "node:path";
import {
  AppConfig,
  BoardPublisher,
  BoardRef,
  PinShuffleError,
  PublishProgress,
  PublishRequest
} from "@pinshuffle/core";
import {
  captureScreenshot,
  clickFirstVisible,
  executeWithRetry,
  fillFirstVisible,
  launchBrowserSession,
  waitForPinterestSurface
} from "@pinshuffle/scraper-sdk";
import type { Page } from "playwright";
import { getAuthProfileDir, getAuthStatePath } from "./auth-service";
import { assertAuthenticatedPinterestSurface } from "./auth-state";
import {
  navigateToPin,
  openBoardPicker,
  selectOrCreateBoard,
  confirmPinSaved
} from "./pin-save-flow";
import {
  detectBlockingMessage,
  pinterestSelectorCatalog
} from "./pinterest.selectors";

export class PinterestBoardPublisher implements BoardPublisher {
  async ensureBoard(config: AppConfig): Promise<BoardRef> {
    const session = await launchBrowserSession({
      headless: config.headless,
      persistentProfileDir: getAuthProfileDir(),
      storageStatePath: getAuthStatePath()
    });

    try {
      return await ensureDestinationBoardReady(
        session.page,
        config.destinationBoardName,
        config.delayMsRange
      );
    } finally {
      await session.context.close().catch(() => undefined);
      await session.browser.close().catch(() => undefined);
    }
  }

  async *publishPins(request: PublishRequest): AsyncIterable<PublishProgress> {
    const session = await launchBrowserSession({
      headless: request.config.headless,
      persistentProfileDir: getAuthProfileDir(),
      storageStatePath: getAuthStatePath()
    });
    fs.mkdirSync(path.resolve("debug"), { recursive: true });

    try {
      let board = await ensureDestinationBoardReady(
        session.page,
        request.plan.destinationBoardName,
        request.config.delayMsRange
      );

      const totalPins = request.maxPins
        ? Math.min(request.maxPins, request.plan.selectedPins.length)
        : request.plan.selectedPins.length;
      const pins = request.plan.selectedPins.slice(0, totalPins);

      for (let index = 0; index < pins.length; index += 1) {
        const pin = pins[index];
        let attempts = 0;

        try {
          await executeWithRetry(
            async (attempt) => {
              attempts = attempt;
              const boardUrl = await savePinToBoard(
                session.page,
                pin.url,
                request.plan.destinationBoardName,
                request.config.delayMsRange
              );
              if (boardUrl && board.url !== boardUrl) {
                board = { ...board, url: boardUrl };
              }
            },
            {},
            async (attempt, error) => {
              request.logger.warn(
                {
                  attempt,
                  pinId: pin.id,
                  error: error instanceof Error ? error.message : String(error)
                },
                "Retrying Pinterest publish"
              );
            }
          );

          yield {
            index,
            total: pins.length,
            pin,
            attempts,
            status: "saved",
            board
          };
        } catch (error) {
          const screenshotPath = await captureScreenshot(
            session.page,
            path.resolve("debug"),
            `publish-failure-${pin.id}`
          );
          yield {
            index,
            total: pins.length,
            pin,
            attempts: Math.max(1, attempts),
            status: "failed",
            board,
            screenshotPath,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }
    } finally {
      await session.context.close().catch(() => undefined);
      await session.browser.close().catch(() => undefined);
    }
  }
}

async function ensureDestinationBoardReady(
  page: Page,
  boardName: string,
  delayMsRange: [number, number]
): Promise<BoardRef> {
  await page.goto("https://www.pinterest.com/", {
    waitUntil: "domcontentloaded",
    timeout: 60_000
  });
  await waitForPinterestSurface(page, delayMsRange);
  await assertAuthenticatedPinterestSurface(
    page,
    "Pinterest needs you to sign in again before saving pins."
  );

  const bodyText = (await page.textContent("body").catch(() => "")) ?? "";
  const blockMessage = detectBlockingMessage(bodyText);
  if (blockMessage) {
    throw new PinShuffleError(
      "PINTEREST_BLOCKED",
      `Pinterest appears blocked/rate-limited (${blockMessage}).`
    );
  }

  const openedCreate = await clickFirstVisible(
    page,
    pinterestSelectorCatalog.createBoardTrigger,
    3_000
  );
  if (openedCreate) {
    await waitForPinterestSurface(page, delayMsRange);
    await fillFirstVisible(
      page,
      pinterestSelectorCatalog.boardNameInput,
      boardName,
      3_000
    );
    await clickFirstVisible(
      page,
      pinterestSelectorCatalog.createConfirm,
      3_000
    );
    await waitForPinterestSurface(page, delayMsRange);
  }

  return buildBoardRef(boardName, await discoverBoardUrl(page, boardName));
}

async function savePinToBoard(
  page: Page,
  pinUrl: string,
  destinationBoardName: string,
  delayMsRange: [number, number]
): Promise<string | undefined> {
  await navigateToPin(page, pinUrl, delayMsRange);
  await openBoardPicker(page);
  await selectOrCreateBoard(page, destinationBoardName, delayMsRange);
  await confirmPinSaved(page, destinationBoardName);
  return discoverBoardUrl(page, destinationBoardName);
}

function buildBoardRef(boardName: string, boardUrl?: string): BoardRef {
  return {
    id: boardName.toLowerCase().replace(/\s+/g, "-"),
    name: boardName,
    url: boardUrl
  };
}

async function discoverBoardUrl(
  page: Page,
  boardName: string
): Promise<string | undefined> {
  const currentUrl = page.url();
  if (looksLikeBoardUrl(currentUrl)) {
    return currentUrl;
  }

  const slug = slugify(boardName);
  if (!slug) {
    return undefined;
  }

  const candidateUrl = await page
    .evaluate((expectedSlug) => {
      const links = Array.from(
        document.querySelectorAll<HTMLAnchorElement>("a[href]")
      ).map((link) => link.href);
      return (
        links.find((href) => {
          try {
            const parsed = new URL(href);
            return (
              parsed.hostname.toLowerCase().includes("pinterest.") &&
              parsed.pathname.toLowerCase().includes(`/${expectedSlug}`)
            );
          } catch {
            return false;
          }
        }) ?? null
      );
    }, slug)
    .catch(() => null);

  return candidateUrl && looksLikeBoardUrl(candidateUrl)
    ? candidateUrl
    : undefined;
}

function looksLikeBoardUrl(value: string | null | undefined): value is string {
  if (!value) {
    return false;
  }

  try {
    const parsed = new URL(value);
    const parts = parsed.pathname.split("/").filter(Boolean);
    return parsed.hostname.toLowerCase().includes("pinterest.") && parts.length >= 2;
  } catch {
    return false;
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
