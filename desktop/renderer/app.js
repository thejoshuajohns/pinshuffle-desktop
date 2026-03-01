const api = window.desktopApi;
const SPEED_PRESETS = {
  conservative: { delayMin: 600, delayMax: 1400, batchSize: 12 },
  balanced: { delayMin: 250, delayMax: 900, batchSize: 20 },
  fast: { delayMin: 120, delayMax: 450, batchSize: 28 }
};

const el = {
  simpleSourceUrl: document.getElementById("simpleSourceUrl"),
  simpleDryRun: document.getElementById("simpleDryRun"),
  simpleRun: document.getElementById("simpleRun"),
  simpleConnect: document.getElementById("simpleConnect"),
  simpleAuthCheck: document.getElementById("simpleAuthCheck"),
  simpleLogout: document.getElementById("simpleLogout"),
  simpleDestinationPreview: document.getElementById("simpleDestinationPreview"),
  confirmBanner: document.getElementById("confirmBanner"),
  loginCard: document.getElementById("loginCard"),
  loginCardText: document.getElementById("loginCardText"),
  runCard: document.getElementById("runCard"),
  runCardText: document.getElementById("runCardText"),
  boardCard: document.getElementById("boardCard"),
  boardCardText: document.getElementById("boardCardText"),
  advancedDetails: document.getElementById("advancedDetails"),
  technicalDetails: document.getElementById("technicalDetails"),
  wizardSteps: document.getElementById("wizardSteps"),
  sourceBoardUrls: document.getElementById("sourceBoardUrls"),
  destinationBoardName: document.getElementById("destinationBoardName"),
  generateBoardName: document.getElementById("generateBoardName"),
  seed: document.getElementById("seed"),
  speedProfile: document.getElementById("speedProfile"),
  pinsToCopy: document.getElementById("pinsToCopy"),
  maxPinsToLoad: document.getElementById("maxPinsToLoad"),
  copyAllPins: document.getElementById("copyAllPins"),
  loadAllPins: document.getElementById("loadAllPins"),
  delayMin: document.getElementById("delayMin"),
  delayMax: document.getElementById("delayMax"),
  batchSize: document.getElementById("batchSize"),
  applyMax: document.getElementById("applyMax"),
  applyResume: document.getElementById("applyResume"),
  applyDryRun: document.getElementById("applyDryRun"),
  loadConfig: document.getElementById("loadConfig"),
  saveConfig: document.getElementById("saveConfig"),
  runAll: document.getElementById("runAll"),
  login: document.getElementById("login"),
  authCheck: document.getElementById("authCheck"),
  logout: document.getElementById("logout"),
  scrape: document.getElementById("scrape"),
  plan: document.getElementById("plan"),
  diagnose: document.getElementById("diagnose"),
  apply: document.getElementById("apply"),
  stop: document.getElementById("stop"),
  exportLog: document.getElementById("exportLog"),
  log: document.getElementById("log")
};

const commandButtons = [
  el.simpleRun,
  el.simpleConnect,
  el.simpleAuthCheck,
  el.simpleLogout,
  el.loadConfig,
  el.saveConfig,
  el.generateBoardName,
  el.copyAllPins,
  el.loadAllPins,
  el.runAll,
  el.login,
  el.authCheck,
  el.logout,
  el.scrape,
  el.plan,
  el.diagnose,
  el.apply
].filter(Boolean);

const pipelineSteps = ["init", "login", "scrape", "plan", "apply"];

let running = false;
let stopRequested = false;
let pipelineActive = false;
let sessionLogBuffer = "";
const signalState = {
  dryRunDetected: false,
  boardEnsured: false,
  boardName: null,
  savedPins: null,
  totalPins: null
};

api.onCliLog((entry) => {
  appendLog(entry.stream, entry.text);
  ingestLogSignals(entry.text);
});

void bootstrap();

el.simpleSourceUrl.addEventListener("input", () => {
  updateSimpleDestinationPreview();
});

el.simpleRun.addEventListener("click", () => {
  void runSimpleShuffle();
});

el.simpleConnect.addEventListener("click", () => {
  void runLoginFromUi();
});

