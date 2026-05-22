#!/usr/bin/env node
/**
 * L0.5 browser console smoke (zero npm deps).
 * Starts a short-lived Python HTTP server, launches Edge headless + CDP,
 * loads Game/, captures console errors and runtime exceptions.
 *
 * Usage: node Scripts/verify-browser-console.mjs
 */

import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const gameDir = path.join(repoRoot, "Game");

const EDGE_CANDIDATES = [
  process.env.LDSPACE_EDGE_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);

const PAGE_LOAD_TIMEOUT_MS = 20_000;
const RUNTIME_SETTLE_MS = 2_500;

function log(line = "") {
  process.stdout.write(`${line}\n`);
}

function fail(message, code = 1) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }
        resolve(port);
      });
    });
  });
}

function resolveEdgePath() {
  for (const candidate of EDGE_CANDIDATES) {
    const probe = spawnSync(candidate, ["--version"], {
      stdio: "ignore",
      windowsHide: true,
    });
    if (probe.error) {
      continue;
    }
    return candidate;
  }
  return null;
}

function killProcessTree(child, label) {
  if (!child || child.exitCode !== null || child.killed) {
    return;
  }

  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    } else {
      child.kill("SIGTERM");
    }
  } catch (error) {
    process.stderr.write(`Warning: failed to stop ${label}: ${error.message}\n`);
  }
}

async function waitForHttp(url, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "follow" });
      if (response.ok) {
        return response;
      }
    } catch {
      // retry
    }
    await delay(150);
  }
  throw new Error(`HTTP server not ready: ${url}`);
}

async function waitForCdp(debugPort, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      if (response.ok) {
        return response.json();
      }
    } catch {
      // retry
    }
    await delay(150);
  }
  throw new Error(`CDP endpoint not ready on port ${debugPort}`);
}

async function listCdpTargets(debugPort) {
  const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
  if (!response.ok) {
    throw new Error(`Failed to list CDP targets (${response.status})`);
  }
  return response.json();
}

function formatConsoleArgs(args) {
  return args
    .map((entry) => {
      if (entry.type === "string") {
        return entry.value;
      }
      if (entry.description) {
        return entry.description;
      }
      try {
        return JSON.stringify(entry.value ?? entry);
      } catch {
        return String(entry.value ?? entry);
      }
    })
    .join(" ");
}

function formatException(details) {
  const text = details?.exception?.description || details?.text || "Unknown runtime exception";
  const url = details?.url ? ` @ ${details.url}:${details.lineNumber ?? 0}` : "";
  return `${text}${url}`;
}

function isBenignConsoleError(message) {
  const normalized = String(message).toLowerCase();
  return normalized.includes("favicon.ico");
}

class CdpClient {
  constructor(webSocketUrl) {
    this.webSocketUrl = webSocketUrl;
    this.ws = null;
    this.nextId = 0;
    this.pending = new Map();
    this.consoleErrors = [];
    this.runtimeExceptions = [];
    this.pageLoaded = false;
    this.domContentLoaded = false;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.webSocketUrl);
      this.ws = ws;

      ws.addEventListener("open", () => resolve());
      ws.addEventListener("error", (event) => {
        reject(event.error ?? new Error("WebSocket connection failed"));
      });
      ws.addEventListener("message", (event) => {
        this.handleMessage(String(event.data));
      });
    });
  }

  handleMessage(raw) {
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }

    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) {
        reject(new Error(JSON.stringify(message.error)));
      } else {
        resolve(message.result);
      }
      return;
    }

    if (!message.method) {
      return;
    }

    switch (message.method) {
      case "Runtime.consoleAPICalled":
        if (message.params?.type === "error") {
          this.consoleErrors.push(formatConsoleArgs(message.params.args ?? []));
        }
        break;
      case "Runtime.exceptionThrown":
        this.runtimeExceptions.push(formatException(message.params?.exceptionDetails));
        break;
      case "Log.entryAdded":
        if (message.params?.entry?.level === "error") {
          this.consoleErrors.push(message.params.entry.text ?? "Log error");
        }
        break;
      case "Page.loadEventFired":
        this.pageLoaded = true;
        break;
      case "Page.domContentEventFired":
        this.domContentLoaded = true;
        break;
      default:
        break;
    }
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("CDP socket is not open"));
        return;
      }

      const id = ++this.nextId;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
  }

  async waitForPageLoad(timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.pageLoaded) {
        return;
      }
      await delay(100);
    }
    throw new Error("Page load timeout");
  }
}

