import { PinShuffleError } from "@pinshuffle/core";
import {
  clickFirstVisible,
  fillFirstVisible,
  findFirstVisibleLocator,
  waitForPinterestSurface
} from "@pinshuffle/scraper-sdk";
import type { Page } from "playwright";
import { assertAuthenticatedPinterestSurface } from "./auth-state";
import {
  detectBlockingMessage,
  pinterestSelectorCatalog
} from "./pinterest.selectors";

export async function navigateToPin(
  page: Page,
  pinUrl: string,
  delayMsRange: [number, number]
): Promise<void> {
  await page.goto(pinUrl, {
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
}

export async function openBoardPicker(page: Page): Promise<void> {
  const openedPicker = await clickFirstVisible(
    page,
    pinterestSelectorCatalog.boardPickerTrigger,
    4_000
  );
  if (!openedPicker) {
    throw new PinShuffleError(
      "SAVE_SURFACE_MISSING",
      "Could not locate board picker controls on the pin page."
    );
  }

  const dialogVisible = await findFirstVisibleLocator(
    page,
    pinterestSelectorCatalog.saveDialogReady,
    2_500
  );
  if (!dialogVisible) {
    await assertAuthenticatedPinterestSurface(
      page,
      "Pinterest session expired while saving a pin. Re-run login to re-authenticate."
    );
    throw new PinShuffleError(
      "SAVE_DIALOG_MISSING",
      "Save dialog did not become ready."
    );
  }
}

export async function selectOrCreateBoard(
  page: Page,
  destinationBoardName: string,
  delayMsRange: [number, number]
): Promise<void> {
  await assertAuthenticatedPinterestSurface(
    page,
    "Pinterest session expired while saving a pin. Re-run login to re-authenticate."
  );
  await fillFirstVisible(
    page,
    pinterestSelectorCatalog.boardSearchInput,
    destinationBoardName,
    2_500
  );
  const boardClicked = await clickFirstVisible(
    page,
    pinterestSelectorCatalog.boardOption(destinationBoardName),
    2_500
  );
  if (!boardClicked) {
    const created = await clickFirstVisible(
      page,
      pinterestSelectorCatalog.createBoardTrigger,
      2_500
    );
    if (!created) {
      throw new PinShuffleError(
        "BOARD_NOT_FOUND",
        `Could not find or create destination board: ${destinationBoardName}`
      );
    }

    await fillFirstVisible(
      page,
      pinterestSelectorCatalog.boardNameInput,
      destinationBoardName,
      3_000
    );
    await clickFirstVisible(
      page,
      pinterestSelectorCatalog.createConfirm,
      3_000
    );
    await waitForPinterestSurface(page, delayMsRange);
    await clickFirstVisible(
      page,
      pinterestSelectorCatalog.boardOption(destinationBoardName),
      2_500
    );
  }
}

export async function confirmPinSaved(
  page: Page,
  destinationBoardName: string
): Promise<void> {
  const saved = await findFirstVisibleLocator(
    page,
    pinterestSelectorCatalog.savedIndicator(destinationBoardName),
    3_000
  );
  if (!saved) {
    throw new PinShuffleError(
      "SAVE_CONFIRMATION_MISSING",
      `Did not observe a saved indicator for board ${destinationBoardName}.`
    );
  }
}