el.simpleAuthCheck.addEventListener("click", () => {
  void runAuthCheckFromUi();
});

el.simpleLogout.addEventListener("click", () => {
  void runLogoutFromUi();
});

el.loadConfig.addEventListener("click", () => {
  void loadConfigFromDisk();
});

el.saveConfig.addEventListener("click", () => {
  void runSaveConfig();
});

el.copyAllPins.addEventListener("change", () => {
  syncAllModeInputs();
});

el.loadAllPins.addEventListener("change", () => {
  syncAllModeInputs();
});

el.speedProfile.addEventListener("change", () => {
  applySpeedProfileDefaults(el.speedProfile.value, { force: true });
});

el.generateBoardName.addEventListener("click", () => {
  const generated = buildUniqueBoardName();
  el.destinationBoardName.value = generated;
  appendLog("system", `Generated destination board name: ${generated}\n`);
});

el.runAll.addEventListener("click", () => {
  void runFullPipeline();
});

el.login.addEventListener("click", () => {
  void runLoginFromUi();
});

el.authCheck.addEventListener("click", () => {
  void runAuthCheckFromUi();
});

el.logout.addEventListener("click", () => {
  void runLogoutFromUi();
});

el.scrape.addEventListener("click", () => {
  void runSingleCommand("scrape", ["scrape"]);
});

el.plan.addEventListener("click", () => {
  void runSingleCommand("plan", ["plan"]);
});

el.diagnose.addEventListener("click", () => {
  void runSingleCommand("diagnose", ["diagnose"]);
});

el.apply.addEventListener("click", () => {
  void runApply();
});

el.stop.addEventListener("click", () => {
  void stopRun();
});

el.exportLog.addEventListener("click", () => {
  void exportSessionLog();
});

function runLoginFromUi() {
  setBanner("running", "Waiting for Pinterest login. Complete login in the browser window.");
  setLoginState("running", "Login in progress...");
  void runSingleCommand("login", ["login", "--no-prompt", "--timeout-ms", "900000"]);
}

function runAuthCheckFromUi() {
  setBanner("running", "Checking Pinterest connection...");
  setLoginState("running", "Checking saved session...");
  void runSingleCommand("auth-check", ["auth-check", "--timeout-ms", "30000"]);
}

function runLogoutFromUi() {
  const confirmed = window.confirm(
    [
      "Disconnect Pinterest from this app?",
      "",
      "This deletes .auth/storageState.json used by PinShuffle.",
      "It does not sign you out globally from Pinterest in other browsers."
    ].join("\n")
  );

  if (!confirmed) {
    appendLog("system", "Disconnect canceled by user.\n");
    return;
  }

  setBanner("running", "Disconnecting Pinterest session for this app...");
  setLoginState("running", "Disconnecting...");
  void runSingleCommand("logout", ["logout"]);
}

async function bootstrap() {
  el.stop.disabled = true;
  resetWizardSteps();
  syncAllModeInputs();
  setBanner("idle", "Ready. Paste a board URL, then click Run Shuffle.");
  setLoginState("idle", "Not connected yet.");
  setRunState("idle", "No run in progress.");
  setBoardState("idle", "No board action yet.");

  const cliReady = await api.isCliReady();
  if (!cliReady) {
    appendLog("stderr", "dist/cli.js not found. Run npm run build before starting desktop.\n");
  }

  await loadConfigFromDisk();
  await refreshLoginStatusFromDisk();
  updateSimpleDestinationPreview();
}

async function loadConfigFromDisk() {
  const config = await api.readJson("config.json");

  if (!config) {
    appendLog("stderr", "No config.json found yet. Simple mode still works; click Run Shuffle.\n");
    return;
  }

  el.sourceBoardUrls.value = (config.sourceBoardUrls || []).join("\n");
  el.destinationBoardName.value = config.destinationBoardName || "";
  el.seed.value = config.seed || "";
  el.speedProfile.value = SPEED_PRESETS[config.speedProfile] ? config.speedProfile : "balanced";
  el.pinsToCopy.value = String(config.pinsToCopy === "all" ? 50 : (config.pinsToCopy ?? 50));
  el.maxPinsToLoad.value = String(config.maxPinsToLoad === "all" ? 200 : (config.maxPinsToLoad ?? 200));
  el.copyAllPins.checked = config.pinsToCopy === "all";
  el.loadAllPins.checked = config.maxPinsToLoad === "all";
  el.delayMin.value = String((config.delayMsRange || [250, 900])[0]);
  el.delayMax.value = String((config.delayMsRange || [250, 900])[1]);
  el.batchSize.value = String(config.batchSize ?? 20);
  syncAllModeInputs();
  syncSimpleSourceFromAdvanced();

  appendLog("system", "Loaded config.json into Advanced Settings.\n");
}

