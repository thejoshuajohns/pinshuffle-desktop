const api = window.desktopApi;

const STEP_SEQUENCE = ["auth", "fetch", "shuffle", "save"];

const STEP_COPY = {
  auth: {
    eyebrow: "Authenticating",
    title: "Verifying Pinterest session",
    message: "Making sure your Pinterest session is active."
  },
  fetch: {
    eyebrow: "Fetching pins",
    title: "Capturing board data",
    message: "Intercepting network requests to extract pin data."
  },
  shuffle: {
    eyebrow: "Generating order",
    title: "Computing new positions",
    message: "Applying your chosen shuffle strategy."
  },
  save: {
    eyebrow: "Saving to new board",
    title: "Copying pins to your new board",
    message: "Saving pins in shuffled order — your original board is untouched."
  }
};

const STATUS_COPY = {
  connect: {
    eyebrow: "Step 1",
    title: "Connect Pinterest first",
    message:
      "Sign in first, then paste the board URL you want to shuffle."
  },
  connectStored: {
    eyebrow: "Step 1",
    title: "Confirm your Pinterest connection",
    message:
      "You already have a saved Pinterest sign-in. Confirm it, then paste a board URL."
  },
  connecting: {
    eyebrow: "Connecting",
    title: "Connecting to Pinterest",
    message:
      "If Pinterest opens, sign in there and then return here."
  },
  ready: {
    eyebrow: "Ready to shuffle",
    title: "Your board is selected",
    message:
      "Choose a shuffle strategy and hit Shuffle to New Board when you're ready."
  },
  success: {
    eyebrow: "Finished",
    title: "Your new board is ready!",
    message: "Open the new board on Pinterest to see the shuffled order."
  }
};

const el = {
  form: document.getElementById("shuffleForm"),
  selectedBoardCard: document.getElementById("selectedBoardCard"),
  selectedBoardName: document.getElementById("selectedBoardName"),
  selectedBoardUrl: document.getElementById("selectedBoardUrl"),
  boardUrlField: document.getElementById("boardUrlField"),
  boardUrl: document.getElementById("boardUrl"),
  manualBoardToggle: document.getElementById("manualBoardToggle"),
  changeBoardButton: document.getElementById("changeBoardButton"),
  strategyField: document.getElementById("strategyField"),
  seedField: document.getElementById("seedField"),
  shuffleSeed: document.getElementById("shuffleSeed"),
  newBoardNameField: document.getElementById("newBoardNameField"),
  newBoardName: document.getElementById("newBoardName"),
  previewPanel: document.getElementById("previewPanel"),
  previewCount: document.getElementById("previewCount"),
  previewList: document.getElementById("previewList"),
  actionButtons: document.getElementById("actionButtons"),
  previewAction: document.getElementById("previewAction"),
  primaryAction: document.getElementById("primaryAction"),
  formHint: document.getElementById("formHint"),
  statusPanel: document.getElementById("statusPanel"),
  statusEyebrow: document.getElementById("statusEyebrow"),
  statusTitle: document.getElementById("statusTitle"),
  statusMessage: document.getElementById("statusMessage"),
  progressList: document.getElementById("progressList"),
  successActions: document.getElementById("successActions"),
  openBoardButton: document.getElementById("openBoardButton"),
  shuffleAnotherButton: document.getElementById("shuffleAnotherButton")
};

const uiState = {
  currentRunId: null,
  storedAuthAvailable: false,
  isConnected: false,
  isConnecting: false,
  running: false,
  selectedBoardUrl: "",
  selectedBoardLabel: "",
  selectedStrategy: "random",
  newBoardName: "",
  lastNewBoardUrl: null,
  previewPins: [],
  errorCopy: null,
  keepProgressVisibleOnError: false
};

void bootstrap();

api.onPipelineEvent((event) => {
  handlePipelineEvent(event);
});

el.form.addEventListener("submit", (event) => {
  event.preventDefault();
  void handlePrimaryAction();
});

el.boardUrl.addEventListener("input", handleBoardUrlChange);

el.changeBoardButton.addEventListener("click", () => {
  uiState.selectedBoardUrl = "";
  uiState.selectedBoardLabel = "";
  uiState.previewPins = [];
  el.boardUrl.value = "";
  el.boardUrl.classList.remove("invalid");
  clearCompletionState();
  syncUi();
});

