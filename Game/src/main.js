const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");

const CELL_SIZE = 56;
const FRAME_COST = 10;
const INITIAL_METAL = 40;
const CORE_POWER_OUTPUT = 10;
const CORE_MAX_HP = 100;
const BASE_SPEED = 42;
const THRUSTER_SPEED_MULTIPLIER = 1.5;
const THRUSTER_COST = 20;
const THRUSTER_POWER = 2;
const OBJECTIVE_RADIUS = 80;
const MINING_COST = 25;
const MINING_POWER = 4;
const MINING_RATE = 5;
const MINING_RADIUS = 160;
const TURRET_COST = 30;
const TURRET_POWER = 3;
const TURRET_DAMAGE = 10;
const TURRET_COOLDOWN = 0.8;
const TURRET_RANGE = 220;
const ENEMY_COUNT = 5;
const ENEMY_HP = 20;
const ENEMY_SPEED = 24;
const ENEMY_CONTACT_RADIUS = 34;
const ENEMY_CORE_DPS = 5;
const PROJECTILE_TTL = 0.16;
const RESTART_BUTTON = { x: 32, y: 220, width: 92, height: 32 };

const ASTEROIDS = [
  { x: 330, y: 40, radius: 34 },
  { x: -300, y: 160, radius: 42 },
  { x: 150, y: -260, radius: 30 },
];

const BUILD_OPTIONS = [
  { type: "mining", label: "采矿站", cost: MINING_COST },
  { type: "turret", label: "炮塔", cost: TURRET_COST },
  { type: "thruster", label: "推进器", cost: THRUSTER_COST },
];

function createInitialState() {
  return {
    metal: INITIAL_METAL,
    powerProduced: CORE_POWER_OUTPUT,
    powerUsed: 0,
    coreHp: CORE_MAX_HP,
    objectiveTarget: { x: 400, y: 0 },
    stageAComplete: false,
    selectedFrameKey: null,
    selectedBuildType: null,
    waveStarted: false,
    gameOver: null,
    facilityCount: 0,
    enemies: [],
    projectiles: [],
    station: {
      x: 0,
      y: 0,
      moveTarget: null,
      modules: new Map([["0,0", { type: "core", gx: 0, gy: 0, active: true }]]),
    },
    mouseWorld: { x: 0, y: 0 },
    lastTime: performance.now(),
  };
}

let state = createInitialState();

function moduleKey(gx, gy) {
  return `${gx},${gy}`;
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function screenToWorld(screenX, screenY) {
  return {
    x: screenX - window.innerWidth / 2,
    y: screenY - window.innerHeight / 2,
  };
}

function worldToScreen(worldX, worldY) {
  return {
    x: worldX + window.innerWidth / 2,
    y: worldY + window.innerHeight / 2,
  };
}

function worldToGrid(worldX, worldY) {
  return {
    gx: Math.round((worldX - state.station.x) / CELL_SIZE),
    gy: Math.round((worldY - state.station.y) / CELL_SIZE),
  };
}

function gridToWorld(gx, gy) {
  return {
    x: state.station.x + gx * CELL_SIZE,
    y: state.station.y + gy * CELL_SIZE,
  };
}

function hasModule(gx, gy) {
  return state.station.modules.has(moduleKey(gx, gy));
}

function isOrthogonallyAdjacentToModule(gx, gy) {
  return (
    hasModule(gx + 1, gy) ||
    hasModule(gx - 1, gy) ||
    hasModule(gx, gy + 1) ||
    hasModule(gx, gy - 1)
  );
}

function isBuildableFrameSlot(gx, gy) {
  return !hasModule(gx, gy) && isOrthogonallyAdjacentToModule(gx, gy) && state.metal >= FRAME_COST;
}

function hasThruster() {
  for (const module of state.station.modules.values()) {
    if (module.type === "thruster" && module.active) {
      return true;
    }
  }
  return false;
}

function addFrame(gx, gy) {
  if (!isBuildableFrameSlot(gx, gy)) {
    return false;
  }

  state.station.modules.set(moduleKey(gx, gy), { type: "frame", gx, gy, active: true });
  state.metal -= FRAME_COST;
  clearBuildSelection();
  return true;
}

function setMoveTarget(worldX, worldY) {
  state.station.moveTarget = { x: worldX, y: worldY };
}

function updateStation(dt) {
  if (state.gameOver) {
    return;
  }

  const target = state.station.moveTarget;
  if (!target) {
    return;
  }

  const dx = target.x - state.station.x;
  const dy = target.y - state.station.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 1) {
    state.station.x = target.x;
    state.station.y = target.y;
    state.station.moveTarget = null;
    return;
  }

  const speed = BASE_SPEED * (hasThruster() ? THRUSTER_SPEED_MULTIPLIER : 1);
  const step = Math.min(distance, speed * dt);
  state.station.x += (dx / distance) * step;
  state.station.y += (dy / distance) * step;
}