function syncSimpleSourceFromAdvanced() {
  const firstSource = parseSourceUrls(el.sourceBoardUrls.value)[0];
  if (firstSource) {
    el.simpleSourceUrl.value = firstSource;
  }
  updateSimpleDestinationPreview();
}

async function runSimpleShuffle() {
  if (running) {
    appendLog("stderr", "A command is already running. Wait or press Stop.\n");
    return;
  }

  const source = el.simpleSourceUrl.value.trim();
  if (!source) {
    appendLog("stderr", "Paste a Pinterest board URL first.\n");
    setBanner("error", "Paste a Pinterest board URL first.");
    setRunState("error", "Missing source board URL.");
    return;
  }

  const destination = buildSimpleBoardName(source);
  resetSignalState();
  el.sourceBoardUrls.value = source;
  el.destinationBoardName.value = destination;
  el.seed.value = "";
  el.speedProfile.value = "balanced";
  applySpeedProfileDefaults("balanced", { force: true });
  el.copyAllPins.checked = true;
  el.loadAllPins.checked = true;
  el.applyDryRun.checked = Boolean(el.simpleDryRun.checked);
  el.applyResume.checked = false;
  el.applyMax.value = "";
  syncAllModeInputs();
  updateSimpleDestinationPreview();

  appendLog("system", `Simple mode source: ${source}\n`);
  appendLog("system", `Simple mode destination: ${destination}\n`);
  appendLog("system", `Simple mode run type: ${el.simpleDryRun.checked ? "DRY RUN" : "LIVE SAVE"}\n`);
  setBanner(
    "running",
    el.simpleDryRun.checked
      ? "Running dry-run pipeline: no pins will be saved."
      : "Running shuffle pipeline. Login prompt will appear if needed."
  );
  setRunState("running", "Pipeline is running...");
  setBoardState("running", `Preparing destination board: ${destination}`);

  await runFullPipeline({ skipConfirm: true, initiatedBy: "simple-mode" });
}

async function runSaveConfig() {
  const initArgs = buildInitArgs();
  if (!initArgs) {
    return;
  }

  await runSingleCommand("init", initArgs, { reloadConfigOnSuccess: true });
}

async function runApply() {
  await runSingleCommand("apply", buildApplyArgs());
}

