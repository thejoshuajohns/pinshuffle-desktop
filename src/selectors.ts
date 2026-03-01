import { Locator, Page } from "playwright";

export const BLOCK_PATTERNS: RegExp[] = [
  /try again later/i,
  /rate limit/i,
  /too many requests/i,
  /suspicious activity/i,
  /unusual activity/i,
  /temporarily blocked/i,
  /captcha/i
];

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function getSaveButtonLocators(page: Page): Locator[] {
  return [
    page.getByRole("button", { name: /^save$/i }),
    page.getByRole("button", { name: /save/i }),
    page.getByLabel(/save/i),
    page.locator("button", { hasText: "Save" })
  ];
}

export function getBoardPickerLocators(page: Page): Locator[] {
  return [
    page.getByRole("button", { name: /select a board to save to/i }),
    page.getByLabel(/select a board to save to/i),
    page.getByRole("button", { name: /board/i }),
    page.getByRole("button", { name: /choose/i }),
    page.getByRole("button", { name: /select/i }),
    page.locator("button[aria-haspopup='dialog']"),
    page.locator("button[aria-haspopup='menu']")
  ];
}

export function getSaveDialogReadyLocators(page: Page): Locator[] {
  return [
    page.getByRole("button", { name: /create board/i }),
    page.getByPlaceholder(/search through your boards/i),
    page.getByLabel(/search through your boards/i),
    page.locator("input[aria-label='Search through your boards']"),
    page.locator("input[name='searchBoxInput']")
  ];
}

export function getBoardSearchInputLocators(page: Page): Locator[] {
  return [
    page.getByPlaceholder(/search through your boards/i),
    page.getByLabel(/search through your boards/i),
    page.locator("input[aria-label='Search through your boards']"),
    page.locator("input[name='searchBoxInput']")
  ];
}

export function getBoardOptionLocators(page: Page, boardName: string): Locator[] {
  const escaped = escapeRegExp(boardName);
  const exact = new RegExp(`^\\s*${escaped}\\s*$`, "i");
  const contains = new RegExp(escaped, "i");

  return [
    page.getByRole("button", { name: exact }),
    page.getByRole("option", { name: exact }),
    page.getByRole("link", { name: exact }),
    page.getByText(exact),
    page.getByRole("button", { name: contains }),
    page.getByRole("option", { name: contains }),
    page.getByText(contains)
  ];
}

export function getCreateButtonLocators(page: Page): Locator[] {
  return [
    page.getByRole("button", { name: /^create$/i }),
    page.getByRole("button", { name: /create board/i }),
    page.getByRole("menuitem", { name: /create board/i }),
    page.getByRole("link", { name: /^create$/i }),
    page.getByText(/create board/i)
  ];
}

export function getCreateBoardLocators(page: Page): Locator[] {
  return [
    page.getByRole("button", { name: /create board/i }),
    page.getByRole("menuitem", { name: /create board/i }),
    page.getByText(/create board/i)
  ];
}

export function getBoardNameInputLocators(page: Page): Locator[] {
  return [
    page.getByPlaceholder(/name your board/i),
    page.locator("input[name='boardName']"),
    page.getByLabel(/board name/i),
    page.getByLabel(/name/i),
    page.getByPlaceholder(/board name/i),
    page.getByPlaceholder(/name/i),
    page.getByRole("textbox", { name: /name/i }),
    page.locator("input[type='text']")
  ];
}

export function getCreateConfirmLocators(page: Page): Locator[] {
  return [
    page.getByRole("button", { name: /^create$/i }),
    page.getByRole("button", { name: /^done$/i }),
    page.getByRole("button", { name: /^save$/i }),
    page.getByRole("button", { name: /^next$/i })
  ];
}

export function getSavedIndicatorLocators(page: Page, boardName: string): Locator[] {
  const escaped = escapeRegExp(boardName);

  return [
    page.getByRole("button", { name: /saved/i }),
    page.getByText(new RegExp(`saved\\s+to\\s+${escaped}`, "i")),
    page.getByText(/saved/i)
  ];
}

export async function findFirstVisibleLocator(candidates: Locator[], timeoutMs = 2_500): Promise<Locator | null> {
  const deadline = Date.now() + timeoutMs;

  for (const candidate of candidates) {
    const locator = candidate.first();
    const remaining = deadline - Date.now();

    if (remaining <= 0) {
      break;
    }

    try {
      await locator.waitFor({ state: "visible", timeout: remaining });
      return locator;
    } catch {
      // Try next selector fallback.
    }
  }

  return null;
}

export async function clickFirstVisible(candidates: Locator[], timeoutMs = 2_500): Promise<boolean> {
  const locator = await findFirstVisibleLocator(candidates, timeoutMs);

  if (!locator) {
    return false;
  }

  try {
    await locator.click({ timeout: timeoutMs });
  } catch {
    await locator.click({ timeout: timeoutMs, force: true });
  }

  return true;
}

export async function fillFirstVisible(candidates: Locator[], value: string, timeoutMs = 2_500): Promise<boolean> {
  const locator = await findFirstVisibleLocator(candidates, timeoutMs);

  if (!locator) {
    return false;
  }

  await locator.click({ timeout: timeoutMs });
  await locator.fill("");
  await locator.fill(value);
  return true;
}

export async function detectBlockingMessage(page: Page): Promise<string | null> {
  const bodyText = (await page.textContent("body").catch(() => "")) ?? "";

  for (const pattern of BLOCK_PATTERNS) {
    const match = bodyText.match(pattern);
    if (match) {
      return match[0];
    }
  }

  return null;
}
