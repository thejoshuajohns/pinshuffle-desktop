import type { Locator, Page } from "playwright";
import { SelectorAuditResult, SelectorCandidate } from "@pinshuffle/core";

export interface LocatedSelector {
  locator: Locator;
  candidate: SelectorCandidate;
}

export async function findFirstVisibleLocator(
  page: Page,
  candidates: SelectorCandidate[],
  timeoutMs = 2_500
): Promise<LocatedSelector | null> {
  const deadline = Date.now() + timeoutMs;

  for (const candidate of candidates) {
    const locator = createLocator(page, candidate).first();
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      break;
    }
    const candidateTimeout = Math.min(remaining, 400);

    try {
      await locator.waitFor({ state: "visible", timeout: candidateTimeout });
      return {
        locator,
        candidate
      };
    } catch {
      // Try the next selector candidate.
    }
  }

  return null;
}

export async function clickFirstVisible(
  page: Page,
  candidates: SelectorCandidate[],
  timeoutMs = 2_500
): Promise<string | null> {
  const located = await findFirstVisibleLocator(page, candidates, timeoutMs);
  if (!located) {
    return null;
  }

  try {
    await located.locator.click({ timeout: timeoutMs });
  } catch {
    await located.locator.click({ timeout: timeoutMs, force: true });
  }

  return located.candidate.key;
}

export async function fillFirstVisible(
  page: Page,
  candidates: SelectorCandidate[],
  value: string,
  timeoutMs = 2_500
): Promise<string | null> {
  const located = await findFirstVisibleLocator(page, candidates, timeoutMs);
  if (!located) {
    return null;
  }

  await located.locator.click({ timeout: timeoutMs });
  await located.locator.fill("");
  await located.locator.fill(value);
  return located.candidate.key;
}

export async function auditSelectorGroup(
  page: Page,
  name: string,
  candidates: SelectorCandidate[],
  timeoutMs = 2_500
): Promise<SelectorAuditResult> {
  const located = await findFirstVisibleLocator(page, candidates, timeoutMs);
  if (!located) {
    return {
      name,
      ok: false,
      note: "No selector candidates matched."
    };
  }

  return {
    name,
    ok: true,
    matchedSelectorKey: located.candidate.key,
    note: "A visible selector candidate matched."
  };
}

function createLocator(page: Page, candidate: SelectorCandidate): Locator {
  switch (candidate.kind) {
    case "role": {
      const [role, name] = candidate.query.split("::");
      return page.getByRole(role as Parameters<Page["getByRole"]>[0], {
        name: new RegExp(name, "i")
      });
    }
    case "label":
      return page.getByLabel(new RegExp(candidate.query, "i"));
    case "placeholder":
      return page.getByPlaceholder(new RegExp(candidate.query, "i"));
    case "text":
      return page.getByText(new RegExp(candidate.query, "i"));
    case "css":
    default:
      return page.locator(candidate.query);
  }
}