async function runSmoke() {
  const startedAt = Date.now();
  const edgePath = resolveEdgePath();
  if (!edgePath) {
    fail("Microsoft Edge not found. Set LDSPACE_EDGE_PATH or install Edge.");
  }

  const pythonProbe = spawnSync("python", ["--version"], {
    stdio: "pipe",
    windowsHide: true,
    encoding: "utf8",
  });
  if (pythonProbe.error || pythonProbe.status !== 0) {
    fail("Python not found in PATH (required for local HTTP server).");
  }

  const httpPort = await getFreePort();
  const debugPort = await getFreePort();
  const gameUrl = `http://127.0.0.1:${httpPort}/`;

  let pythonServer = null;
  let edgeProcess = null;
  let cdpClient = null;

  log("");
  log("LDSpaceGame browser console smoke");
  log(`Repo: ${repoRoot}`);
  log(`URL: ${gameUrl}`);
  log(`Edge: ${edgePath}`);
  log("");

  try {
    pythonServer = spawn(
      "python",
      ["-m", "http.server", String(httpPort), "--directory", gameDir],
      {
        cwd: repoRoot,
        stdio: ["ignore", "ignore", "pipe"],
        windowsHide: true,
      },
    );

    pythonServer.stderr.on("data", (chunk) => {
      const text = String(chunk).trim();
      if (text) {
        process.stderr.write(`[python] ${text}\n`);
      }
    });

    await waitForHttp(gameUrl);

    edgeProcess = spawn(
      edgePath,
      [
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-extensions",
        `--remote-debugging-port=${debugPort}`,
        "about:blank",
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );

    edgeProcess.stderr.on("data", (chunk) => {
      const text = String(chunk).trim();
      if (text && !text.includes("DevTools listening on")) {
        process.stderr.write(`[edge] ${text}\n`);
      }
    });

    await waitForCdp(debugPort);
    const targets = await listCdpTargets(debugPort);
    const pageTarget = targets.find((entry) => entry.type === "page" && entry.webSocketDebuggerUrl);
    if (!pageTarget) {
      throw new Error("No CDP page target available");
    }

    cdpClient = new CdpClient(pageTarget.webSocketDebuggerUrl);
    await cdpClient.connect();
    await cdpClient.send("Runtime.enable");
    await cdpClient.send("Page.enable");
    await cdpClient.send("Log.enable");
    await cdpClient.send("Network.enable");
    await cdpClient.send("Network.setBlockedURLs", {
      urls: ["*favicon.ico"],
    });
    await cdpClient.send("Page.navigate", { url: gameUrl });
    await cdpClient.waitForPageLoad(PAGE_LOAD_TIMEOUT_MS);
    await delay(RUNTIME_SETTLE_MS);

    const probe = await cdpClient.send("Runtime.evaluate", {
      expression: `({
        hasCanvas: !!document.querySelector('#game'),
        title: document.title,
        readyState: document.readyState
      })`,
      returnByValue: true,
    });

    const pageState = probe?.result?.value ?? {};
    const checks = [];
    const addCheck = (name, passed, detail = "") => {
      checks.push({ name, passed, detail });
    };

    addCheck(
      "Page load event",
      cdpClient.pageLoaded,
      cdpClient.pageLoaded ? "loadEventFired received." : "Timed out waiting for load.",
    );
    addCheck(
      "Canvas #game exists",
      Boolean(pageState.hasCanvas),
      pageState.hasCanvas ? "Canvas element found." : "Missing #game canvas.",
    );
    addCheck(
      "Document readyState",
      pageState.readyState === "complete" || pageState.readyState === "interactive",
      `readyState=${pageState.readyState ?? "unknown"}`,
    );

    const consoleErrors = cdpClient.consoleErrors.filter((entry) => !isBenignConsoleError(entry));
    const runtimeExceptions = cdpClient.runtimeExceptions;
    const consoleErrorCount = consoleErrors.length;
    const runtimeExceptionCount = runtimeExceptions.length;
    const hasRuntimeErrors = consoleErrorCount > 0 || runtimeExceptionCount > 0;

    addCheck(
      "Console errors",
      !hasRuntimeErrors,
      hasRuntimeErrors
        ? `${consoleErrorCount} console error(s), ${runtimeExceptionCount} runtime exception(s).`
        : "No console errors or runtime exceptions.",
    );

    log("Checks:");
    for (const check of checks) {
      const status = check.passed ? "PASS" : "FAIL";
      log(`  [${status}] ${check.name}`);
      if (check.detail) {
        log(`         ${check.detail}`);
      }
    }

    if (consoleErrorCount > 0) {
      log("");
      log("Console errors:");
      consoleErrors.forEach((entry, index) => {
        log(`  ${index + 1}. ${entry}`);
      });
    }

    if (runtimeExceptionCount > 0) {
      log("");
      log("Runtime exceptions:");
      runtimeExceptions.forEach((entry, index) => {
        log(`  ${index + 1}. ${entry}`);
      });
    }

    const failCount = checks.filter((check) => !check.passed).length;
    const passCount = checks.length - failCount;
    const elapsedMs = Date.now() - startedAt;

    log("");
    if (failCount === 0) {
      log(`SUMMARY: PASS (${passCount} checks, ${elapsedMs} ms)`);
      log(`Console: 0 errors, 0 runtime exceptions.`);
      return 0;
    }

    log(`SUMMARY: FAIL (${passCount} passed, ${failCount} failed, ${elapsedMs} ms)`);
    return 1;
  } finally {
    if (cdpClient) {
      cdpClient.close();
    }
    killProcessTree(edgeProcess, "Edge");
    killProcessTree(pythonServer, "Python HTTP server");
  }
}

runSmoke()
  .then((exitCode) => {
    process.exit(exitCode ?? 0);
  })
  .catch((error) => {
    fail(`SUMMARY: FAIL (${error.message})`);
  });