el.previewAction.addEventListener("click", () => void handlePreview());
el.openBoardButton.addEventListener("click", () => void openBoard());
el.shuffleAnotherButton.addEventListener("click", resetForAnotherBoard);

// Strategy radio buttons
document.querySelectorAll('input[name="strategy"]').forEach((radio) => {
  radio.addEventListener("change", (e) => {
    uiState.selectedStrategy = e.target.value;
    el.seedField.hidden = e.target.value !== "deterministic-seed";
    syncUi();
  });
});

el.newBoardName.addEventListener("input", () => {
  uiState.newBoardName = el.newBoardName.value.trim();
});

async function bootstrap() {
  resetProgressSteps();
  showProgress(false);
  showSuccessActions(false);
  await refreshAuthStatus();
  syncUi();
}

function handleBoardUrlChange() {
  uiState.errorCopy = null;
  uiState.keepProgressVisibleOnError = false;

  if (uiState.lastNewBoardUrl) {
    clearCompletionState();
  }

  const url = el.boardUrl.value.trim();
  if (url && isLikelyPinterestBoardUrl(url)) {
    setSelectedBoard(url);
  } else {
    uiState.selectedBoardUrl = "";
    uiState.selectedBoardLabel = "";
  }

  if (!uiState.running) {
    el.boardUrl.classList.toggle(
      "invalid",
      Boolean(url) && !isLikelyPinterestBoardUrl(url)
    );
  }

  syncUi();
}

async function handlePrimaryAction() {
  if (isBusy()) return;

  if (!uiState.isConnected) {
    await connectPinterest();
    return;
  }

  if (!uiState.selectedBoardUrl) {
    const url = el.boardUrl.value.trim();
    if (!url || !isLikelyPinterestBoardUrl(url)) {
      uiState.errorCopy = {
        eyebrow: "Board link needed",
        title: "Paste a valid Pinterest board URL",
        message: "Use a full Pinterest board link like https://www.pinterest.com/user/board/."
      };
      syncUi();
      return;
    }
    setSelectedBoard(url);
    syncUi();
    return;
  }

  await startShuffle();
}

async function connectPinterest() {
  uiState.isConnecting = true;
  uiState.errorCopy = null;
  syncUi();

  try {
    let result = await api.checkAuth(30_000);
    if (!result.authenticated) {
      await api.login({ promptForEnter: false, timeoutMs: 900_000 });
      result = await api.checkAuth(30_000);
    }

    if (!result.authenticated) {
      throw new Error(result.reason || "Pinterest sign-in could not be confirmed.");
    }

    uiState.storedAuthAvailable = true;
    uiState.isConnected = true;
  } catch (error) {
    uiState.storedAuthAvailable = false;
    uiState.isConnected = false;
    uiState.errorCopy = {
      eyebrow: "Sign-in didn't finish",
      title: "Pinterest still needs to connect",
      message: humanizeError(error)
    };
  } finally {
    uiState.isConnecting = false;
    syncUi();
  }
}

async function handlePreview() {
  if (!uiState.selectedBoardUrl || isBusy()) return;

  uiState.running = true;
  uiState.errorCopy = null;
  syncUi();

  try {
    const result = await api.previewShuffle({
      boardUrl: uiState.selectedBoardUrl,
      strategy: uiState.selectedStrategy,
      seed: el.shuffleSeed?.value.trim() || null
    });

    uiState.previewPins = result.pins || [];
    el.previewCount.textContent = `${uiState.previewPins.length} pins`;
    el.previewList.innerHTML = "";

    const displayPins = uiState.previewPins.slice(0, 50);
    for (let i = 0; i < displayPins.length; i++) {
      const pin = displayPins[i];
      const li = document.createElement("li");
      li.innerHTML = `
        <span class="pin-index">${i + 1}</span>
        <span class="pin-title">${escapeHtml(pin.title || pin.pinId)}</span>
      `;
      el.previewList.appendChild(li);
    }

    if (uiState.previewPins.length > 50) {
      const li = document.createElement("li");
      li.innerHTML = `
        <span class="pin-index">...</span>
        <span class="pin-title">${uiState.previewPins.length - 50} more pins</span>
      `;
      el.previewList.appendChild(li);
    }

    el.previewPanel.hidden = false;
  } catch (error) {
    uiState.errorCopy = {
      eyebrow: "Preview failed",
      title: "Couldn't preview the shuffle",
      message: humanizeError(error)
    };
  } finally {
    uiState.running = false;
    syncUi();
  }
}