async function runFullPipeline(options = {}) {
  if (running) {
    appendLog("stderr", "A command is already running. Wait or press Stop.\n");
    return;
  }

  const initArgs = buildInitArgs();
  if (!initArgs) {
    return;
  }

  const applyArgs = buildApplyArgs();
  const dryRun = applyArgs.includes("--dry-run");
  const destination = el.destinationBoardName.value.trim();
  const skipConfirm = Boolean(options.skipConfirm);

  if (!skipConfirm) {
    const confirmation = window.confirm(
      [
        "Run full pipeline now?",
        "",
        "Steps:",
        "1) init",
        "2) login",
        "3) scrape",
        "4) plan",
        "5) apply",
        "",
        `Destination board: ${destination}`,
        `Apply mode: ${dryRun ? "DRY RUN" : "LIVE SAVE"}`,
        "",
        "Pipeline stops on first failure."
      ].join("\n")
    );

    if (!confirmation) {
      appendLog("system", "Full pipeline canceled by user.\n");
      return;
    }
  }

  resetSignalState();
  setRunState("running", "Pipeline is running...");
  setBoardState("running", `Preparing destination board: ${destination}`);
  setBanner("running", dryRun ? "Running dry-run pipeline..." : "Running shuffle pipeline...");

  pipelineActive = true;
  resetWizardSteps();

  await withRunLock(async () => {
    appendLog("system", "Starting full pipeline.\n");

    const steps = [
      { name: "init", args: initArgs, reloadConfigOnSuccess: true },
      { name: "login", args: ["login", "--no-prompt", "--timeout-ms", "900000"] },
      { name: "scrape", args: ["scrape"] },
      { name: "plan", args: ["plan"] },
      { name: "apply", args: applyArgs }
    ];

    for (const step of steps) {
      if (stopRequested) {
        markWizardStep(step.name, "stopped");
        appendLog("system", `Pipeline stopped before ${step.name}.\n`);
        setBanner("error", "Run stopped before completion.");
        setRunState("error", `Stopped before ${step.name}.`);
        return;
      }

      markWizardStep(step.name, "running");
      if (step.name === "login") {
        setLoginState("running", "Login in progress...");
      }
      if (step.name === "apply") {
        setBoardState("running", `Saving pins to: ${el.destinationBoardName.value.trim() || "destination board"}`);
      }
      const ok = await executeCommand(step.name, step.args);

      if (ok && step.reloadConfigOnSuccess) {
        await loadConfigFromDisk();
      }

      if (!ok) {
        markWizardStep(step.name, stopRequested ? "stopped" : "error");
        if (stopRequested) {
          appendLog("system", `Pipeline interrupted during ${step.name}.\n`);
          setBanner("error", "Run stopped before completion.");
          setRunState("error", `Stopped during ${step.name}.`);
          if (step.name !== "apply") {
            setBoardState("info", "Board step did not run.");
          }
        } else {
          appendLog("stderr", `Pipeline stopped at ${step.name}.\n`);
          setBanner("error", `Run failed at ${step.name}.`);
          setRunState("error", `Failed at ${step.name}.`);
          if (step.name === "login") {
            setLoginState("error", "Login did not complete.");
          }
          if (step.name === "apply") {
            setBoardState("error", "Board save step failed.");
          } else {
            setBoardState("info", "Board step did not run.");
          }
        }
        return;
      }

      if (step.name === "login") {
        const connected = await refreshLoginStatusFromDisk();
        if (!connected) {
          appendLog("stderr", "Login command finished, but the saved session is not authenticated.\n");
          markWizardStep(step.name, "error");
          setLoginState("error", "Login session verification failed.");
          setBanner("error", "Run failed at login.");
          setRunState("error", "Failed at login.");
          setBoardState("info", "Board step did not run.");
          return;
        }
        setLoginState("success", "Login connected successfully.");
      }

      markWizardStep(step.name, "success");
    }

    appendLog("system", "Full pipeline completed successfully.\n");
    setRunState("success", "Pipeline completed successfully.");
    finalizeBoardConfirmation();
    setBanner(
      "success",
      signalState.dryRunDetected
        ? "Dry run completed successfully."
        : `Shuffle completed successfully for "${el.destinationBoardName.value.trim()}".`
    );
  });

  pipelineActive = false;
}

async function runSingleCommand(name, args, options = {}) {
  if (running) {
    appendLog("stderr", "A command is already running. Wait or press Stop.\n");
    return;
  }

  await withRunLock(async () => {
    if (name === "apply") {
      resetSignalState();
      setBoardState("running", `Saving pins to: ${el.destinationBoardName.value.trim() || "destination board"}`);
      setRunState("running", "Apply command is running...");
      setBanner("running", "Applying plan...");
    }

    if (pipelineSteps.includes(name)) {
      resetWizardSteps();
      markWizardStep(name, "running");
    }

    const ok = await executeCommand(name, args);
    let finalOk = ok;

    if (ok && options.reloadConfigOnSuccess) {
      await loadConfigFromDisk();
    }

    if (name === "login") {
      if (ok) {
        const connected = await refreshLoginStatusFromDisk();
        if (connected) {
          setLoginState("success", "Login connected successfully.");
          setBanner("success", "Pinterest login connected.");
        } else {
          finalOk = false;
          setLoginState("error", "Login session verification failed.");
          setBanner("error", "Pinterest login was not verified.");
        }
      } else {
        finalOk = false;
        setLoginState("error", "Login failed or was canceled.");
        setBanner("error", "Pinterest login failed.");
      }
    }

    if (name === "auth-check") {
      if (ok) {
        setLoginState("success", "Connection verified.");
        setBanner("success", "Pinterest connection is valid.");
      } else {
        setLoginState("idle", "Not connected. Run Login again.");
        setBanner("error", "Pinterest connection check failed.");
      }
    }

    if (name === "logout") {
      if (ok) {
        setLoginState("idle", "Not connected yet.");
        setBanner("idle", "Pinterest disconnected for this app.");
      } else {
        setBanner("error", "Disconnect failed.");
      }
    }

    if (name === "apply") {
      if (ok) {
        setRunState("success", "Apply completed successfully.");
        finalizeBoardConfirmation();
        setBanner("success", signalState.dryRunDetected ? "Dry run apply completed." : "Apply completed successfully.");
      } else {
        setRunState("error", "Apply failed.");
        setBoardState("error", "Board save step failed.");
        setBanner("error", "Apply failed.");
      }
    }

    if (pipelineSteps.includes(name)) {
      markWizardStep(name, finalOk ? "success" : "error");
    }
  });
}

