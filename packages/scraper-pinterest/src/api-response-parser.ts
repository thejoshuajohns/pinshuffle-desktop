import { BoardPin } from "@pinshuffle/core";

export interface ExtractedPins {
  pins: BoardPin[];
  boardId: string;
  bookmark?: string;
  totalPinCount?: number;
}

export function isPinterestApiResponse(url: string): boolean {
  return (
    url.includes("pinterest.com/resource/") ||
    url.includes("pinterest.com/api/") ||
    url.includes("api.pinterest.com/") ||
    url.includes("pinterest.com/_ngjs/") ||
    url.includes("BoardFeedResource") ||
    url.includes("BoardResource") ||
    url.includes("BoardSectionsResource") ||
    url.includes("PinResource")
  );
}

export function extractPinsFromApiResponse(
  body: unknown,
  boardUrl: string
): ExtractedPins {
  const result: ExtractedPins = { pins: [], boardId: "" };

  if (!body || typeof body !== "object") return result;

  const obj = body as Record<string, unknown>;

  const resourceResponse = obj["resource_response"] as
    | Record<string, unknown>
    | undefined;
  const data = resourceResponse?.["data"] ?? obj["data"];

  if (!data) return result;

  if (Array.isArray(data)) {
    result.pins = data.flatMap((item) => parsePinObject(item, boardUrl));
  } else if (typeof data === "object" && data !== null) {
    const dataObj = data as Record<string, unknown>;

    if (dataObj["id"] && dataObj["pin_count"] !== undefined) {
      result.boardId = String(dataObj["id"]);
      result.totalPinCount = Number(dataObj["pin_count"]) || undefined;
    }

    const feedItems =
      (dataObj["board_feed"] as unknown[]) ??
      (dataObj["results"] as unknown[]) ??
      (dataObj["pins"] as unknown[]);

    if (Array.isArray(feedItems)) {
      result.pins = feedItems.flatMap((item) =>
        parsePinObject(item, boardUrl)
      );
    }
  }

  const bookmarkObj = resourceResponse?.["bookmark"] ?? obj["bookmark"];
  if (typeof bookmarkObj === "string" && bookmarkObj !== "-end-") {
    result.bookmark = bookmarkObj;
  }

  return result;
}

export function parsePinObject(item: unknown, boardUrl: string): BoardPin[] {
  if (!item || typeof item !== "object") return [];

  const obj = item as Record<string, unknown>;
  const pinId = obj["id"] as string | undefined;
  if (!pinId) return [];

  const type = obj["type"] as string | undefined;
  if (type && type !== "pin" && type !== "story_pin") return [];

  const boardObj = obj["board"] as Record<string, unknown> | undefined;
  const boardId = boardObj?.["id"] as string | undefined;

  const sequence =
    (obj["pin_position"] as number | undefined) ??
    (obj["sort_order"] as number | undefined) ??
    (obj["position_index"] as number | undefined) ??
    0;

  const images = obj["images"] as Record<string, unknown> | undefined;
  const origImage = images?.["orig"] as Record<string, unknown> | undefined;
  const imageUrl = (origImage?.["url"] ??
    (obj["image_medium_url"] as string | undefined)) as string | undefined;

  return [
    {
      pinId: String(pinId),
      boardId: boardId ? String(boardId) : "",
      sequence: Number(sequence),
      title: (obj["title"] as string) ?? (obj["grid_title"] as string) ?? undefined,
      imageUrl,
      description: (obj["description"] as string) ?? undefined,
      dominantColor: (obj["dominant_color"] as string) ?? undefined,
      link: (obj["link"] as string) ?? undefined,
      createdAt: (obj["created_at"] as string) ?? undefined
    }
  ];
}
