import {
  BulkSaveApi,
  BulkSaveResult,
  CapturedApiRequest,
  sleep
} from "@pinshuffle/core";

/**
 * Saves pins to a board via Pinterest's internal Repin / Save API.
 *
 * This is significantly faster than the browser-automation approach because
 * each save is a single HTTP request (~100-200ms) instead of a full page
 * navigation + DOM interaction (~3-4s per pin).
 *
 * Pinterest's resource endpoints use `application/x-www-form-urlencoded`
 * with the payload wrapped as: `source_url=...&data={"options":{...},"context":{}}`
 *
 * Known endpoints (discovered via network interception):
 * - POST /resource/RepinResource/create/  — classic repin
 * - POST /resource/PinSaveResource/create/ — newer "save pin" variant
 * - POST /api/v3/pins/                     — V3 create pin (repin via source_pin_id)
 *
 * Board creation:
 * - POST /resource/BoardResource/create/
 * - POST /api/v3/boards/
 */
export class PinterestBulkSaveApi implements BulkSaveApi {
  async createBoard(
    name: string,
    context: { headers: Record<string, string>; cookies: string }
  ): Promise<{ boardId: string; boardUrl: string } | null> {
    const endpoints = buildCreateBoardEndpoints(name);

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint.url, {
          method: endpoint.method,
          headers: {
            ...context.headers,
            cookie: context.cookies,
            "content-type": endpoint.contentType,
            "x-requested-with": "XMLHttpRequest"
          },
          body: endpoint.body
        });

        if (!response.ok) continue;

        const body = await response.json().catch(() => null);
        if (!body) continue;

        const parsed = extractBoardFromResponse(body);
        if (parsed) return parsed;
      } catch {
        // Try next endpoint
      }
    }

    return null;
  }

  async savePin(
    pinId: string,
    boardId: string,
    context: { headers: Record<string, string>; cookies: string }
  ): Promise<boolean> {
    const endpoints = buildSavePinEndpoints(pinId, boardId);

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint.url, {
          method: endpoint.method,
          headers: {
            ...context.headers,
            cookie: context.cookies,
            "content-type": endpoint.contentType,
            "x-requested-with": "XMLHttpRequest"
          },
          body: endpoint.body
        });

        if (response.ok) return true;

        // 429 = rate limited — back off and signal failure for this attempt
        if (response.status === 429) {
          await sleep(2000 + Math.random() * 3000);
          return false;
        }
      } catch {
        // Try next endpoint
      }
    }

    return false;
  }

  async bulkSave(input: {
    pinIds: string[];
    boardId: string;
    context: { headers: Record<string, string>; cookies: string };
    delayMs?: number;
    signal?: AbortSignal;
    onProgress?: (saved: number, total: number, pinId: string) => void;
  }): Promise<BulkSaveResult> {
    const startTime = Date.now();
    const delayMs = input.delayMs ?? 180;
    let savedCount = 0;
    const failures: BulkSaveResult["failures"] = [];

    for (let i = 0; i < input.pinIds.length; i++) {
      if (input.signal?.aborted) break;

      const pinId = input.pinIds[i];
      let success = false;
      let attempts = 0;

      for (let attempt = 1; attempt <= 3; attempt++) {
        attempts = attempt;
        success = await this.savePin(pinId, input.boardId, input.context);
        if (success) break;
        // Exponential backoff on retry
        await sleep(1000 * attempt);
      }

      if (success) {
        savedCount++;
        input.onProgress?.(savedCount, input.pinIds.length, pinId);
      } else {
        failures.push({
          pinId,
          error: "Failed after 3 attempts",
          attempts
        });
      }

      // Throttle between saves to avoid rate limiting
      if (i < input.pinIds.length - 1) {
        await sleep(delayMs + Math.random() * 120);
      }
    }

    return {
      totalPins: input.pinIds.length,
      savedCount,
      failedCount: failures.length,
      failures,
      durationMs: Date.now() - startTime,
      completedAt: new Date().toISOString()
    };
  }
}

// ---------------------------------------------------------------------------
// Endpoint builders
// ---------------------------------------------------------------------------

interface ApiEndpoint {
  url: string;
  method: string;
  contentType: string;
  body: string;
}

/**
 * Encodes a Pinterest resource API payload as form-urlencoded.
 * Pinterest's internal resource endpoints expect:
 *   source_url=<path>&data=<JSON string>
 */
function encodeResourceBody(
  sourceUrl: string,
  options: Record<string, unknown>
): string {
  const data = JSON.stringify({ options, context: {} });
  return `source_url=${encodeURIComponent(sourceUrl)}&data=${encodeURIComponent(data)}`;
}