async function withRunLock(task) {
  running = true;
  stopRequested = false;
  setButtonsDisabled(true);

  try {
    await task();
  } finally {
    running = false;
    setButtonsDisabled(false);
    if (!pipelineActive) {
      stopRequested = false;
    }
  }
}

async function executeCommand(name, args) {
  appendLog("system", `\n$ node dist/cli.js ${args.join(" ")}\n`);

  try {
    const result = await api.runCli({ args });
    appendLog("system", `[${name}] exit code: ${result.exitCode}\n`);

    if (result.exitCode !== 0) {
      if (!stopRequested) {
        appendLog("stderr", `${name} failed. Open Technical Log (Advanced) for details.\n`);
      }
      return false;
    }

    return true;
  } catch (error) {
    appendLog("stderr", `${name} error: ${String(error.message || error)}\n`);
    return false;
  }
}

async function stopRun() {
  if (!running) {
    appendLog("system", "No running command to stop.\n");
    return;
  }

  stopRequested = true;
  const stopped = await api.stopCli();

  if (stopped) {
    for (const step of pipelineSteps) {
      const node = el.wizardSteps ? el.wizardSteps.querySelector(`[data-step="${step}"]`) : null;
      if (node && node.classList.contains("running")) {
        markWizardStep(step, "stopped");
      }
    }
    appendLog("system", pipelineActive ? "Pipeline stop requested.\n" : "Stop signal sent.\n");
    setBanner("error", "Stop requested.");
    setRunState("error", "Run stopped by user.");
    return;
  }

  appendLog("system", "Stop requested, but no active process was found.\n");
}

function setButtonsDisabled(disabled) {
  for (const button of commandButtons) {
    button.disabled = disabled;
  }

  el.stop.disabled = !disabled;
}

function resetWizardSteps() {
  for (const step of pipelineSteps) {
    markWizardStep(step, "idle");
  }
}

function markWizardStep(stepName, state) {
  if (!el.wizardSteps) {
    return;
  }

  const node = el.wizardSteps.querySelector(`[data-step="${stepName}"]`);
  if (!node) {
    return;
  }

  node.classList.remove("idle", "running", "success", "error", "stopped");
  node.classList.add(state);
}

async function exportSessionLog() {
  if (!sessionLogBuffer.trim()) {
    appendLog("system", "No log output yet to export.\n");
    return;
  }

  const sourceUrls = parseSourceUrls(el.sourceBoardUrls.value);
  const metadataSourceUrls = sourceUrls.length > 0 ? sourceUrls : parseSourceUrls(el.simpleSourceUrl.value);

  try {
    const response = await api.exportSessionLog({
      content: sessionLogBuffer,
      metadata: {
        sourceBoardUrls: metadataSourceUrls,
        destinationBoardName: el.destinationBoardName.value.trim() || null
      }
    });

    appendLog("system", `Session log exported: ${response.path}\n`);
    appendLog("system", `Telemetry file: ${response.telemetryPath}\n`);
  } catch (error) {
    appendLog("stderr", `Failed to export session log: ${String(error.message || error)}\n`);
  }
}

