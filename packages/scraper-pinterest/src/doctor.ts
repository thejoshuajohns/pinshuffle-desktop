import { SelectorAuditResult } from "@pinshuffle/core";
import {
  auditSelectorGroup,
  clickFirstVisible,
  launchBrowserSession,
  waitForPinterestSurface
} from "@pinshuffle/scraper-sdk";
import { getAuthProfileDir, getAuthStatePath } from "./auth-service";
import { pinterestSelectorCatalog } from "./pinterest.selectors";

export interface PinterestDiagnosticReport {
  generatedAt: string;
  checkedPinUrl: string | null;
  checks: SelectorAuditResult[];
}

export async function runPinterestDiagnostics(options: {
  pinUrl?: string;
  timeoutMs?: number;
  headless?: boolean;
}): Promise<PinterestDiagnosticReport> {
  const timeoutMs = options.timeoutMs ?? 3_000;
  const checks: SelectorAuditResult[] = [];
  const session = await launchBrowserSession({
    headless: options.headless ?? false,
    persistentProfileDir: getAuthProfileDir(),
    storageStatePath: getAuthStatePath()
  });

  try {
    await session.page.goto("https://www.pinterest.com/", {
      waitUntil: "domcontentloaded",
      timeout: 60_000
    });
    await waitForPinterestSurface(session.page, [200, 350]);

    checks.push(
      await auditSelectorGroup(
        session.page,
        "home_create_visible",
        pinterestSelectorCatalog.createBoardTrigger,
        timeoutMs
      )
    );
    checks.push(
      await auditSelectorGroup(
        session.page,
        "board_name_input_visible",
        pinterestSelectorCatalog.boardNameInput,
        timeoutMs
      )
    );

    if (options.pinUrl) {
      await session.page.goto(options.pinUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60_000
      });
      await waitForPinterestSurface(session.page, [200, 350]);

      checks.push(
        await auditSelectorGroup(
          session.page,
          "pin_board_picker_visible",
          pinterestSelectorCatalog.boardPickerTrigger,
          timeoutMs
        )
      );
      await clickFirstVisible(
        session.page,
        pinterestSelectorCatalog.boardPickerTrigger,
        timeoutMs
      );
      checks.push(
        await auditSelectorGroup(
          session.page,
          "save_dialog_ready",
          pinterestSelectorCatalog.saveDialogReady,
          timeoutMs
        )
      );
      checks.push(
        await auditSelectorGroup(
          session.page,
          "save_dialog_search_visible",
          pinterestSelectorCatalog.boardSearchInput,
          timeoutMs
        )
      );
    }
  } finally {
    await session.context.close().catch(() => undefined);
    await session.browser.close().catch(() => undefined);
  }

  return {
    generatedAt: new Date().toISOString(),
    checkedPinUrl: options.pinUrl ?? null,
    checks
  };
}