async function startShuffle() {
  if (!uiState.selectedBoardUrl) return;

  if (!uiState.newBoardName) {
    uiState.errorCopy = {
      eyebrow: "Board name needed",
      title: "Enter a name for the new board",
      message: "Type a name for the new board that will hold your shuffled pins."
    };
    syncUi();
    return;
  }

  uiState.currentRunId = null;
  uiState.running = true;
  uiState.lastNewBoardUrl = null;
  uiState.errorCopy = null;
  uiState.keepProgressVisibleOnError = false;

  resetProgressSteps();
  setStepState("auth", "active");
  setStatus("running", STEP_COPY.auth);
  showProgress(true);
  showSuccessActions(false);
  syncUi();

  try {
    const response = await api.shuffleBoard({
      boardUrl: uiState.selectedBoardUrl,
      newBoardName: uiState.newBoardName,
      strategy: uiState.selectedStrategy,
      seed: el.shuffleSeed?.value.trim() || null
    });
    uiState.currentRunId = response.runId;
  } catch (error) {
    setStepState("auth", "error");
    handleRunFailure(error);
  }
}

function handlePipelineEvent(event) {
  if (event.type === "reorder.progress") {
    handleReorderProgress(event);
    return;
  }

  const eventJobId = getEventJobId(event);
  if (!shouldHandleEvent(eventJobId)) return;

  if (event.type === "job.created" || event.type === "job.updated") {
    uiState.currentRunId = event.job.id;
  }

  switch (event.type) {
    case "step.started":
      setStepState(event.step, "active");
      if (STEP_COPY[event.step]) {
        setStatus("running", STEP_COPY[event.step]);
      }
      showProgress(true);
      break;
    case "step.completed":
    case "step.skipped":
      setStepState(event.step, "success");
      break;
    case "step.failed":
      setStepState(event.step, "error");
      handleRunFailure(event.message);
      break;
    case "job.completed":
      void finalizeSuccess();
      break;
    case "job.failed":
      handleRunFailure(event.message);
      break;
    case "job.cancelled":
      handleRunFailure("The shuffle was cancelled.");
      break;
    default:
      break;
  }
}

function handleReorderProgress(event) {
  const step = event.step;
  const phase = event.phase;

  if (phase === "started") {
    setStepState(step, "active");
    if (STEP_COPY[step]) {
      setStatus("running", STEP_COPY[step]);
    }
    showProgress(true);
  } else if (phase === "completed") {
    setStepState(step, "success");
    if (step === "save") {
      void finalizeSuccess();
    }
  } else if (phase === "failed") {
    setStepState(step, "error");
    handleRunFailure(event.message);
  } else if (phase === "progress" && event.detail) {
    const { current, total } = event.detail;
    if (current && total) {
      setStatus("running", {
        eyebrow: "Saving to new board",
        title: `Pin ${current} of ${total}`,
        message: event.message
      });
    }
  }
}

function shouldHandleEvent(eventJobId) {
  if (!uiState.running && uiState.currentRunId !== eventJobId) return false;
  if (!uiState.currentRunId && uiState.running) {
    uiState.currentRunId = eventJobId;
    return true;
  }
  return uiState.currentRunId === eventJobId;
}

async function finalizeSuccess() {
  uiState.running = false;

  for (const step of STEP_SEQUENCE) {
    setStepState(step, "success");
  }

  try {
    const runs = await api.getShuffleHistory();
    const latest = runs[runs.length - 1];
    if (latest && latest.newBoardUrl) {
      uiState.lastNewBoardUrl = latest.newBoardUrl;
    }
  } catch {
    // Not critical
  }

  const successCopy = {
    eyebrow: "Finished",
    title: "Your new board is ready!",
    message: `Pins have been saved in shuffled order to "${uiState.newBoardName}". Your original board is untouched.`
  };

  setStatus("success", successCopy);
  showProgress(true);
  showSuccessActions(true);
  syncUi();
}