function buildInitArgs() {
  const sourceUrls = parseSourceUrls(el.sourceBoardUrls.value);
  if (sourceUrls.length === 0) {
    appendLog("stderr", "At least one source board URL is required.\n");
    return null;
  }

  const destinationName = el.destinationBoardName.value.trim();
  if (!destinationName) {
    appendLog("stderr", "Destination board name is required.\n");
    return null;
  }

  const args = [
    "init",
    "--source",
    ...sourceUrls,
    "--destination",
    destinationName,
    "--speed",
    String(el.speedProfile.value || "balanced"),
    "--pins",
    el.copyAllPins.checked ? "all" : String(toInt(el.pinsToCopy.value, 50)),
    "--max-load",
    el.loadAllPins.checked ? "all" : String(toInt(el.maxPinsToLoad.value, 200)),
    "--delay-min",
    String(toInt(el.delayMin.value, 250)),
    "--delay-max",
    String(toInt(el.delayMax.value, 900)),
    "--batch-size",
    String(toInt(el.batchSize.value, 20))
  ];

  const seed = el.seed.value.trim();
  if (seed) {
    args.push("--seed", seed);
  }

  return args;
}

function buildApplyArgs() {
  const args = ["apply"];

  if (el.applyDryRun.checked) {
    args.push("--dry-run");
  }

  if (!el.applyResume.checked) {
    args.push("--no-resume");
  }

  const applyMax = el.applyMax.value.trim();
  if (applyMax) {
    args.push("--max", applyMax);
  }

  return args;
}

function buildUniqueBoardName() {
  const now = new Date();
  const timestamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("-");
  const hhmmss = [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0")
  ].join("");
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `Codex Test Shuffle ${timestamp}-${hhmmss}-${suffix}`;
}

function buildSimpleBoardName(sourceUrl) {
  const now = new Date();
  const day = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("-");
  const hhmm = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  const slug = extractBoardSlug(sourceUrl);
  const label = toTitleCase(slug.replace(/[-_]+/g, " ").replace(/[^a-zA-Z0-9 ]+/g, " ").replace(/\s+/g, " ").trim());
  const safeLabel = label.length > 0 ? label : "Board";
  return `Shuffled - ${safeLabel} - ${day}-${hhmm}`;
}

function extractBoardSlug(sourceUrl) {
  try {
    const parsed = new URL(sourceUrl);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length >= 2) {
      return parts[1];
    }
    if (parts.length >= 1) {
      return parts[0];
    }
    return "board";
  } catch {
    return "board";
  }
}

function toTitleCase(value) {
  return value
    .split(" ")
    .filter((chunk) => chunk.length > 0)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1).toLowerCase())
    .join(" ");
}

function updateSimpleDestinationPreview() {
  const source = el.simpleSourceUrl.value.trim();
  if (!source) {
    el.simpleDestinationPreview.textContent = "auto-generated at run time";
    return;
  }

  el.simpleDestinationPreview.textContent = buildSimpleBoardName(source);
}

function syncAllModeInputs() {
  el.pinsToCopy.disabled = el.copyAllPins.checked;
  el.maxPinsToLoad.disabled = el.loadAllPins.checked;
}

function applySpeedProfileDefaults(profile, options = {}) {
  const preset = SPEED_PRESETS[profile] || SPEED_PRESETS.balanced;
  const force = Boolean(options.force);
  const delayMinEmpty = !String(el.delayMin.value || "").trim();
  const delayMaxEmpty = !String(el.delayMax.value || "").trim();
  const batchSizeEmpty = !String(el.batchSize.value || "").trim();

  if (force || delayMinEmpty) {
    el.delayMin.value = String(preset.delayMin);
  }
  if (force || delayMaxEmpty) {
    el.delayMax.value = String(preset.delayMax);
  }
  if (force || batchSizeEmpty) {
    el.batchSize.value = String(preset.batchSize);
  }
}