function buildCreateBoardEndpoints(name: string): ApiEndpoint[] {
  return [
    // Resource-based endpoint — form-encoded (how Pinterest's frontend actually sends it)
    {
      url: "https://www.pinterest.com/resource/BoardResource/create/",
      method: "POST",
      contentType: "application/x-www-form-urlencoded",
      body: encodeResourceBody("/", {
        name,
        privacy: "public",
        description: ""
      })
    },
    // Resource-based endpoint — JSON variant (some Pinterest versions accept this)
    {
      url: "https://www.pinterest.com/resource/BoardResource/create/",
      method: "POST",
      contentType: "application/json",
      body: JSON.stringify({
        options: {
          name,
          privacy: "public",
          description: ""
        },
        context: {}
      })
    },
    // V3 API endpoint
    {
      url: "https://api.pinterest.com/v3/boards/",
      method: "POST",
      contentType: "application/json",
      body: JSON.stringify({
        name,
        privacy: "public"
      })
    }
  ];
}

function buildSavePinEndpoints(pinId: string, boardId: string): ApiEndpoint[] {
  return [
    // RepinResource — form-encoded (primary)
    {
      url: "https://www.pinterest.com/resource/RepinResource/create/",
      method: "POST",
      contentType: "application/x-www-form-urlencoded",
      body: encodeResourceBody("/pin/" + pinId + "/", {
        board_id: boardId,
        pin_id: pinId,
        is_buyable_pin: false
      })
    },
    // RepinResource — JSON variant
    {
      url: "https://www.pinterest.com/resource/RepinResource/create/",
      method: "POST",
      contentType: "application/json",
      body: JSON.stringify({
        options: {
          board_id: boardId,
          pin_id: pinId,
          is_buyable_pin: false
        },
        context: {}
      })
    },
    // PinSaveResource — form-encoded
    {
      url: "https://www.pinterest.com/resource/PinSaveResource/create/",
      method: "POST",
      contentType: "application/x-www-form-urlencoded",
      body: encodeResourceBody("/pin/" + pinId + "/", {
        board_id: boardId,
        pin_id: pinId
      })
    },
    // V3 API — create pin via source_pin_id
    {
      url: "https://api.pinterest.com/v3/pins/",
      method: "POST",
      contentType: "application/json",
      body: JSON.stringify({
        board_id: boardId,
        source_pin_id: pinId
      })
    }
  ];
}

function extractBoardFromResponse(
  body: unknown
): { boardId: string; boardUrl: string } | null {
  if (!body || typeof body !== "object") return null;
  const obj = body as Record<string, unknown>;

  // resource_response.data pattern
  const resourceResponse = obj["resource_response"] as
    | Record<string, unknown>
    | undefined;
  const data = (resourceResponse?.["data"] ?? obj["data"]) as
    | Record<string, unknown>
    | undefined;

  if (!data) return null;

  const boardId = data["id"] as string | undefined;
  const boardUrl = data["url"] as string | undefined;

  if (!boardId) return null;

  const resolvedUrl = boardUrl
    ? boardUrl.startsWith("http")
      ? boardUrl
      : `https://www.pinterest.com${boardUrl}`
    : undefined;

  return {
    boardId: String(boardId),
    boardUrl: resolvedUrl ?? `https://www.pinterest.com/board/${boardId}/`
  };
}

/**
 * Extracts CSRF token and auth headers from captured API requests.
 * Pinterest requires a CSRF token (X-CSRFToken) and session cookies
 * for authenticated API calls.
 */
export function extractApiContext(
  capturedRequests: CapturedApiRequest[]
): {
  headers: Record<string, string>;
  cookies: string;
} | null {
  const authRequest = capturedRequests.find(
    (req) =>
      (req.method === "POST" || req.method === "PUT") &&
      (req.headers["x-csrftoken"] || req.headers["x-csrf-token"])
  );

  if (!authRequest) {
    const getRequest = capturedRequests.find(
      (req) =>
        req.headers["x-csrftoken"] || req.headers["x-csrf-token"]
    );
    if (!getRequest) return null;

    return {
      headers: pickAuthHeaders(getRequest.headers),
      cookies: getRequest.headers["cookie"] ?? ""
    };
  }

  return {
    headers: pickAuthHeaders(authRequest.headers),
    cookies: authRequest.headers["cookie"] ?? ""
  };
}

function pickAuthHeaders(
  headers: Record<string, string>
): Record<string, string> {
  const picked: Record<string, string> = {};
  const keysToKeep = [
    "x-csrftoken",
    "x-csrf-token",
    "x-pinterest-app-type",
    "x-pinterest-source-url",
    "x-app-version",
    "x-pinterest-pws-handler",
    "authorization"
  ];

  for (const key of keysToKeep) {
    if (headers[key]) {
      picked[key] = headers[key];
    }
  }

  return picked;
}
