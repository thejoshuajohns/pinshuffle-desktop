const { app, BrowserWindow, ipcMain } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const cliPath = path.join(projectRoot, "dist", "cli.js");
const telemetryPath = path.join(projectRoot, "debug", "desktop-telemetry.jsonl");
const sessionLogDir = path.join(projectRoot, "debug", "desktop-logs");

let activeChild = null;
let activeRunMeta = null;
let runCounter = 0;

function createWindow() {
  const iconPath = path.join(__dirname, "assets", "icon.png");
  const window = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 980,
    minHeight: 760,
    autoHideMenuBar: true,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  window.loadFile(path.join(__dirname, "renderer", "index.html"));
}

function resolveNodeBinary() {
  return process.env.NODE_BINARY || process.env.NODE || "node";
}

function normalizeRelativePath(relativePath) {
  const fullPath = path.resolve(projectRoot, relativePath);
  const relative = path.relative(projectRoot, fullPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Path is outside project root.");
  }
  return fullPath;
}

function appendTelemetry(entry) {
  try {
    fs.mkdirSync(path.dirname(telemetryPath), { recursive: true });
    fs.appendFileSync(telemetryPath, `${JSON.stringify(entry)}\n`, "utf8");
  } catch (error) {
    console.error("Failed to write telemetry:", error);
  }
}

function summarizeArgs(args) {
  const command = args[0] || "unknown";
  const flags = args.filter((value) => value.startsWith("-"));

  return {
    command,
    flags,
    argCount: args.length
  };
}

async function runCli(args, webContents) {
  if (activeChild) {
    throw new Error("Another CLI command is already running.");
  }

  if (!fs.existsSync(cliPath)) {
    throw new Error("Missing dist/cli.js. Run npm run build first.");
  }

  const runId = `run-${Date.now()}-${++runCounter}`;
  const nodeBinary = resolveNodeBinary();
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();

  return new Promise((resolve, reject) => {
    const child = spawn(nodeBinary, [cliPath, ...args], {
      cwd: projectRoot,
      env: {
        ...process.env,
        FORCE_COLOR: "0"
      }
    });

    activeChild = child;
    activeRunMeta = {
      runId,
      args,
      stopRequested: false,
      startedAt,
      startedMs
    };

    const emit = (stream, text) => {
      webContents.send("cli-log", {
        runId,
        stream,
        text
      });
    };

    child.stdout.on("data", (chunk) => {
      emit("stdout", chunk.toString());
    });

    child.stderr.on("data", (chunk) => {
      emit("stderr", chunk.toString());
    });

    child.on("error", (error) => {
      appendTelemetry({
        type: "run-error",
        runId,
        startedAt,
        endedAt: new Date().toISOString(),
        durationMs: Date.now() - startedMs,
        ...summarizeArgs(args),
        error: String(error)
      });

      activeChild = null;
      activeRunMeta = null;
      reject(error);
    });

    child.on("close", (exitCode, signal) => {
      const stopRequested = activeRunMeta ? activeRunMeta.stopRequested : false;

      appendTelemetry({
        type: "run-complete",
        runId,
        startedAt,
        endedAt: new Date().toISOString(),
        durationMs: Date.now() - startedMs,
        ...summarizeArgs(args),
        exitCode: exitCode ?? -1,
        signal: signal ?? null,
        stopRequested
      });

      activeChild = null;
      activeRunMeta = null;

      resolve({
        runId,
        exitCode: exitCode ?? -1,
        signal: signal ?? null
      });
    });
  });
}

ipcMain.handle("is-cli-ready", () => fs.existsSync(cliPath));

ipcMain.handle("read-json", (_event, relativePath) => {
  const fullPath = normalizeRelativePath(relativePath);
  if (!fs.existsSync(fullPath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
});

ipcMain.handle("run-cli", async (event, payload) => {
  if (!payload || !Array.isArray(payload.args)) {
    throw new Error("Invalid run-cli payload.");
  }

  const args = payload.args.map((value) => String(value));
  return runCli(args, event.sender);
});

ipcMain.handle("stop-cli", () => {
  if (!activeChild) {
    return false;
  }

  if (activeRunMeta) {
    activeRunMeta.stopRequested = true;
  }

  activeChild.kill("SIGTERM");
  return true;
});

ipcMain.handle("export-session-log", (_event, payload) => {
  if (!payload || typeof payload.content !== "string") {
    throw new Error("Invalid export-session-log payload.");
  }

  fs.mkdirSync(sessionLogDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = path.join(sessionLogDir, `desktop-session-${stamp}.log`);
  const metadata = {
    exportedAt: new Date().toISOString(),
    telemetryPath,
    ...(payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {})
  };

  const output = [`# Pinterest Shuffle Desktop Session`, "", JSON.stringify(metadata, null, 2), "", payload.content].join(
    "\n"
  );

  fs.writeFileSync(filePath, output, "utf8");

  return {
    path: filePath,
    telemetryPath
  };
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
