#!/usr/bin/env node
/**
 * L2 gameplay interaction smoke (zero npm deps).
 * Starts Python HTTP + Edge headless + CDP, drives golden-path clicks on #game,
 * verifies observable canvas/HUD signals without modifying Game/.
 *
 * Usage: node Scripts/verify-gameplay-smoke.mjs
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

const WINDOW_WIDTH = 1280;
const WINDOW_HEIGHT = 720;
const CENTER_X = WINDOW_WIDTH / 2;
const CENTER_Y = WINDOW_HEIGHT / 2;
const CELL_SIZE = 56;

const PAGE_LOAD_TIMEOUT_MS = 20_000;
const RUNTIME_SETTLE_MS = 1_500;
const STEP_DELAY_MS = 120;
const MINING_WAIT_MS = 22_000;

const BASE_SPEED = 42;
const THRUSTER_SPEED = 63;
const SPEED_TOLERANCE = 10;

const RESTART_BUTTON = { x: 32, y: 220, width: 92, height: 32 };

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

  getRuntimeIssues() {
    const consoleErrors = this.consoleErrors.filter((entry) => !isBenignConsoleError(entry));
    return {
      consoleErrors,
      runtimeExceptions: this.runtimeExceptions,
      count: consoleErrors.length + this.runtimeExceptions.length,
    };
  }
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });

  if (result.exceptionDetails) {
    const text =
      result.exceptionDetails.exception?.description ||
      result.exceptionDetails.text ||
      "Runtime.evaluate exception";
    throw new Error(text);
  }

  return result.result?.value;
}

async function clickCanvas(client, x, y) {
  await evaluate(
    client,
    `(function() {
      const canvas = document.querySelector('#game');
      if (!canvas) return false;
      const opts = {
        bubbles: true,
        cancelable: true,
        clientX: ${x},
        clientY: ${y},
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
        button: 0,
        buttons: 1,
      };
      canvas.dispatchEvent(new PointerEvent('pointerdown', opts));
      return true;
    })()`,
  );
  await delay(STEP_DELAY_MS);
}

function gridToScreenFromCore(coreX, coreY, gx, gy) {
  return {
    x: coreX + gx * CELL_SIZE,
    y: coreY + gy * CELL_SIZE,
  };
}

function buildMenuItemCenter(coreX, coreY, frameGx, frameGy, optionIndex) {
  const frame = gridToScreenFromCore(coreX, coreY, frameGx, frameGy);
  return {
    x: frame.x + CELL_SIZE * 0.5 + 10 + 59,
    y: frame.y - 34 + optionIndex * 38 + 16,
  };
}

async function clickGrid(client, gx, gy) {
  const core = await findCoreCenter(client);
  if (!core) {
    throw new Error("Could not locate station core on canvas.");
  }
  const target = gridToScreenFromCore(core.x, core.y, gx, gy);
  await clickCanvas(client, target.x, target.y);
  return core;
}

async function clickBuildMenu(client, frameGx, frameGy, optionIndex) {
  const core = await findCoreCenter(client);
  if (!core) {
    throw new Error("Could not locate station core on canvas.");
  }
  const item = buildMenuItemCenter(core.x, core.y, frameGx, frameGy, optionIndex);
  await clickCanvas(client, item.x, item.y);
  await clickCanvas(client, item.x, item.y);
  return core;
}

async function findCoreCenter(client) {
  return evaluate(
    client,
    `(function() {
      const canvas = document.querySelector('#game');
      if (!canvas) return null;
      const ctx = canvas.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = img.data;
      const w = canvas.width;
      let sumX = 0;
      let sumY = 0;
      let count = 0;
      for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
          const i = (y * w + x) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          if (a > 180 && r >= 45 && r <= 95 && g >= 130 && g <= 205 && b >= 230) {
            sumX += x;
            sumY += y;
            count += 1;
          }
        }
      }
      if (count < 8) return null;
      return {
        x: (sumX / count) / dpr,
        y: (sumY / count) / dpr,
      };
    })()`,
  );
}

async function regionFingerprint(client, x, y, width, height) {
  return evaluate(
    client,
    `(function() {
      const canvas = document.querySelector('#game');
      if (!canvas) return null;
      const ctx = canvas.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      const sx = Math.max(0, Math.floor(${x} * dpr));
      const sy = Math.max(0, Math.floor(${y} * dpr));
      const sw = Math.max(1, Math.floor(${width} * dpr));
      const sh = Math.max(1, Math.floor(${height} * dpr));
      const img = ctx.getImageData(sx, sy, sw, sh);
      let hash = 2166136261;
      for (let i = 0; i < img.data.length; i += 16) {
        hash ^= img.data[i];
        hash = Math.imul(hash, 16777619);
      }
      return { hash: hash >>> 0, pixels: img.data.length / 4 };
    })()`,
  );
}

async function hasMoveTargetRing(client, screenX, screenY) {
  return evaluate(
    client,
    `(function() {
      const canvas = document.querySelector('#game');
      if (!canvas) return false;
      const ctx = canvas.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      const cx = ${screenX} * dpr;
      const cy = ${screenY} * dpr;
      const radius = 10 * dpr;
      let hits = 0;
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
        const x = Math.floor(cx + Math.cos(a) * radius);
        const y = Math.floor(cy + Math.sin(a) * radius);
        if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) continue;
        const pixel = ctx.getImageData(x, y, 1, 1).data;
        const r = pixel[0];
        const g = pixel[1];
        const b = pixel[2];
        const aPx = pixel[3];
        if (aPx > 20 && b > g && r < 120) {
          hits += 1;
        }
      }
      return hits >= 4;
    })()`,
  );
}

async function countEnemyPixels(client) {
  return evaluate(
    client,
    `(function() {
      const canvas = document.querySelector('#game');
      if (!canvas) return 0;
      const ctx = canvas.getContext('2d');
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = img.data;
      let hits = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];
        if (a > 120 && r >= 200 && g >= 70 && g <= 190 && b >= 20 && b <= 110) {
          hits += 1;
        }
      }
      return hits;
    })()`,
  );
}

async function buildFrameAndFacility(client, gx, gy, optionIndex) {
  await clickGrid(client, gx, gy);
  await clickGrid(client, gx, gy);
  await clickBuildMenu(client, gx, gy, optionIndex);
}

async function measureMovementSpeed(client, targetX, targetY, sampleMs = 900) {
  await clickCanvas(client, targetX, targetY);
  await delay(250);
  const start = await findCoreCenter(client);
  if (!start) {
    return null;
  }
  await delay(sampleMs);
  const end = await findCoreCenter(client);
  if (!end) {
    return null;
  }
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  return distance / (sampleMs / 1000);
}

class SmokeReporter {
  constructor() {
    this.checks = [];
  }

  record(name, passed, detail = "") {
    this.checks.push({ name, passed, detail });
    const status = passed ? "PASS" : "FAIL";
    log(`[${status}] ${name}`);
    if (detail) {
      log(`       ${detail}`);
    }
  }

  runtimeCheck(client, label) {
    const issues = client.getRuntimeIssues();
    this.record(
      label,
      issues.count === 0,
      issues.count === 0
        ? "No console errors or runtime exceptions."
        : `${issues.consoleErrors.length} console error(s), ${issues.runtimeExceptions.length} runtime exception(s).`,
    );
    return issues.count === 0;
  }

  summary(startedAt) {
    const failCount = this.checks.filter((check) => !check.passed).length;
    const passCount = this.checks.length - failCount;
    const elapsedMs = Date.now() - startedAt;
    log("");
    if (failCount === 0) {
      log(`SUMMARY: PASS (${passCount} checks, ${elapsedMs} ms)`);
      return 0;
    }
    log(`SUMMARY: FAIL (${passCount} passed, ${failCount} failed, ${elapsedMs} ms)`);
    return 1;
  }
}

async function runSmoke() {
  const startedAt = Date.now();
  const reporter = new SmokeReporter();

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
  log("LDSpaceGame L2 gameplay interaction smoke");
  log(`Repo: ${repoRoot}`);
  log(`URL: ${gameUrl}`);
  log(`Viewport: ${WINDOW_WIDTH}x${WINDOW_HEIGHT}`);
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
        `--window-size=${WINDOW_WIDTH},${WINDOW_HEIGHT}`,
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
    await cdpClient.send("Emulation.setDeviceMetricsOverride", {
      width: WINDOW_WIDTH,
      height: WINDOW_HEIGHT,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await cdpClient.send("Network.setBlockedURLs", { urls: ["*favicon.ico"] });
    await cdpClient.send("Page.navigate", { url: gameUrl });
    await cdpClient.waitForPageLoad(PAGE_LOAD_TIMEOUT_MS);
    await delay(RUNTIME_SETTLE_MS);

    const pageProbe = await evaluate(
      cdpClient,
      `({
        hasCanvas: !!document.querySelector('#game'),
        title: document.title,
        readyState: document.readyState,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight
      })`,
    );

    reporter.record(
      "Page load event",
      cdpClient.pageLoaded,
      cdpClient.pageLoaded ? "loadEventFired received." : "Timed out waiting for load.",
    );
    reporter.record(
      "Canvas #game exists",
      Boolean(pageProbe?.hasCanvas),
      pageProbe?.hasCanvas ? "Canvas element found." : "Missing #game canvas.",
    );
    reporter.record(
      "Viewport size",
      pageProbe?.innerWidth === WINDOW_WIDTH && pageProbe?.innerHeight === WINDOW_HEIGHT,
      `innerWidth=${pageProbe?.innerWidth ?? "?"}, innerHeight=${pageProbe?.innerHeight ?? "?"} (expected ${WINDOW_WIDTH}x${WINDOW_HEIGHT})`,
    );
    reporter.runtimeCheck(cdpClient, "Console/Runtime clean after load");

    const initialHudMetal = await regionFingerprint(cdpClient, 32, 28, 140, 18);
    const initialRaidHud = await regionFingerprint(cdpClient, 120, 104, 280, 18);

    const moveClickX = 980;
    const moveClickY = 430;
    await clickCanvas(cdpClient, moveClickX, moveClickY);
    const moveRing = await hasMoveTargetRing(cdpClient, moveClickX, moveClickY);
    reporter.record(
      "Move target can be set",
      moveRing === true,
      moveRing ? "Move indicator ring detected near click." : "No move indicator near click.",
    );

    await clickGrid(cdpClient, 1, 0);
    const afterFrameHud = await regionFingerprint(cdpClient, 32, 28, 140, 18);
    reporter.record(
      "Build frame on adjacent slot",
      afterFrameHud && initialHudMetal && afterFrameHud.hash !== initialHudMetal.hash,
      afterFrameHud && initialHudMetal && afterFrameHud.hash !== initialHudMetal.hash
        ? "HUD metal region changed after frame placement."
        : "HUD did not reflect frame cost.",
    );

    await clickGrid(cdpClient, 1, 0);
    await clickBuildMenu(cdpClient, 1, 0, 0);
    const afterMiningHud = await regionFingerprint(cdpClient, 32, 28, 140, 18);
    reporter.record(
      "Build mining facility (double-click menu)",
      afterMiningHud && afterFrameHud && afterMiningHud.hash !== afterFrameHud.hash,
      "Mining station placed; HUD metal region updated.",
    );

    await clickCanvas(cdpClient, 1050, 390);
    await delay(MINING_WAIT_MS);
    const afterMiningWaitHud = await regionFingerprint(cdpClient, 32, 28, 140, 18);
    reporter.record(
      "Mining increases metal near asteroid",
      afterMiningWaitHud && afterMiningHud && afterMiningWaitHud.hash !== afterMiningHud.hash,
      afterMiningWaitHud && afterMiningHud && afterMiningWaitHud.hash !== afterMiningHud.hash
        ? "HUD metal region changed while mining near asteroid."
        : "Metal HUD unchanged after wait (station may not be in range).",
    );

    const speedBefore = await measureMovementSpeed(cdpClient, 150, CENTER_Y);
    reporter.record(
      "Movement speed before thruster (~42)",
      speedBefore !== null &&
        speedBefore >= BASE_SPEED - SPEED_TOLERANCE &&
        speedBefore <= BASE_SPEED + SPEED_TOLERANCE,
      speedBefore === null
        ? "Could not locate core for speed sample."
        : `Sampled ${speedBefore.toFixed(1)} px/s (expected ~${BASE_SPEED}).`,
    );

    await buildFrameAndFacility(cdpClient, -1, 0, 1);
    const raidHudAfterSecond = await regionFingerprint(cdpClient, 120, 104, 280, 18);
    reporter.record(
      "Second facility enters raid warning",
      raidHudAfterSecond && initialRaidHud && raidHudAfterSecond.hash !== initialRaidHud.hash,
      raidHudAfterSecond && initialRaidHud && raidHudAfterSecond.hash !== initialRaidHud.hash
        ? "Raid HUD line changed after 2nd facility."
        : "Raid HUD unchanged after 2nd facility.",
    );

    await buildFrameAndFacility(cdpClient, 0, 1, 2);

    const speedAfter = await measureMovementSpeed(cdpClient, 150, CENTER_Y);
    reporter.record(
      "Movement speed after thruster (~63)",
      speedAfter !== null &&
        speedAfter >= THRUSTER_SPEED - SPEED_TOLERANCE &&
        speedAfter <= THRUSTER_SPEED + SPEED_TOLERANCE,
      speedAfter === null
        ? "Could not locate core for speed sample."
        : `Sampled ${speedAfter.toFixed(1)} px/s (expected ~${THRUSTER_SPEED}).`,
    );

    await buildFrameAndFacility(cdpClient, 0, -1, 1);
    await delay(1_000);
    const enemyPixelsBeforeRestart = await countEnemyPixels(cdpClient);
    const raidHudAfterWave = await regionFingerprint(cdpClient, 120, 104, 280, 18);
    const raidTriggered =
      raidHudAfterWave &&
      raidHudAfterSecond &&
      raidHudAfterWave.hash !== raidHudAfterSecond.hash;
    reporter.record(
      "Fourth facility triggers enemy wave",
      enemyPixelsBeforeRestart >= 40 || raidTriggered,
      `Enemy pixels=${enemyPixelsBeforeRestart}; raid HUD ${raidTriggered ? "changed to triggered state" : "unchanged"}.`,
    );

    reporter.runtimeCheck(cdpClient, "Console/Runtime clean after interactions");

    const restartX = RESTART_BUTTON.x + RESTART_BUTTON.width / 2;
    const restartY = RESTART_BUTTON.y + RESTART_BUTTON.height / 2;
    await clickCanvas(cdpClient, restartX, restartY);
    await delay(RUNTIME_SETTLE_MS);
    const enemiesAfterRestart = await countEnemyPixels(cdpClient);
    const raidHudAfterRestart = await regionFingerprint(cdpClient, 120, 104, 280, 18);
    const metalHudAfterRestart = await regionFingerprint(cdpClient, 32, 28, 140, 18);
    const enemiesCleared =
      enemiesAfterRestart < Math.max(200, Math.floor(enemyPixelsBeforeRestart * 0.15));
    reporter.record(
      "Restart resets raid/enemy state",
      enemiesCleared &&
        raidHudAfterRestart &&
        initialRaidHud &&
        raidHudAfterRestart.hash === initialRaidHud.hash &&
        metalHudAfterRestart &&
        initialHudMetal &&
        metalHudAfterRestart.hash === initialHudMetal.hash,
      `Enemy pixels ${enemyPixelsBeforeRestart} -> ${enemiesAfterRestart}; raid HUD ${raidHudAfterRestart?.hash === initialRaidHud?.hash ? "reset" : "not reset"}; metal HUD ${metalHudAfterRestart?.hash === initialHudMetal?.hash ? "reset" : "not reset"}.`,
    );
    reporter.runtimeCheck(cdpClient, "Console/Runtime clean after restart");

    const exitCode = reporter.summary(startedAt);
    if (exitCode === 0) {
      log("");
      log("Coverage note: victory/defeat full loop not asserted in L2 v1.");
    }
    return exitCode;
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
