import fs from "node:fs";
import path from "node:path";
import { launchPinterestSession } from "./auth";
import { AppConfig, PATHS } from "./config";
import { PlanFile, PlannedPin, loadPlan } from "./plan";
import {
  clickFirstVisible,
  detectBlockingMessage,
  escapeRegExp,
  fillFirstVisible,
  findFirstVisibleLocator,
  getBoardNameInputLocators,
  getBoardOptionLocators,
  getBoardPickerLocators,
  getBoardSearchInputLocators,
  getCreateBoardLocators,
  getCreateButtonLocators,
  getCreateConfirmLocators,
  getSaveButtonLocators,
  getSaveDialogReadyLocators,
  getSavedIndicatorLocators
} from "./selectors";
import { ApplyState, createInitialState, loadState, saveState } from "./state";

export interface ApplyOptions {
  dryRun: boolean;
  resume: boolean;
  maxPins?: number;
}

export async function runApply(config: AppConfig, options: ApplyOptions): Promise<void> {
  const plan = loadPlan(PATHS.plan);
  const selectedPins = limitPins(plan.selectedPins, options.maxPins);

  if (plan.destinationBoardName !== config.destinationBoardName) {
    console.warn(
      `Warning: config destination board (${config.destinationBoardName}) differs from plan (${plan.destinationBoardName}). Using plan value.`
    );
  }

  if (selectedPins.length === 0) {
    throw new Error(`No pins found in ${PATHS.plan}. Run plan first.`);
  }

  if (options.dryRun) {
    printDryRun(plan, selectedPins);
    return;
  }

  fs.mkdirSync(PATHS.debugDir, { recursive: true });

  const state = initializeState(plan, options.resume);
  const savedSet = new Set(state.savedIds);

  const session = await launchPinterestSession(true);

  try {
    await ensureDestinationBoardReady(session.page, plan.destinationBoardName, config.delayMsRange);

    for (let index = 0; index < selectedPins.length; index += 1) {
      const pin = selectedPins[index];

      if (savedSet.has(pin.id)) {
        continue;
      }

      console.log(`[${index + 1}/${selectedPins.length}] Saving ${pin.url}`);

      let success = false;
      let finalError: string | null = null;
      let finalScreenshotPath: string | undefined;

      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          await savePinToBoard(session.page, pin, plan.destinationBoardName, config.delayMsRange);
          success = true;
          break;
        } catch (error) {
          finalError = toErrorMessage(error);
          finalScreenshotPath = await captureFailureScreenshot(session.page, index, attempt);

          const blockMessage = await detectBlockingMessage(session.page);
          if (blockMessage) {
            throw new Error(`Pinterest appears blocked/rate-limited (${blockMessage}). Stopping safely.`);
          }

          console.warn(`  attempt ${attempt}/3 failed for pin ${pin.id}: ${finalError}`);

          if (attempt < 3) {
            await randomDelay(config.delayMsRange);
          }
        }
      }

      state.index = index;

      if (success) {
        savedSet.add(pin.id);
        state.savedIds = Array.from(savedSet);
        state.failures = state.failures.filter((item) => item.id !== pin.id);
        saveState(state);
        await randomDelay(config.delayMsRange);
        continue;
      }

      state.failures = state.failures.filter((item) => item.id !== pin.id);
      state.failures.push({
        id: pin.id,
        url: pin.url,
        error: finalError ?? "Unknown error",
        attempts: 3,
        lastTriedAt: new Date().toISOString(),
        screenshotPath: finalScreenshotPath
      });
      saveState(state);
    }
  } finally {
    await session.context.close();
    await session.browser.close();
  }

  const totalSaved = state.savedIds.length;
  const remaining = selectedPins.length - totalSaved;

  console.log(`Apply finished. Saved ${totalSaved}/${selectedPins.length} pins.`);
  if (state.failures.length > 0) {
    console.log(`Failures: ${state.failures.length} (see ${PATHS.state} and ${PATHS.debugDir})`);
  }
  if (remaining > 0 && state.failures.length === 0) {
    console.log(`Remaining pins skipped due to resume filtering: ${remaining}`);
  }
}

