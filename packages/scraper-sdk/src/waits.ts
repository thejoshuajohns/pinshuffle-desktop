import { sleep } from "@pinshuffle/core";
import type { Page } from "playwright";

export async function waitForPinterestSurface(
  page: Page,
  delayRange: [number, number]
): Promise<void> {
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await sleep(randomDelay(delayRange));
}

export async function waitForNetworkSettled(
  page: Page,
  delayRange: [number, number]
): Promise<void> {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await sleep(randomDelay(delayRange));
}

export function randomDelay(range: [number, number]): number {
  const [min, max] = range;
  return min + Math.floor(Math.random() * (max - min + 1));
}
