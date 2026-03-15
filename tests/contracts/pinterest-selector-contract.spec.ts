import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { auditSelectorGroup } from "@pinshuffle/scraper-sdk";
import {
  detectBlockingMessage,
  pinterestSelectorCatalog
} from "@pinshuffle/scraper-pinterest";

test("home and pin fixtures satisfy the Pinterest selector catalog", async ({
  page
}) => {
  const homeHtml = fs.readFileSync(
    path.join(process.cwd(), "tests/contracts/fixtures/home.html"),
    "utf8"
  );
  await page.setContent(homeHtml);

  const createCheck = await auditSelectorGroup(
    page,
    "create",
    pinterestSelectorCatalog.createBoardTrigger
  );
  const boardNameCheck = await auditSelectorGroup(
    page,
    "board-name",
    pinterestSelectorCatalog.boardNameInput
  );

  expect(createCheck.ok).toBeTruthy();
  expect(boardNameCheck.ok).toBeTruthy();

  const pinHtml = fs.readFileSync(
    path.join(process.cwd(), "tests/contracts/fixtures/pin.html"),
    "utf8"
  );
  await page.setContent(pinHtml);

  const pickerCheck = await auditSelectorGroup(
    page,
    "picker",
    pinterestSelectorCatalog.boardPickerTrigger
  );
  const searchCheck = await auditSelectorGroup(
    page,
    "search",
    pinterestSelectorCatalog.boardSearchInput
  );
  const saveCheck = await auditSelectorGroup(
    page,
    "saved",
    pinterestSelectorCatalog.savedIndicator("Mood Board")
  );

  expect(pickerCheck.ok).toBeTruthy();
  expect(searchCheck.ok).toBeTruthy();
  expect(saveCheck.ok).toBeTruthy();
});

test("blocking message detection catches rate limit copy", async () => {
  expect(
    detectBlockingMessage("Try again later due to suspicious activity")
  ).toMatch(/try again later/i);
});
