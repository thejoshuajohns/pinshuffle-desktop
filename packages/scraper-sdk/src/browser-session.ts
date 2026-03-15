import fs from "node:fs";
import type { Browser, BrowserContext, Page } from "playwright";
import { chromium } from "playwright";

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

export async function launchBrowserSession(input: {
  headless: boolean;
  persistentProfileDir?: string;
  storageStatePath?: string;
  slowMo?: number;
}): Promise<BrowserSession> {
  if (input.persistentProfileDir) {
    fs.mkdirSync(input.persistentProfileDir, { recursive: true });
    const context = await chromium.launchPersistentContext(
      input.persistentProfileDir,
      {
        headless: input.headless,
        slowMo: input.slowMo ?? 30,
        viewport: null
      }
    );
    const page = context.pages()[0] ?? (await context.newPage());
    return {
      browser: context.browser() as Browser,
      context,
      page
    };
  }

  const browser = await chromium.launch({
    headless: input.headless,
    slowMo: input.slowMo ?? 30
  });

  const context = await browser.newContext({
    storageState:
      input.storageStatePath && fs.existsSync(input.storageStatePath)
        ? input.storageStatePath
        : undefined,
    viewport: null
  });
  const page = await context.newPage();
  return {
    browser,
    context,
    page
  };
}
