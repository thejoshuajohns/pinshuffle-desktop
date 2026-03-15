import { SelectorCatalog, SelectorCandidate } from "@pinshuffle/core";

const blockingMessages = [
  /try again later/i,
  /rate limit/i,
  /too many requests/i,
  /suspicious activity/i,
  /unusual activity/i,
  /temporarily blocked/i,
  /captcha/i
];

export const pinterestSelectorCatalog: SelectorCatalog = {
  boardLinks: [
    candidate("board-link-role", "link::pin", "role"),
    candidate("board-link-css", "a[href*='/pin/']", "css")
  ],
  blockingMessages,
  createBoardTrigger: [
    candidate("create-role", "button::create", "role"),
    candidate("create-board-role", "button::create board", "role"),
    candidate("create-board-text", "create board", "text")
  ],
  boardNameInput: [
    candidate("board-name-placeholder", "name your board", "placeholder"),
    candidate("board-name-css", "input[name='boardName']", "css"),
    candidate("board-name-label", "board name", "label"),
    candidate("board-name-generic", "input[type='text']", "css")
  ],
  createConfirm: [
    candidate("create-confirm-role", "button::create", "role"),
    candidate("create-done-role", "button::done", "role"),
    candidate("create-next-role", "button::next", "role")
  ],
  boardPickerTrigger: [
    candidate("board-picker-label", "select a board to save to", "label"),
    candidate("board-picker-role", "button::board", "role"),
    candidate(
      "board-picker-css-dialog",
      "button[aria-haspopup='dialog']",
      "css"
    ),
    candidate("board-picker-css-menu", "button[aria-haspopup='menu']", "css")
  ],
  boardSearchInput: [
    candidate(
      "board-search-placeholder",
      "search through your boards",
      "placeholder"
    ),
    candidate("board-search-label", "search through your boards", "label"),
    candidate("board-search-css", "input[name='searchBoxInput']", "css")
  ],
  boardOption(boardName: string): SelectorCandidate[] {
    const escaped = escapeForRegex(boardName);
    return [
      candidate("board-option-button", `button::${escaped}`, "role"),
      candidate("board-option-option", `option::${escaped}`, "role"),
      candidate("board-option-text", escaped, "text")
    ];
  },
  saveDialogReady: [
    candidate(
      "save-dialog-search",
      "search through your boards",
      "placeholder"
    ),
    candidate("save-dialog-create", "button::create board", "role"),
    candidate("save-dialog-css", "input[name='searchBoxInput']", "css")
  ],
  savedIndicator(boardName: string): SelectorCandidate[] {
    const escaped = escapeForRegex(boardName);
    return [
      candidate("saved-indicator-role", "button::saved", "role"),
      candidate("saved-indicator-text", `saved\\s+to\\s+${escaped}`, "text"),
      candidate("saved-indicator-generic", "saved", "text")
    ];
  }
};

export function detectBlockingMessage(bodyText: string): string | null {
  for (const pattern of pinterestSelectorCatalog.blockingMessages) {
    const match = bodyText.match(pattern);
    if (match) {
      return match[0];
    }
  }

  return null;
}

function candidate(
  key: string,
  query: string,
  kind: SelectorCandidate["kind"]
): SelectorCandidate {
  return {
    key,
    query,
    kind
  };
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
