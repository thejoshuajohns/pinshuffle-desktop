import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Browser, BrowserContext, Cookie, Page, chromium } from "playwright";
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

export interface AuthCheckOptions {
  timeoutMs: number;
}

export interface AuthCheckResult {
  authenticated: boolean;
  reason: string;
  checkedAt: string;
}

const DEFAULT_LOGIN_OPTIONS: LoginOptions = {
  promptForEnter: true,
  timeoutMs: 10 * 60_000
};

const DEFAULT_AUTH_CHECK_OPTIONS: AuthCheckOptions = {
  timeoutMs: 30_000
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
      console.log(`Verifying login session (timeout ${Math.round(resolvedOptions.timeoutMs / 1000)}s)...`);
      await waitForDetectedLogin(context, resolvedOptions.timeoutMs);
      console.log("Login session detected.");
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
  const hasStoredAuthState = fs.existsSync(PATHS.authState);
  const storageState = hasStoredAuthState ? PATHS.authState : undefined;

  if (requireAuth && !storageState) {
    throw new Error(`Missing auth state at ${PATHS.authState}. Run: npm run login`);
  }

  const browser = await chromium.launch({
    headless: false,
    slowMo: 30
  });

  let context: BrowserContext;

  try {
    context = await browser.newContext({
      storageState,
      viewport: null
    });
  } catch (error) {
    if (requireAuth) {
      await browser.close().catch(() => undefined);
      throw new Error(`Failed to load auth state from ${PATHS.authState}: ${toErrorMessage(error)}. Run: npm run login`);
    }

    console.warn(`Warning: could not load auth state from ${PATHS.authState}. Continuing without stored auth.`);
    context = await browser.newContext({ viewport: null });
  }

  if (requireAuth) {
    const authCheck = await probeAuthenticatedContext(context, 20_000);
    if (!authCheck.authenticated) {
      await context.close().catch(() => undefined);
      await browser.close().catch(() => undefined);
      throw new Error(`Stored Pinterest session is not authenticated (${authCheck.reason}). Run: npm run login`);
    }
  }

  const page = await context.newPage();
  return { browser, context, page };
}

export async function checkStoredPinterestAuth(options: Partial<AuthCheckOptions> = {}): Promise<AuthCheckResult> {
  const resolvedOptions: AuthCheckOptions = {
    ...DEFAULT_AUTH_CHECK_OPTIONS,
    ...options
  };

  if (!fs.existsSync(PATHS.authState)) {
    return {
      authenticated: false,
      reason: `Missing auth state at ${PATHS.authState}`,
      checkedAt: new Date().toISOString()
    };
  }

  let browser: Browser | null = null;
  let launchError: unknown;
  for (const headless of [true, false]) {
    try {
      browser = await chromium.launch({ headless });
      break;
    } catch (error) {
      launchError = error;
    }
  }

  if (!browser) {
    return {
      authenticated: false,
      reason: `Failed to launch Chromium for auth check: ${toErrorMessage(launchError)}`,
      checkedAt: new Date().toISOString()
    };
  }

  let context: BrowserContext | null = null;

  try {
    try {
      context = await browser.newContext({
        storageState: PATHS.authState,
        viewport: { width: 1365, height: 900 }
      });
    } catch (error) {
      return {
        authenticated: false,
        reason: `Auth state could not be loaded: ${toErrorMessage(error)}`,
        checkedAt: new Date().toISOString()
      };
    }

    return await probeAuthenticatedContext(context, resolvedOptions.timeoutMs);
  } finally {
    if (context) {
      await context.close().catch(() => undefined);
    }
    await browser.close().catch(() => undefined);
  }
}

export function clearSavedAuthState(): boolean {
  if (!fs.existsSync(PATHS.authState)) {
    return false;
  }

  fs.rmSync(PATHS.authState, { force: true });
  return true;
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
    const hasSession = hasUnexpiredSessionCookie(cookies);

    if (hasSession) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }

  throw new Error(
    `Timed out waiting for login detection after ${Math.round(timeoutMs / 1000)}s. You can retry with a larger --timeout-ms value.`
  );
}

async function probeAuthenticatedContext(context: BrowserContext, timeoutMs: number): Promise<AuthCheckResult> {
  const probePage = await context.newPage();
  const navigationTimeout = Math.max(5_000, Math.min(timeoutMs, 60_000));

  try {
    await probePage.goto("https://www.pinterest.com/settings/", {
      waitUntil: "domcontentloaded",
      timeout: navigationTimeout
    });

    const finalUrl = probePage.url();
    if (isLoginLikeUrl(finalUrl)) {
      return {
        authenticated: false,
        reason: `Redirected to login (${finalUrl})`,
        checkedAt: new Date().toISOString()
      };
    }

    const cookies = await context.cookies("https://www.pinterest.com").catch(() => []);
    if (!hasUnexpiredSessionCookie(cookies)) {
      return {
        authenticated: false,
        reason: "Session cookie is missing or expired",
        checkedAt: new Date().toISOString()
      };
    }

    return {
      authenticated: true,
      reason: "Authenticated Pinterest session verified",
      checkedAt: new Date().toISOString()
    };
  } catch (error) {
    return {
      authenticated: false,
      reason: toErrorMessage(error),
      checkedAt: new Date().toISOString()
    };
  } finally {
    await probePage.close().catch(() => undefined);
  }
}

function hasUnexpiredSessionCookie(cookies: Cookie[]): boolean {
  const nowSeconds = Math.floor(Date.now() / 1000);

  return cookies.some((cookie) => {
    if (!cookie.name.toLowerCase().includes("sess")) {
      return false;
    }

    if (!Number.isFinite(cookie.expires) || cookie.expires === -1) {
      return true;
    }

    return cookie.expires > nowSeconds;
  });
}

function isLoginLikeUrl(url: string): boolean {
  const normalized = url.toLowerCase();
  return normalized.includes("/login") || normalized.includes("/signup");
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