function handleRunFailure(error) {
  uiState.running = false;
  uiState.lastNewBoardUrl = null;

  if (looksLikeAuthProblem(error)) {
    uiState.storedAuthAvailable = false;
    uiState.isConnected = false;
  }

  uiState.errorCopy = {
    eyebrow: "Something needs attention",
    title: "We couldn't finish the shuffle",
    message: humanizeError(error)
  };
  uiState.keepProgressVisibleOnError = true;
  syncUi();
}

async function refreshAuthStatus() {
  try {
    const result = await api.checkAuth(30_000);
    uiState.storedAuthAvailable = Boolean(result.authenticated);
  } catch {
    uiState.storedAuthAvailable = false;
  }
}

function setSelectedBoard(boardUrl) {
  clearCompletionState();
  uiState.selectedBoardUrl = boardUrl;
  uiState.selectedBoardLabel = extractBoardSlug(boardUrl);
  el.boardUrl.classList.remove("invalid");
}

function clearCompletionState() {
  uiState.lastNewBoardUrl = null;
  uiState.previewPins = [];
  el.previewPanel.hidden = true;
  resetProgressSteps();
  showSuccessActions(false);
}

function syncUi() {
  const busy = isBusy();
  const hasBoard = Boolean(uiState.selectedBoardUrl);
  const validUrl = isLikelyPinterestBoardUrl(el.boardUrl.value.trim());

  el.selectedBoardCard.hidden = !hasBoard;
  el.selectedBoardName.textContent = hasBoard
    ? uiState.selectedBoardLabel
    : "No board selected yet";
  el.selectedBoardUrl.textContent = uiState.selectedBoardUrl;

  el.boardUrlField.hidden = hasBoard;
  el.changeBoardButton.hidden = !hasBoard || busy;
  el.strategyField.hidden = !hasBoard || !uiState.isConnected;
  el.seedField.hidden =
    !hasBoard ||
    !uiState.isConnected ||
    uiState.selectedStrategy !== "deterministic-seed";
  el.newBoardNameField.hidden = !hasBoard || !uiState.isConnected;
  el.previewAction.hidden = !hasBoard || !uiState.isConnected || busy;

  el.boardUrl.disabled = busy;
  el.primaryAction.disabled =
    busy || (uiState.isConnected && !hasBoard && !validUrl);

  el.primaryAction.textContent = uiState.isConnecting
    ? "Connecting to Pinterest..."
    : uiState.running
      ? "Copying to New Board..."
      : !uiState.isConnected
        ? "Connect Pinterest"
        : !hasBoard
          ? "Use This Board"
          : "Shuffle to New Board";

  el.openBoardButton.disabled = !uiState.lastNewBoardUrl;
  el.openBoardButton.textContent = "Open New Board on Pinterest";

  if (uiState.running) {
    el.formHint.textContent =
      "Keep this window open while PinShuffle copies pins to your new board.";
  } else if (uiState.isConnecting) {
    el.formHint.textContent =
      "Pinterest may open so you can sign in.";
  } else if (!uiState.isConnected) {
    el.formHint.textContent = uiState.storedAuthAvailable
      ? "Click Connect Pinterest to confirm your saved sign-in."
      : "Connect Pinterest first, then paste the board URL.";
  } else if (!hasBoard) {
    el.formHint.textContent =
      "Paste a Pinterest board URL above to get started.";
  } else {
    el.formHint.textContent =
      "Shuffled pins will be saved to a new board — your original stays untouched.";
  }

  if (!uiState.running) {
    showProgress(Boolean(uiState.lastNewBoardUrl));
    if (uiState.lastNewBoardUrl) {
      setStatus("success", STATUS_COPY.success);
      showSuccessActions(true);
    } else if (uiState.errorCopy) {
      setStatus("error", uiState.errorCopy);
      showProgress(uiState.keepProgressVisibleOnError);
      showSuccessActions(false);
    } else if (uiState.isConnecting) {
      setStatus("running", STATUS_COPY.connecting);
      showSuccessActions(false);
    } else if (!uiState.isConnected) {
      setStatus(
        "idle",
        uiState.storedAuthAvailable ? STATUS_COPY.connectStored : STATUS_COPY.connect
      );
      showSuccessActions(false);
    } else if (hasBoard) {
      setStatus("idle", STATUS_COPY.ready);
      showSuccessActions(false);
    } else {
      setStatus("idle", STATUS_COPY.connect);
      showSuccessActions(false);
    }
  }
}

