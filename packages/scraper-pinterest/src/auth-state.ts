import { PinShuffleError } from "@pinshuffle/core";
import type { Page } from "playwright";

const signedOutPatterns = [
  /you are signed out/i,
  /log in to see more/i,
  /continue with email/i,
  /welcome to pinterest/i
];

export async function isSignedOutSurface(page: Page): Promise<boolean> {
  const signUpModalVisible = await page
    .locator("[data-test-id='fullPageSignupModal']")
    .first()
    .isVisible()
    .catch(() => false);
  if (signUpModalVisible) {
    return true;
  }

  const bodyText = ((await page.textContent("body").catch(() => "")) ?? "").trim();
  return signedOutPatterns.some((pattern) => pattern.test(bodyText));
}

export async function assertAuthenticatedPinterestSurface(
  page: Page,
  message: string
): Promise<void> {
  const normalizedUrl = page.url().toLowerCase();
  if (normalizedUrl.includes("/login") || normalizedUrl.includes("/signup")) {
    throw new PinShuffleError("AUTH_REQUIRED", message);
  }

  if (await isSignedOutSurface(page)) {
    throw new PinShuffleError("AUTH_REQUIRED", message);
  }
}
