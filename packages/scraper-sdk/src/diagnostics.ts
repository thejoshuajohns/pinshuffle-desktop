import path from "node:path";
import fs from "node:fs";
import type { Page } from "playwright";

export async function captureScreenshot(
  page: Page,
  directory: string,
  prefix: string
): Promise<string | undefined> {
  fs.mkdirSync(directory, { recursive: true });
  const filePath = path.resolve(directory, `${prefix}-${Date.now()}.png`);

  try {
    await page.screenshot({ path: filePath, fullPage: true });
    return filePath;
  } catch {
    return undefined;
  }
}

export async function extractBodyText(page: Page): Promise<string> {
  return (await page.textContent("body").catch(() => "")) ?? "";
}
