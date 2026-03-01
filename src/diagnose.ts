import path from "node:path";
import { launchPinterestSession } from "./auth";
import { PATHS, formatPathForLog, readJsonIfExists, writeJson } from "./config";
import { PlanFile } from "./plan";
import { PinsFile } from "./scrape";
import {
  clickFirstVisible,
  detectBlockingMessage,
  findFirstVisibleLocator,
  getBoardNameInputLocators,
  getBoardPickerLocators,
  getBoardSearchInputLocators,
  getCreateBoardLocators,
  getCreateButtonLocators,
  getCreateConfirmLocators,
  getSaveButtonLocators,
  getSaveDialogReadyLocators
} from "./selectors";

export interface DiagnoseOptions {
  pinUrl?: string;
  timeoutMs?: number;
}

interface SelectorCheck {
  key: string;
  ok: boolean;
  note: string;
}

interface DiagnoseReport {
  generatedAt: string;
  checkedPinUrl: string | null;
  checks: SelectorCheck[];
}

export async function runDiagnose(options: DiagnoseOptions = {}): Promise<DiagnoseReport> {
  const timeoutMs = options.timeoutMs ?? 3_000;
  const checks: SelectorCheck[] = [];
  const checkedPinUrl = resolvePinUrl(options.pinUrl);
  const session = await launchPinterestSession(false);

  try {
    await session.page.goto("https://www.pinterest.com/", {
      waitUntil: "domcontentloaded",
      timeout: 60_000
    });

    const homeBlock = await detectBlockingMessage(session.page);
    checks.push({
      key: "home_not_blocked",
      ok: !homeBlock,
      note: homeBlock ? `Blocked text detected: ${homeBlock}` : "No obvious block/rate-limit text on home page."
    });

    const createVisible = (await findFirstVisibleLocator(getCreateButtonLocators(session.page), timeoutMs)) !== null;
    checks.push({
      key: "home_create_visible",
      ok: createVisible,
      note: createVisible ? "Create trigger found on home." : "Create trigger not found."
    });

    if (createVisible) {
      await clickFirstVisible(getCreateButtonLocators(session.page), timeoutMs);
      const createBoardVisible = (await findFirstVisibleLocator(getCreateBoardLocators(session.page), timeoutMs)) !== null;
      checks.push({
        key: "create_board_entry_visible",
        ok: createBoardVisible,
        note: createBoardVisible ? "Create board action surfaced." : "Create board action not visible."
      });

      if (createBoardVisible) {
        await clickFirstVisible(getCreateBoardLocators(session.page), timeoutMs);
      }

      const boardNameInputVisible = (await findFirstVisibleLocator(getBoardNameInputLocators(session.page), timeoutMs)) !== null;
      checks.push({
        key: "board_name_input_visible",
        ok: boardNameInputVisible,
        note: boardNameInputVisible ? "Board name input found in create flow." : "Board name input not found."
      });

      const createConfirmVisible = (await findFirstVisibleLocator(getCreateConfirmLocators(session.page), timeoutMs)) !== null;
      checks.push({
        key: "create_confirm_visible",
        ok: createConfirmVisible,
        note: createConfirmVisible ? "Create confirmation button found." : "Create confirmation button not found."
      });
    }

    if (checkedPinUrl) {
      await session.page.goto(checkedPinUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60_000
      });

      const pinBlock = await detectBlockingMessage(session.page);
      checks.push({
        key: "pin_not_blocked",
        ok: !pinBlock,
        note: pinBlock ? `Blocked text detected: ${pinBlock}` : "No obvious block/rate-limit text on pin page."
      });

      const saveButtonVisible = (await findFirstVisibleLocator(getSaveButtonLocators(session.page), timeoutMs)) !== null;
      checks.push({
        key: "pin_save_visible",
        ok: saveButtonVisible,
        note: saveButtonVisible ? "Save button found on pin page." : "Save button not found on pin page."
      });

      const boardPickerVisible = (await findFirstVisibleLocator(getBoardPickerLocators(session.page), timeoutMs)) !== null;
      checks.push({
        key: "pin_board_picker_visible",
        ok: boardPickerVisible,
        note: boardPickerVisible ? "Board picker trigger found." : "Board picker trigger not found."
      });

      if (boardPickerVisible) {
        await clickFirstVisible(getBoardPickerLocators(session.page), timeoutMs);
      } else if (saveButtonVisible) {
        await clickFirstVisible(getSaveButtonLocators(session.page), timeoutMs);
      }

      const dialogReady = (await findFirstVisibleLocator(getSaveDialogReadyLocators(session.page), timeoutMs)) !== null;
      checks.push({
        key: "save_dialog_ready",
        ok: dialogReady,
        note: dialogReady ? "Save dialog markers found." : "Save dialog did not expose expected markers."
      });

      const searchInputVisible = (await findFirstVisibleLocator(getBoardSearchInputLocators(session.page), timeoutMs)) !== null;
      checks.push({
        key: "save_dialog_search_visible",
        ok: searchInputVisible,
        note: searchInputVisible ? "Board search input found in save dialog." : "Board search input missing in save dialog."
      });

      const saveDialogCreateBoardVisible =
        (await findFirstVisibleLocator(getCreateBoardLocators(session.page), timeoutMs)) !== null;
      checks.push({
        key: "save_dialog_create_board_visible",
        ok: saveDialogCreateBoardVisible,
        note: saveDialogCreateBoardVisible ? "Create board option present in save dialog." : "Create board option missing in save dialog."
      });
    }
  } finally {
    await session.context.close();
    await session.browser.close();
  }

  const report: DiagnoseReport = {
    generatedAt: new Date().toISOString(),
    checkedPinUrl,
    checks
  };

  const stamp = report.generatedAt.replace(/[:.]/g, "-");
  const reportPath = path.resolve(PATHS.debugDir, `selector-health-${stamp}.json`);
  writeJson(reportPath, report);

  const okCount = checks.filter((check) => check.ok).length;
  console.log(`Selector diagnose report: ${okCount}/${checks.length} checks passed.`);
  console.log(`Report path: ${formatPathForLog(reportPath)}`);
  if (checkedPinUrl) {
    console.log(`Diagnostic pin URL: ${checkedPinUrl}`);
  }
  for (const check of checks) {
    console.log(`${check.ok ? "PASS" : "FAIL"} ${check.key} - ${check.note}`);
  }

  return report;
}

function resolvePinUrl(explicitUrl?: string): string | null {
  if (explicitUrl?.trim()) {
    return explicitUrl.trim();
  }

  const plan = readJsonIfExists<PlanFile>(PATHS.plan);
  if (plan?.selectedPins?.length) {
    return plan.selectedPins[0].url;
  }

  const pins = readJsonIfExists<PinsFile>(PATHS.pins);
  if (pins?.pins?.length) {
    return pins.pins[0].url;
  }

  return null;
}
