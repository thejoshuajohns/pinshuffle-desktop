import {
  launchBrowserSession,
  waitForPinterestSurface
} from "@pinshuffle/scraper-sdk";
import { getAuthProfileDir, getAuthStatePath } from "./auth-service";
import { assertAuthenticatedPinterestSurface } from "./auth-state";

export async function pickPinterestBoard(input?: {
  timeoutMs?: number;
}): Promise<{ boardUrl: string }> {
  const timeoutMs = input?.timeoutMs ?? 5 * 60_000;
  const session = await launchBrowserSession({
    headless: false,
    slowMo: 75,
    persistentProfileDir: getAuthProfileDir(),
    storageStatePath: getAuthStatePath()
  });

  try {
    await session.page.goto("https://www.pinterest.com/", {
      waitUntil: "domcontentloaded",
      timeout: 60_000
    });
    await waitForPinterestSurface(session.page, [250, 900]);
    await assertAuthenticatedPinterestSurface(
      session.page,
      "Pinterest needs you to sign in before choosing a board."
    );

    const boardUrl = await waitForBoardSelection(session.page, timeoutMs);
    return {
      boardUrl
    };
  } finally {
    await session.context.close().catch(() => undefined);
    await session.browser.close().catch(() => undefined);
  }
}

async function waitForBoardSelection(
  page: Awaited<ReturnType<typeof launchBrowserSession>>["page"],
  timeoutMs: number
): Promise<string> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (page.isClosed()) {
      throw new Error("Board selection was closed before a board was chosen.");
    }

    const currentUrl = page.url();
    if (isLikelyPinterestBoardUrl(currentUrl)) {
      return currentUrl;
    }

    await page.waitForTimeout(500);
  }

  throw new Error(
    "Timed out waiting for a Pinterest board to be selected."
  );
}

function isLikelyPinterestBoardUrl(candidateUrl: string): boolean {
  try {
    const parsed = new URL(candidateUrl);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (!parsed.hostname.toLowerCase().includes("pinterest.")) {
      return false;
    }

    if (parts.length < 2) {
      return false;
    }

    const [firstSegment] = parts;
    return ![
      "pin",
      "settings",
      "ideas",
      "search",
      "homefeed",
      "today",
      "business",
      "_tools",
      "_auth"
    ].includes(firstSegment.toLowerCase());
  } catch {
    return false;
  }
}
