import { BoardPin } from "@pinshuffle/core";
import type { Page } from "playwright";

export async function extractBoardIdFromPage(
  page: Page,
  boardUrl: string
): Promise<string> {
  const boardId = await page
    .evaluate(() => {
      const meta = document.querySelector(
        'meta[property="og:see_also"], meta[name="pinterestapp:pinboard"]'
      );
      if (meta) {
        const content = meta.getAttribute("content") ?? "";
        const match = content.match(/\/(\d+)\/?$/);
        if (match) return match[1];
      }

      const scripts = Array.from(
        document.querySelectorAll('script[type="application/json"]')
      );
      for (const script of scripts) {
        const text = script.textContent ?? "";
        const match = text.match(/"board_id"\s*:\s*"?(\d+)"?/);
        if (match) return match[1];
      }

      const w = window as unknown as Record<string, unknown>;
      const nextData = w["__NEXT_DATA__"] as Record<string, unknown> | undefined;
      if (nextData) {
        const json = JSON.stringify(nextData);
        const match = json.match(/"boardId"\s*:\s*"(\d+)"/);
        if (match) return match[1];
      }

      return "";
    })
    .catch(() => "");

  if (boardId) return boardId;

  try {
    const parsed = new URL(boardUrl);
    const parts = parsed.pathname.split("/").filter(Boolean);
    return parts.join("-");
  } catch {
    return boardUrl;
  }
}

export async function extractPinsFromDom(
  page: Page,
  boardUrl: string,
  boardId: string
): Promise<BoardPin[]> {
  return page
    .$$eval(
      "a[href*='/pin/']",
      (anchors, args) => {
        const [bUrl, bId] = args as [string, string];
        const seenIds = new Set<string>();
        const pins: Array<{
          pinId: string;
          boardId: string;
          sequence: number;
          title?: string;
          imageUrl?: string;
        }> = [];

        let index = 0;
        for (const anchor of anchors) {
          const href = (anchor as HTMLAnchorElement).href;
          const match = href?.match(/\/pin\/(\d+)/i);
          if (!match) continue;

          const pinId = match[1];
          if (seenIds.has(pinId)) continue;
          seenIds.add(pinId);

          const img = anchor.querySelector("img");
          pins.push({
            pinId,
            boardId: bId,
            sequence: index * 65536,
            title: img?.getAttribute("alt") || undefined,
            imageUrl: img?.getAttribute("src") || undefined
          });
          index++;
        }

        return pins;
      },
      [boardUrl, boardId]
    )
    .catch(() => []);
}