function getFrameCount() {
  let count = 0;
  for (const module of state.station.modules.values()) {
    if (
      module.type === "frame" ||
      module.type === "mining" ||
      module.type === "turret" ||
      module.type === "thruster"
    ) {
      count += 1;
    }
  }
  return count;
}

function getObjectiveDistance() {
  return Math.hypot(
    state.objectiveTarget.x - state.station.x,
    state.objectiveTarget.y - state.station.y,
  );
}

function updateStageObjective() {
  state.stageAComplete = getFrameCount() >= 5 && getObjectiveDistance() < OBJECTIVE_RADIUS;
}

function clearBuildSelection() {
  state.selectedFrameKey = null;
  state.selectedBuildType = null;
}

function getFacilityCost(type) {
  if (type === "mining") {
    return MINING_COST;
  }
  if (type === "turret") {
    return TURRET_COST;
  }
  if (type === "thruster") {
    return THRUSTER_COST;
  }
  return Infinity;
}

function buildFacility(type) {
  const key = state.selectedFrameKey;
  const module = key ? state.station.modules.get(key) : null;
  const cost = getFacilityCost(type);
  if (!module || module.type !== "frame" || state.metal < cost || state.gameOver) {
    return false;
  }

  module.type = type;
  module.active = true;
  module.cooldown = 0;
  state.metal -= cost;
  state.facilityCount += 1;
  clearBuildSelection();

  // GAME-004 prototype trigger: starting the raid on the second facility makes the loop fast to test.
  if (!state.waveStarted && state.facilityCount >= 2) {
    spawnEnemyWave();
  }
  return true;
}

function resetGame() {
  state = createInitialState();
}