function initializeState(plan: PlanFile, resume: boolean): ApplyState {
  if (!resume) {
    const state = createInitialState(plan.destinationBoardName, plan.planHash);
    saveState(state);
    return state;
  }

  const previous = loadState(PATHS.state);
  if (!previous) {
    const state = createInitialState(plan.destinationBoardName, plan.planHash);
    saveState(state);
    return state;
  }

  if (previous.destinationBoardName !== plan.destinationBoardName) {
    console.warn("Existing state.json is for a different destination board. Starting a new state.");
    const state = createInitialState(plan.destinationBoardName, plan.planHash);
    saveState(state);
    return state;
  }

  if (previous.planHash !== plan.planHash) {
    console.warn("Existing state.json is for a different plan hash. Starting a new state.");
    const state = createInitialState(plan.destinationBoardName, plan.planHash);
    saveState(state);
    return state;
  }

  console.log(`Resume enabled: found ${previous.savedIds.length} previously saved pin IDs.`);
  return previous;
}

async function ensureDestinationBoardReady(
  page: import("playwright").Page,
  boardName: string,
  delayMsRange: [number, number]
): Promise<void> {
  await page.goto("https://www.pinterest.com/", {
    waitUntil: "domcontentloaded",
    timeout: 60_000
  });

  await randomDelay(delayMsRange);

  const blockMessage = await detectBlockingMessage(page);
  if (blockMessage) {
    throw new Error(`Pinterest appears blocked/rate-limited (${blockMessage}). Stop and retry later.`);
  }

  const openedCreate = await clickFirstVisible(getCreateButtonLocators(page), 3_000);
  if (!openedCreate) {
    console.log("Top-level Create flow not found. Board creation will fallback to the Save dialog.");
    return;
  }

  await randomDelay(delayMsRange);

  await clickFirstVisible(getCreateBoardLocators(page), 2_500);

  const filledName = await fillFirstVisible(getBoardNameInputLocators(page), boardName, 3_000);
  if (!filledName) {
    console.log("Board name input not found in top-level Create flow. Falling back to Save dialog creation.");
    return;
  }

  const submitted = await clickFirstVisible(getCreateConfirmLocators(page), 3_000);
  if (!submitted) {
    await page.keyboard.press("Enter").catch(() => undefined);
  }

  await randomDelay(delayMsRange);
  console.log(`Destination board ensured (or already existed): ${boardName}`);
}

async function savePinToBoard(
  page: import("playwright").Page,
  pin: PlannedPin,
  destinationBoardName: string,
  delayMsRange: [number, number]
): Promise<void> {
  await page.goto(pin.url, {
    waitUntil: "domcontentloaded",
    timeout: 60_000
  });

  await randomDelay(delayMsRange);

  const blockMessage = await detectBlockingMessage(page);
  if (blockMessage) {
    throw new Error(`Pinterest appears blocked/rate-limited (${blockMessage}).`);
  }

  const opened = await openSaveSurface(page);
  if (!opened) {
    throw new Error("Could not locate Save controls on pin page.");
  }

  let selectedBoard = await selectBoard(page, destinationBoardName);

  if (!selectedBoard) {
    const created = await createBoardInSaveFlow(page, destinationBoardName);
    if (!created) {
      throw new Error(`Could not find or create destination board: ${destinationBoardName}`);
    }

    await randomDelay(delayMsRange);
    selectedBoard = await selectBoard(page, destinationBoardName);
  }

  if (!selectedBoard) {
    throw new Error(`Board selection failed for: ${destinationBoardName}`);
  }

  await findFirstVisibleLocator(getSavedIndicatorLocators(page, destinationBoardName), 3_000);
}

async function openSaveSurface(page: import("playwright").Page): Promise<boolean> {
  // Safety-first: open the board picker directly so we don't quick-save to a default existing board.
  const pickerClicked = await clickFirstVisible(getBoardPickerLocators(page), 4_000);
  if (!pickerClicked) {
    return false;
  }

  const dialogVisible = await findFirstVisibleLocator(getSaveDialogReadyLocators(page), 2_000);
  return dialogVisible !== null;
}