async function refreshLoginStatusFromDisk() {
  const authState = await api.readJson(".auth/storageState.json");
  if (!authState) {
    setLoginState("idle", "Not connected yet.");
    return false;
  }

  try {
    const result = await api.runCli({
      args: ["auth-check", "--quiet", "--timeout-ms", "30000"]
    });

    if (result.exitCode === 0) {
      setLoginState("success", "Already connected.");
      return true;
    }
  } catch {
    // Ignore check failures; fall back to disconnected state.
  }

  setLoginState("idle", "Not connected. Run Login again.");
  return false;
}

function resetSignalState() {
  signalState.dryRunDetected = false;
  signalState.boardEnsured = false;
  signalState.boardName = null;
  signalState.savedPins = null;
  signalState.totalPins = null;
}

let signalLineBuffer = "";

function ingestLogSignals(text) {
  signalLineBuffer += text;
  const lines = signalLineBuffer.split(/\r?\n/);
  signalLineBuffer = lines.pop() ?? "";

  for (const rawLine of lines) {
    parseSignalLine(rawLine.trim());
  }
}

function parseSignalLine(line) {
  if (!line) {
    return;
  }

  if (/Saved storage state to/i.test(line)) {
    setLoginState("success", "Login connected successfully.");
  }

  const ensuredMatch = line.match(/Destination board ensured \(or already existed\):\s*(.+)$/i);
  if (ensuredMatch) {
    signalState.boardEnsured = true;
    signalState.boardName = ensuredMatch[1].trim();
  }

  const destinationMatch = line.match(/^Destination board:\s*(.+)$/i);
  if (destinationMatch) {
    signalState.boardName = destinationMatch[1].trim();
  }

  if (/DRY RUN enabled\. No save actions will be performed\./i.test(line)) {
    signalState.dryRunDetected = true;
  }

  const applyMatch = line.match(/Apply finished\. Saved (\d+)\/(\d+) pins\./i);
  if (applyMatch) {
    signalState.savedPins = Number.parseInt(applyMatch[1], 10);
    signalState.totalPins = Number.parseInt(applyMatch[2], 10);
  }
}

function finalizeBoardConfirmation() {
  const destination = signalState.boardName || el.destinationBoardName.value.trim() || "destination board";

  if (signalState.dryRunDetected || el.applyDryRun.checked) {
    setBoardState("info", `Dry run complete for "${destination}". No board was created or modified.`);
    return;
  }

  if (signalState.savedPins !== null && signalState.totalPins !== null) {
    if (signalState.savedPins > 0) {
      const prefix = signalState.boardEnsured ? "Board confirmed and pins saved" : "Pins saved";
      setBoardState("success", `${prefix}: ${signalState.savedPins}/${signalState.totalPins} to "${destination}".`);
    } else {
      setBoardState("info", `Run finished for "${destination}" but no pins were saved.`);
    }
    return;
  }

  if (signalState.boardEnsured) {
    setBoardState("success", `Destination board confirmed: "${destination}".`);
    return;
  }

  setBoardState("success", `Run completed for "${destination}".`);
}

function setBanner(state, message) {
  setStateClasses(el.confirmBanner, state);
  el.confirmBanner.textContent = message;
}

function setLoginState(state, message) {
  setStateClasses(el.loginCard, state);
  el.loginCardText.textContent = message;
}

function setRunState(state, message) {
  setStateClasses(el.runCard, state);
  el.runCardText.textContent = message;
}

function setBoardState(state, message) {
  setStateClasses(el.boardCard, state);
  el.boardCardText.textContent = message;
}

function setStateClasses(node, state) {
  if (!node) {
    return;
  }

  node.classList.remove("idle", "running", "success", "error", "info");
  node.classList.add(state);
}

function appendLog(stream, text) {
  const prefix = stream === "stderr" ? "[err] " : stream === "system" ? "[app] " : "";
  const lines = text
    .split(/\r?\n/)
    .filter((line, index, list) => line.length > 0 || index < list.length - 1)
    .map((line) => `${prefix}${line}`)
    .join("\n");

  const output = lines + (lines.endsWith("\n") ? "" : "\n");
  sessionLogBuffer += output;
  el.log.textContent += output;
  el.log.scrollTop = el.log.scrollHeight;
}

function parseSourceUrls(raw) {
  return raw
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function toInt(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
