import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  AppConfig,
  AuthCheckResult,
  AuthService,
  createLogger,
  LoginOptions,
  PinShuffleError
} from "@pinshuffle/core";
import {
  launchBrowserSession,
  waitForPinterestSurface
} from "@pinshuffle/scraper-sdk";
import type { BrowserContext } from "playwright";
import { assertAuthenticatedPinterestSurface } from "./auth-state";

const logger = createLogger("auth-service");
const authStatePath = path.resolve(".auth", "storageState.json");
const authProfileDir = path.resolve(".auth", "profile");

export class PinterestAuthService implements AuthService {
  async login(options: Partial<LoginOptions>): Promise<void> {
    const resolvedOptions: LoginOptions = {
      promptForEnter: options.promptForEnter ?? true,
      timeoutMs: options.timeoutMs ?? 10 * 60_000
    };

    fs.mkdirSync(path.dirname(authStatePath), { recursive: true });
    const session = await launchBrowserSession({
      headless: false,
      slowMo: 75,
      persistentProfileDir: authProfileDir
    });

    try {
      await session.page.goto("https://www.pinterest.com/login/", {
        waitUntil: "domcontentloaded",
        timeout: 60_000
      });

      logger.info("Browser launched in headed mode.");
      logger.info(
        "Log in to Pinterest manually. No password is read or stored by this tool."
      );

      if (resolvedOptions.promptForEnter) {
        logger.info(
          "After login is complete, return to this terminal and press Enter."
        );
        await waitForEnter();
      } else {
        logger.info(
          `Waiting up to ${Math.round(resolvedOptions.timeoutMs / 1000)}s for login detection...`
        );
      }

      await waitForDetectedLogin(session.context, resolvedOptions.timeoutMs);
      await session.context.storageState({ path: authStatePath });
      logger.info({ path: authStatePath }, "Saved storage state");
      logger.info({ path: authProfileDir }, "Saved browser profile");
    } finally {
      await session.context.close().catch(() => undefined);
      await session.browser.close().catch(() => undefined);
    }
  }

  async checkStoredAuth(timeoutMs: number): Promise<AuthCheckResult> {
    if (!fs.existsSync(authStatePath) && !fs.existsSync(authProfileDir)) {
      return {
        authenticated: false,
        reason: `Missing auth state at ${authStatePath} and profile at ${authProfileDir}`,
        checkedAt: new Date().toISOString()
      };
    }

    const session = await launchBrowserSession({
      headless: true,
      persistentProfileDir: authProfileDir,
      storageStatePath: authStatePath
    });

    try {
      await session.page.goto("https://www.pinterest.com/settings/", {
        waitUntil: "domcontentloaded",
        timeout: timeoutMs
      });
      await waitForPinterestSurface(session.page, [250, 900]);
      await assertAuthenticatedPinterestSurface(
        session.page,
        "Stored Pinterest session is signed out."
      );

      return {
        authenticated: true,
        reason: "Authenticated Pinterest session verified",
        checkedAt: new Date().toISOString()
      };
    } catch (error) {
      return {
        authenticated: false,
        reason: error instanceof Error ? error.message : String(error),
        checkedAt: new Date().toISOString()
      };
    } finally {
      await session.context.close().catch(() => undefined);
      await session.browser.close().catch(() => undefined);
    }
  }

  clearStoredAuth(): boolean {
    const hadState = fs.existsSync(authStatePath);
    const hadProfile = fs.existsSync(authProfileDir);
    if (!hadState && !hadProfile) {
      return false;
    }

    fs.rmSync(authStatePath, { force: true });
    fs.rmSync(authProfileDir, { recursive: true, force: true });
    return true;
  }

  async ensureAuthenticated(config: AppConfig): Promise<void> {
    const result = await this.checkStoredAuth(config.authCheckTimeoutMs);
    if (!result.authenticated) {
      throw new PinShuffleError(
        "AUTH_REQUIRED",
        `Stored Pinterest session is not authenticated (${result.reason}). Run login.`
      );
    }
  }
}

async function waitForEnter(): Promise<void> {
  const rl = readline.createInterface({ input, output });
  try {
    await rl.question("");
  } finally {
    rl.close();
  }
}

async function waitForDetectedLogin(
  context: BrowserContext,
  timeoutMs: number
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const cookies = await context
      .cookies("https://www.pinterest.com")
      .catch(() => []);
    const hasSession = cookies.some((cookie) =>
      cookie.name.toLowerCase().includes("sess")
    );
    if (hasSession) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }

  throw new Error(
    `Timed out waiting for login detection after ${Math.round(timeoutMs / 1000)}s.`
  );
}

export function getAuthStatePath(): string {
  return authStatePath;
}

export function getAuthProfileDir(): string {
  return authProfileDir;
}
