import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Browser, BrowserContext, Page, chromium } from "playwright";
import { PATHS } from "./config";

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

export interface LoginOptions {
  promptForEnter: boolean;
  timeoutMs: number;
}

const DEFAULT_LOGIN_OPTIONS: LoginOptions = {
  promptForEnter: true,
  timeoutMs: 10 * 60_000
};

export async function runLogin(options: Partial<LoginOptions> = {}): Promise<void> {
  const resolvedOptions: LoginOptions = {
    ...DEFAULT_LOGIN_OPTIONS,
    ...options
  };

  fs.mkdirSync(path.dirname(PATHS.authState), { recursive: true });

  const browser = await chromium.launch({
    headless: false,
    slowMo: 75
  });

  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();

  try {
    await page.goto("https://www.pinterest.com/login/", {
      waitUntil: "domcontentloaded",
      timeout: 60_000
    });

    console.log("Browser launched in headed mode.");
    console.log("Log in to Pinterest manually. No password is read or stored by this tool.");
    if (resolvedOptions.promptForEnter) {
      console.log("After login is complete, return to this terminal and press Enter.");
      await waitForEnter();
    } else {
      console.log(`Waiting up to ${Math.round(resolvedOptions.timeoutMs / 1000)}s for login detection...`);
      await waitForDetectedLogin(context, resolvedOptions.timeoutMs);
      console.log("Login session detected.");
    }

    await context.storageState({ path: PATHS.authState });
    console.log(`Saved storage state to ${PATHS.authState}`);
  } finally {
    await context.close();
    await browser.close();
  }
}

export async function launchPinterestSession(requireAuth: boolean): Promise<BrowserSession> {
  const storageState = fs.existsSync(PATHS.authState) ? PATHS.authState : undefined;

  if (requireAuth && !storageState) {
    throw new Error(`Missing auth state at ${PATHS.authState}. Run: npm run login`);
  }

  const browser = await chromium.launch({
    headless: false,
    slowMo: 30
  });

  const context = await browser.newContext({
    storageState,
    viewport: null
  });

  const page = await context.newPage();
  return { browser, context, page };
}

async function waitForEnter(): Promise<void> {
  const rl = readline.createInterface({ input, output });
  try {
    await rl.question("");
  } finally {
    rl.close();
  }
}

async function waitForDetectedLogin(context: BrowserContext, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const cookies = await context.cookies("https://www.pinterest.com").catch(() => []);
    const hasSession = cookies.some((cookie) => cookie.name.toLowerCase().includes("sess"));

    if (hasSession) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }

  throw new Error(
    `Timed out waiting for login detection after ${Math.round(timeoutMs / 1000)}s. You can retry with a larger --timeout-ms value.`
  );
}