function isPointInRect(x, y, rect) {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

function getBuildMenuItems() {
  if (!state.selectedFrameKey) {
    return [];
  }

  const module = state.station.modules.get(state.selectedFrameKey);
  if (!module || module.type !== "frame") {
    return [];
  }

  const world = gridToWorld(module.gx, module.gy);
  const screen = worldToScreen(world.x, world.y);
  return BUILD_OPTIONS.map((option, index) => ({
    ...option,
    x: screen.x + CELL_SIZE * 0.5 + 10,
    y: screen.y - 34 + index * 38,
    width: 118,
    height: 32,
  }));
}

function getModuleWorld(module) {
  return gridToWorld(module.gx, module.gy);
}

function getNearestAsteroidDistance(module) {
  const world = getModuleWorld(module);
  let nearest = Infinity;
  for (const asteroid of ASTEROIDS) {
    nearest = Math.min(nearest, Math.hypot(asteroid.x - world.x, asteroid.y - world.y));
  }
  return nearest;
}

function updatePowerAllocation() {
  let remainingPower = state.powerProduced;
  let usedPower = 0;
  const turrets = [];
  const thrusters = [];
  const miningStations = [];

  for (const module of state.station.modules.values()) {
    module.active = module.type === "core" || module.type === "frame";
    if (module.type === "turret") {
      turrets.push(module);
    } else if (module.type === "thruster") {
      thrusters.push(module);
    } else if (module.type === "mining") {
      miningStations.push(module);
    }
  }

  // Power shortage rule: turrets stay online before thrusters, then mining stations.
  for (const module of [...turrets, ...thrusters, ...miningStations]) {
    let need = MINING_POWER;
    if (module.type === "turret") {
      need = TURRET_POWER;
    } else if (module.type === "thruster") {
      need = THRUSTER_POWER;
    }
    module.active = remainingPower >= need;
    if (module.active) {
      remainingPower -= need;
      usedPower += need;
    }
  }

  state.powerUsed = usedPower;
}

function updateMining(dt) {
  for (const module of state.station.modules.values()) {
    if (module.type !== "mining" || !module.active) {
      continue;
    }

    if (getNearestAsteroidDistance(module) <= MINING_RADIUS) {
      state.metal += MINING_RATE * dt;
    }
  }
}

function spawnEnemyWave() {
  state.waveStarted = true;
  state.enemies = [];

  const spawnDistance = Math.max(window.innerWidth, window.innerHeight) * 0.55 + 180;
  for (let i = 0; i < ENEMY_COUNT; i += 1) {
    const angle = -Math.PI * 0.15 + (i / Math.max(1, ENEMY_COUNT - 1)) * Math.PI * 0.3;
    state.enemies.push({
      x: state.station.x + Math.cos(angle) * spawnDistance,
      y: state.station.y + Math.sin(angle) * spawnDistance,
      hp: ENEMY_HP,
    });
  }
}

function updateEnemies(dt) {
  if (!state.waveStarted || state.gameOver) {
    return;
  }

  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) {
      continue;
    }

    const dx = state.station.x - enemy.x;
    const dy = state.station.y - enemy.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= ENEMY_CONTACT_RADIUS) {
      state.coreHp -= ENEMY_CORE_DPS * dt;
      continue;
    }

    const step = Math.min(distance, ENEMY_SPEED * dt);
    enemy.x += (dx / distance) * step;
    enemy.y += (dy / distance) * step;
  }

  state.enemies = state.enemies.filter((enemy) => enemy.hp > 0);
}

function updateTurrets(dt) {
  if (state.gameOver) {
    return;
  }

  for (const module of state.station.modules.values()) {
    if (module.type !== "turret") {
      continue;
    }

    module.cooldown = Math.max(0, (module.cooldown || 0) - dt);
    if (!module.active || module.cooldown > 0) {
      continue;
    }

    const world = getModuleWorld(module);
    let target = null;
    let targetDistance = Infinity;
    for (const enemy of state.enemies) {
      const distance = Math.hypot(enemy.x - world.x, enemy.y - world.y);
      if (distance <= TURRET_RANGE && distance < targetDistance) {
        target = enemy;
        targetDistance = distance;
      }
    }

    if (!target) {
      continue;
    }

    target.hp -= TURRET_DAMAGE;
    module.cooldown = TURRET_COOLDOWN;
    state.projectiles.push({
      fromX: world.x,
      fromY: world.y,
      toX: target.x,
      toY: target.y,
      ttl: PROJECTILE_TTL,
    });
  }

  state.enemies = state.enemies.filter((enemy) => enemy.hp > 0);
}

function updateProjectiles(dt) {
  for (const projectile of state.projectiles) {
    projectile.ttl -= dt;
  }
  state.projectiles = state.projectiles.filter((projectile) => projectile.ttl > 0);
}

function updateGameResult() {
  if (state.gameOver) {
    return;
  }

  if (state.coreHp <= 0) {
    state.coreHp = 0;
    state.gameOver = "defeat";
    state.station.moveTarget = null;
    return;
  }

  if (state.waveStarted && state.enemies.length === 0) {
    state.gameOver = "victory";
    state.station.moveTarget = null;
  }
}