async function selectBoard(page: import("playwright").Page, destinationBoardName: string): Promise<boolean> {
  await clickFirstVisible(getBoardPickerLocators(page), 1_500);

  const searched = await fillFirstVisible(getBoardSearchInputLocators(page), destinationBoardName, 2_500);
  if (searched) {
    await page.waitForTimeout(1_000);
  }

  const escaped = escapeRegExp(destinationBoardName);

  const clickedBoardSaveAction = await clickFirstVisible(
    [
      page.getByRole("button", { name: new RegExp(`${escaped}.*save`, "i") }),
      page.locator("button").filter({ hasText: new RegExp(`${escaped}.*save`, "i") })
    ],
    2_500
  );

  if (clickedBoardSaveAction) {
    return true;
  }

  if (await clickFirstVisible(getBoardOptionLocators(page, destinationBoardName), 2_500)) {
    return true;
  }

  const alreadySaved = await page
    .getByText(new RegExp(`${escaped}.*saved here already`, "i"))
    .first()
    .isVisible()
    .catch(() => false);

  return alreadySaved;
}

async function createBoardInSaveFlow(page: import("playwright").Page, destinationBoardName: string): Promise<boolean> {
  const openedCreateBoard = await clickFirstVisible(getCreateBoardLocators(page), 2_500);

  if (!openedCreateBoard) {
    const openedCreate = await clickFirstVisible(getCreateButtonLocators(page), 2_500);
    if (!openedCreate) {
      return false;
    }

    await clickFirstVisible(getCreateBoardLocators(page), 2_500);
  }

  const inputLocator = await findFirstVisibleLocator(getBoardNameInputLocators(page), 3_000);
  if (!inputLocator) {
    return false;
  }

  await inputLocator.click({ timeout: 3_000 });
  await inputLocator.fill("");
  await inputLocator.fill(destinationBoardName);

  const modalCreateClicked = await clickFirstVisible(
    [
      page.locator("div:has(input[name='boardName']) button:has-text('Create')"),
      page.locator("button:has-text('Create')")
    ],
    3_000
  );

  if (!modalCreateClicked) {
    await page.keyboard.press("Enter").catch(() => undefined);
  }

  await page.waitForTimeout(1_500);

  const stillVisible = await page.locator("input[name='boardName']").first().isVisible().catch(() => false);
  if (stillVisible) {
    await page.keyboard.press("Enter").catch(() => undefined);
    await page.waitForTimeout(1_000);
  }

  const createFlowStillOpen = await page.locator("input[name='boardName']").first().isVisible().catch(() => false);
  return !createFlowStillOpen;
}

function printDryRun(plan: PlanFile, pins: PlannedPin[]): void {
  console.log(`DRY RUN enabled. No save actions will be performed.`);
  console.log(`Destination board: ${plan.destinationBoardName}`);
  console.log(`Seed used: ${plan.seedUsed}`);
  console.log(`Pins to process: ${pins.length}`);
  pins.forEach((pin, index) => {
    console.log(`${index + 1}. ${pin.url} (${pin.id})`);
  });
}

function limitPins(pins: PlannedPin[], maxPins?: number): PlannedPin[] {
  if (!maxPins) {
    return pins;
  }

  return pins.slice(0, Math.max(1, maxPins));
}

async function randomDelay(range: [number, number]): Promise<void> {
  const [min, max] = range;
  const duration = min + Math.floor(Math.random() * (max - min + 1));
  await new Promise((resolve) => setTimeout(resolve, duration));
}

async function captureFailureScreenshot(
  page: import("playwright").Page,
  index: number,
  attempt: number
): Promise<string | undefined> {
  const filePath = path.resolve(PATHS.debugDir, `failure-pin-${index + 1}-attempt-${attempt}-${Date.now()}.png`);

  try {
    await page.screenshot({ path: filePath, fullPage: true });
    return filePath;
  } catch {
    return undefined;
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