function setStatus(state, copy) {
  el.statusPanel.classList.remove("idle", "running", "success", "error");
  el.statusPanel.classList.add(state);
  el.statusEyebrow.textContent = copy.eyebrow;
  el.statusTitle.textContent = copy.title;
  el.statusMessage.textContent = copy.message;
}

function showProgress(show) {
  el.progressList.hidden = !show;
}

function showSuccessActions(show) {
  el.successActions.hidden = !show;
}

function resetProgressSteps() {
  for (const step of STEP_SEQUENCE) {
    setStepState(step, "pending");
  }
}

function setStepState(stepName, state) {
  const node = el.progressList.querySelector(`[data-step="${stepName}"]`);
  if (!node) return;
  node.classList.remove("pending", "active", "success", "error");
  node.classList.add(state);
}

async function openBoard() {
  const targetUrl = uiState.lastNewBoardUrl || uiState.selectedBoardUrl;
  if (!targetUrl) return;

  try {
    await api.openExternal(targetUrl);
  } catch {
    window.open(targetUrl, "_blank", "noopener,noreferrer");
  }
}

function resetForAnotherBoard() {
  clearCompletionState();
  uiState.errorCopy = null;
  uiState.keepProgressVisibleOnError = false;
  uiState.currentRunId = null;
  uiState.selectedBoardUrl = "";
  uiState.selectedBoardLabel = "";
  uiState.selectedStrategy = "random";
  uiState.newBoardName = "";
  uiState.lastNewBoardUrl = null;
  el.boardUrl.value = "";
  el.boardUrl.classList.remove("invalid");
  if (el.shuffleSeed) el.shuffleSeed.value = "";
  if (el.newBoardName) el.newBoardName.value = "";

  // Reset strategy radio
  const randomRadio = document.querySelector('input[name="strategy"][value="random"]');
  if (randomRadio) randomRadio.checked = true;
  el.seedField.hidden = true;

  syncUi();
}

function getEventJobId(event) {
  return "job" in event ? event.job.id : event.jobId;
}

function isBusy() {
  return uiState.isConnecting || uiState.running;
}

function humanizeError(error) {
  const message =
    error instanceof Error ? error.message : String(error ?? "Unknown error");
  const normalized = message.toLowerCase();

  if (
    normalized.includes("auth_required") ||
    normalized.includes("not authenticated") ||
    normalized.includes("sign in")
  ) {
    return "Pinterest needs you to sign in before we can continue.";
  }

  if (normalized.includes("timed out")) {
    return "The operation took too long. Please try again.";
  }

  if (
    normalized.includes("blocked") ||
    normalized.includes("rate-limit") ||
    normalized.includes("too many requests")
  ) {
    return "Pinterest asked us to slow down. Please wait a moment and try again.";
  }

  if (normalized.includes("no pins")) {
    return "We couldn't find any pins on that board. Double-check the URL.";
  }

  return "Something went wrong while shuffling your board. Please try again.";
}

function looksLikeAuthProblem(error) {
  const message =
    error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toLowerCase();
  return (
    normalized.includes("auth_required") ||
    normalized.includes("not authenticated") ||
    normalized.includes("login") ||
    normalized.includes("sign-in")
  );
}

function extractBoardSlug(boardUrl) {
  try {
    const parsed = new URL(boardUrl);
    const parts = parsed.pathname.split("/").filter(Boolean);
    return formatBoardSlug(parts[1] || parts[0] || "board");
  } catch {
    return "board";
  }
}

function formatBoardSlug(value) {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isLikelyPinterestBoardUrl(boardUrl) {
  try {
    const parsed = new URL(boardUrl);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (!parsed.hostname.toLowerCase().includes("pinterest.")) return false;
    if (parts.length < 2) return false;
    return ![
      "pin", "settings", "ideas", "search", "homefeed",
      "today", "business", "_tools", "_auth"
    ].includes(parts[0].toLowerCase());
  } catch {
    return false;
  }
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