function drawBackground() {
  ctx.fillStyle = "#07111f";
  ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

  ctx.fillStyle = "rgba(200, 235, 255, 0.35)";
  for (let i = 0; i < 120; i += 1) {
    const x = (i * 137.3) % window.innerWidth;
    const y = (i * 73.9) % window.innerHeight;
    ctx.fillRect(x, y, 1.5, 1.5);
  }
}

function drawAsteroids() {
  for (const asteroid of ASTEROIDS) {
    const screen = worldToScreen(asteroid.x, asteroid.y);
    ctx.fillStyle = "#6e7480";
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, asteroid.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#a7adba";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.strokeStyle = "rgba(150, 180, 190, 0.18)";
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, MINING_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawBuildSlots() {
  ctx.strokeStyle = "rgba(91, 255, 180, 0.38)";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);

  const slots = new Map();
  for (const module of state.station.modules.values()) {
    for (const [gx, gy] of [
      [module.gx + 1, module.gy],
      [module.gx - 1, module.gy],
      [module.gx, module.gy + 1],
      [module.gx, module.gy - 1],
    ]) {
      slots.set(moduleKey(gx, gy), { gx, gy });
    }
  }

  for (const { gx, gy } of slots.values()) {
    if (!isBuildableFrameSlot(gx, gy)) {
      continue;
    }

    const world = gridToWorld(gx, gy);
    const screen = worldToScreen(world.x, world.y);
    ctx.strokeRect(
      screen.x - CELL_SIZE / 2,
      screen.y - CELL_SIZE / 2,
      CELL_SIZE,
      CELL_SIZE,
    );
  }

  ctx.setLineDash([]);
}

function drawModule(module) {
  const world = gridToWorld(module.gx, module.gy);
  const screen = worldToScreen(world.x, world.y);

  if (module.type === "core") {
    ctx.fillStyle = "#49a7ff";
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, CELL_SIZE * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#dff7ff";
    ctx.fillRect(screen.x - 8, screen.y - 8, 16, 16);
    return;
  }

  if (module.type === "mining") {
    ctx.fillStyle = module.active ? "#45d66f" : "#306d42";
  } else if (module.type === "turret") {
    ctx.fillStyle = module.active ? "#e64d54" : "#7d3338";
  } else if (module.type === "thruster") {
    ctx.fillStyle = module.active ? "#7f7cff" : "#3f3c78";
  } else {
    ctx.fillStyle = "#a8b0bd";
  }

  ctx.fillRect(
    screen.x - CELL_SIZE * 0.36,
    screen.y - CELL_SIZE * 0.36,
    CELL_SIZE * 0.72,
    CELL_SIZE * 0.72,
  );
  ctx.strokeStyle = "#d8dde8";
  ctx.lineWidth = 2;
  ctx.strokeRect(
    screen.x - CELL_SIZE * 0.36,
    screen.y - CELL_SIZE * 0.36,
    CELL_SIZE * 0.72,
    CELL_SIZE * 0.72,
  );

  if (module.type === "thruster") {
    ctx.fillStyle = module.active ? "#cfd2ff" : "#7779aa";
    ctx.beginPath();
    ctx.moveTo(screen.x - 12, screen.y - 14);
    ctx.lineTo(screen.x + 14, screen.y);
    ctx.lineTo(screen.x - 12, screen.y + 14);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = module.active ? "#ffcf5a" : "#8a6f38";
    ctx.fillRect(screen.x - 20, screen.y - 8, 8, 16);
  }

  if (!module.active && (module.type === "mining" || module.type === "turret" || module.type === "thruster")) {
    ctx.fillStyle = "#ffd36a";
    ctx.font = "12px Segoe UI, Arial, sans-serif";
    ctx.fillText("停电", screen.x - 14, screen.y + 4);
  }
}

function drawObjectiveTarget() {
  const target = state.objectiveTarget;
  if (!target) {
    return;
  }

  const screen = worldToScreen(target.x, target.y);
  ctx.strokeStyle = "#ffcf5a";
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.arc(screen.x, screen.y, OBJECTIVE_RADIUS, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(screen.x - 12, screen.y);
  ctx.lineTo(screen.x + 12, screen.y);
  ctx.moveTo(screen.x, screen.y - 12);
  ctx.lineTo(screen.x, screen.y + 12);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(screen.x, screen.y, 18, 0, Math.PI * 2);
  ctx.stroke();
}

function drawMoveTarget() {
  const target = state.station.moveTarget;
  if (!target) {
    return;
  }

  const screen = worldToScreen(target.x, target.y);
  ctx.strokeStyle = "rgba(73, 167, 255, 0.72)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(screen.x, screen.y, 10, 0, Math.PI * 2);
  ctx.stroke();
}

function drawEnemies() {
  for (const enemy of state.enemies) {
    const screen = worldToScreen(enemy.x, enemy.y);
    ctx.fillStyle = "#ff8c3a";
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, 14, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#1b0d07";
    ctx.fillRect(screen.x - 11, screen.y - 22, 22, 4);
    ctx.fillStyle = "#ffdf80";
    ctx.fillRect(screen.x - 11, screen.y - 22, 22 * Math.max(0, enemy.hp / ENEMY_HP), 4);
  }
}

function drawProjectiles() {
  ctx.strokeStyle = "#ffd36a";
  ctx.lineWidth = 3;
  for (const projectile of state.projectiles) {
    const from = worldToScreen(projectile.fromX, projectile.fromY);
    const to = worldToScreen(projectile.toX, projectile.toY);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }
}

function drawBuildMenu() {
  const items = getBuildMenuItems();
  if (items.length === 0) {
    return;
  }

  for (const item of items) {
    const affordable = state.metal >= item.cost;
    ctx.fillStyle = state.selectedBuildType === item.type ? "#315a78" : "rgba(6, 20, 36, 0.92)";
    ctx.fillRect(item.x, item.y, item.width, item.height);
    ctx.strokeStyle = affordable ? "#d9f3ff" : "#657080";
    ctx.lineWidth = 1;
    ctx.strokeRect(item.x, item.y, item.width, item.height);
    ctx.fillStyle = affordable ? "#d9f3ff" : "#87909d";
    ctx.font = "13px Segoe UI, Arial, sans-serif";
    ctx.fillText(`${item.label} ${item.cost}`, item.x + 10, item.y + 21);
  }
}

function drawRestartButton() {
  ctx.fillStyle = "rgba(6, 20, 36, 0.92)";
  ctx.fillRect(RESTART_BUTTON.x, RESTART_BUTTON.y, RESTART_BUTTON.width, RESTART_BUTTON.height);
  ctx.strokeStyle = "#d9f3ff";
  ctx.strokeRect(RESTART_BUTTON.x, RESTART_BUTTON.y, RESTART_BUTTON.width, RESTART_BUTTON.height);
  ctx.fillStyle = "#d9f3ff";
  ctx.font = "14px Segoe UI, Arial, sans-serif";
  ctx.fillText("重开", RESTART_BUTTON.x + 30, RESTART_BUTTON.y + 21);
}

function drawHud() {
  const moduleCount = state.station.modules.size;
  const frameCount = getFrameCount();
  const objectiveDistance = getObjectiveDistance();
  const speed = BASE_SPEED * (hasThruster() ? THRUSTER_SPEED_MULTIPLIER : 1);
  const livingEnemies = state.enemies.length;

  ctx.fillStyle = "rgba(2, 8, 18, 0.72)";
  ctx.fillRect(16, 16, 470, 250);
  ctx.fillStyle = "#d9f3ff";
  ctx.font = "15px Segoe UI, Arial, sans-serif";
  ctx.fillText(
    `金属: ${Math.floor(state.metal)}  (框架${FRAME_COST}/采矿${MINING_COST}/炮塔${TURRET_COST}/推进${THRUSTER_COST})`,
    32,
    44,
  );
  ctx.fillText(`电力: +${state.powerProduced} / -${state.powerUsed}`, 32, 68);
  ctx.fillText(`核心HP: ${Math.ceil(state.coreHp)} / ${CORE_MAX_HP}`, 32, 92);
  ctx.fillText(`敌人: ${livingEnemies} / ${ENEMY_COUNT}  敌袭: ${state.waveStarted ? "已触发" : "建造第2个设施触发"}`, 32, 116);
  ctx.fillText(`模块: ${moduleCount}  结构: ${frameCount}/5  目标距离: ${objectiveDistance.toFixed(0)}`, 32, 140);
  ctx.fillText(`速度: ${speed.toFixed(0)} world/s  推进器: ${hasThruster() ? "在线" : "无/停电"}  采矿半径: ${MINING_RADIUS}`, 32, 164);
  ctx.fillText("操作: 点击绿色邻格建框架；点击frame开菜单；设施含采矿/炮塔/推进器。", 32, 188);

  if (state.stageAComplete) {
    ctx.fillStyle = "#5bffb4";
    ctx.font = "22px Segoe UI, Arial, sans-serif";
    ctx.fillText("阶段 A 能力达成", 150, 242);
  }

  drawRestartButton();
}

function drawOverlay() {
  if (!state.gameOver) {
    return;
  }

  ctx.fillStyle = "rgba(0, 0, 0, 0.58)";
  ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
  ctx.fillStyle = state.gameOver === "victory" ? "#5bffb4" : "#ff6b6b";
  ctx.font = "44px Segoe UI, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(state.gameOver === "victory" ? "胜利" : "失败", window.innerWidth / 2, window.innerHeight / 2 - 18);
  ctx.fillStyle = "#d9f3ff";
  ctx.font = "18px Segoe UI, Arial, sans-serif";
  ctx.fillText("点击左上角「重开」重新开始", window.innerWidth / 2, window.innerHeight / 2 + 24);
  ctx.textAlign = "left";
  drawRestartButton();
}

function render() {
  drawBackground();
  drawAsteroids();
  drawBuildSlots();

  for (const module of state.station.modules.values()) {
    drawModule(module);
  }

  drawObjectiveTarget();
  drawMoveTarget();
  drawEnemies();
  drawProjectiles();
  drawBuildMenu();
  drawHud();
  drawOverlay();
}

function tick(now) {
  const dt = Math.min((now - state.lastTime) / 1000, 0.05);
  state.lastTime = now;

  updatePowerAllocation();
  updateStation(dt);
  updateMining(dt);
  updateTurrets(dt);
  updateEnemies(dt);
  updateProjectiles(dt);
  updateStageObjective();
  updateGameResult();
  render();
  requestAnimationFrame(tick);
}

canvas.addEventListener("pointermove", (event) => {
  state.mouseWorld = screenToWorld(event.clientX, event.clientY);
});

canvas.addEventListener("pointerdown", (event) => {
  if (isPointInRect(event.clientX, event.clientY, RESTART_BUTTON)) {
    resetGame();
    return;
  }

  for (const item of getBuildMenuItems()) {
    if (isPointInRect(event.clientX, event.clientY, item)) {
      if (state.selectedBuildType === item.type) {
        buildFacility(item.type);
      } else {
        state.selectedBuildType = item.type;
      }
      return;
    }
  }

  if (state.gameOver) {
    return;
  }

  const world = screenToWorld(event.clientX, event.clientY);
  state.mouseWorld = world;

  const grid = worldToGrid(world.x, world.y);
  const key = moduleKey(grid.gx, grid.gy);
  const module = state.station.modules.get(key);
  if (module?.type === "frame") {
    if (state.selectedFrameKey === key) {
      clearBuildSelection();
    } else {
      state.selectedFrameKey = key;
      state.selectedBuildType = null;
    }
    return;
  }

  if (addFrame(grid.gx, grid.gy)) {
    return;
  }

  if (!hasModule(grid.gx, grid.gy)) {
    clearBuildSelection();
    setMoveTarget(world.x, world.y);
  }
});

window.addEventListener("resize", resizeCanvas);

resizeCanvas();
requestAnimationFrame(tick);
