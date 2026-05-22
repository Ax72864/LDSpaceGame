# v0.1-prototype 任务看板

> 制作人方向：首版需证明「布局影响移动与生存」；工程分阶段交付，避免一次性堆全系统。

## 版本目标（最终 v0.1.0-prototype）

浏览器可运行的 HTML5/WebGL 2D 太空站原型，单局 3–5 分钟可完成核心循环：

- 核心 + 框架扩展 + 5 类以内模块（推进器、采矿、炮塔、装甲等，分阶段接入）
- 简化资源：`金属`、`电力`
- 点击目的地移动，推进器布局影响移动效率（v0.1 可先极简物理）
- 小行星采矿 + 一波敌袭 + 胜败结算（第二阶段，依赖本阶段骨架）

## 阶段 A（当前冲刺）— 可玩骨架

- 初始核心可显示
- 从核心扩展基础框架（消耗金属）
- HUD 显示金属、电力
- 点击地图设置移动目的地，太空站朝目标移动
- **不含**：战斗、敌人、科研、联机、复杂资源链

## 不在范围（全版本 v0.1 仍不做）

- 多关卡星系、Roguelike 局外、联机、异步对战
- 导弹、护盾、维修无人机、脱落重连
- 推进器遮挡检测、复杂刚体物理
- 正式美术与移动端完整适配

## 任务表

| ID | 标题 | 负责人 | 状态 | 依赖 | 验收标准 |
|---|---|---|---|---|---|
| PM-001 | 冻结范围与验收口径 | 制作人/PM | 完成 | — | 本文档 |
| SYS-001 | 最小核心循环与模块表 | game-system-designer | 完成 | PM-001 | `Docs/v0.1-core-loop.md` |
| ENG-001 | HTML5 工程框架 | game-prototype-developer | 完成 | PM-001 | `Game/` 可启动、游戏循环无报错 |
| ENG-002 | 输入与坐标系统 | game-prototype-developer | 完成 | ENG-001 | 点击得世界坐标 |
| GAME-001 | 核心与框架数据结构 | game-prototype-developer | 完成 | ENG-001 | 1 核心 + 模块 Map |
| GAME-002 | 框架建造交互 | game-prototype-developer | 完成 | GAME-001 | 任意正交邻格可建 |
| GAME-003 | 金属/电力 HUD | game-prototype-developer | 完成 | GAME-001 | HUD 显示资源 |
| PHYS-001 | 点击目的地移动 | game-prototype-developer | 完成 | ENG-002 | 点击设目标、整体移动 |
| GAME-002b | 阶段 A 胜利目标 | game-prototype-developer | 完成 | GAME-002 | 5 框架 + 到达目标点 |
| GAME-004 | 采矿 + 敌袭 + 结算 | game-prototype-developer | 完成 | 阶段 A 完成 | 制作人 v0.1 完整闭环 |
| QA-001 | 原型自测 | game-polish-developer | 完成 | 阶段 A+B | 无阻塞；轻微项见看板备注 |
| REL-001 | 发布 v0.1.0-prototype | PM + it-engineer | 完成 | QA-001 + GAME-004 | tag + Releases 目录 |

## v0.2 下一轮：推进器可建造并影响移动

> 制作人方向：补齐 v0.1 发布后遗留的最小玩法缺口，让“推进器影响移动”从隐藏分支变成可建造、可供电、可观察的系统规则。该任务触及核心玩法/系统规则，按高风险流程执行。

### 高风险流程

1. 制作人确认方向与取舍：已确认。
2. PM 拆分任务与验收口径：当前记录。
3. game-prototype-developer 执行最小实现。
4. game-code-god 或 game-system-designer 专项审核核心规则。
5. PM 汇总审核范围、风险和验收结果。
6. 制作人最终体验验收与是否进入后续发布决定。

### 规则冻结

- 推进器成本：20 金属。
- 推进器消耗：2 电力。
- 至少 1 个 active 推进器时，速度使用现有 `THRUSTER_SPEED_MULTIPLIER = 1.5`。
- 电力优先级：炮塔 > 推进器 > 采矿站。
- 推进器算设施，参与第 2 个设施触发敌袭。
- 推进器计入结构数量。
- 本轮不做旋转、方向、遮挡、多推进器叠加、复杂物理、新资源。

### 任务表

| ID | 标题 | 负责人 | 状态 | 依赖 | 允许修改范围 | 禁止修改范围 | 验收标准 |
|---|---|---|---|---|---|---|---|
| PM-020 | 冻结推进器最小规则与高风险流程 | game-project-manager | 完成 | 制作人方向 | `Workspaces/game-project-manager/task-board.md` | `Game/`、发布产物、Guard 日志 | 看板记录规则、流程、负责人、验收标准和风险 |
| GAME-020 | 推进器建造与系统接入 | game-prototype-developer | 完成 | PM-020 | `Game/src/main.js`；必要时更新 `README.md` 操作说明 | 不改发布归档；不改 Guard；不新增资源系统；不引入复杂物理；不做旋转/方向/遮挡/叠加 | 框架菜单可建推进器；花费 20 金属；消耗 2 电力；active 推进器使速度从 42 提升到 63；停电推进器不加速；推进器计入结构数和设施数；第 2 个设施含推进器时能触发敌袭 |
| REVIEW-020 | 推进器规则专项审核 | game-code-god 或 game-system-designer | 完成 | GAME-020 | 只读审核 `Game/src/main.js` 与可玩流程 | 不直接修代码；不扩大系统规则 | 确认电力优先级、active 判定、敌袭触发、结构计数、非范围项均符合冻结规则 |
| PM-021 | PM 汇总审核与交付判断 | game-project-manager | 完成 | REVIEW-020 | 看板记录、自检结论、残留风险 | 不改玩法代码 | 汇总执行结果、审核结论、测试覆盖、是否建议交给制作人终验 |

### 验收用例

- 初始金属足够时，建造 1 个框架后可选择建造推进器。
- 建造推进器后金属减少 20，模块数量增加，结构数量增加。
- 有 active 推进器时，HUD 速度显示约为 63 world/s。
- 无 active 推进器时，HUD 速度回到约 42 world/s。
- 同时存在炮塔、推进器、采矿站且电力不足时，优先保证炮塔，其次推进器，最后采矿站。
- 推进器作为第 2 个设施建造时，会触发敌袭。
- 多个推进器不叠加速度。
- 推进器不改变朝向、旋转、碰撞、路径或物理行为。

### 风险

- 当前代码已有 `hasThruster()`，但它只判断类型，不判断 active，必须修正，否则停电推进器仍会加速。
- 当前结构计数只统计框架、采矿站、炮塔，遗漏推进器会影响阶段目标。
- 电力分配当前只有炮塔和采矿站，加入推进器时要避免破坏炮塔优先级。
- 推进器进入设施建造路径后会影响敌袭节奏，这是预期行为，但需要制作人实机确认节奏是否过早。
- 本轮只补齐最小规则，不处理移动手感深调；如果速度提升导致敌袭、采矿距离或胜利目标节奏变化，后续单独调参。

### 执行结果（2026-05-22）

- game-prototype-developer 已完成推进器建造、电力、速度、结构计数、视觉和 HUD 接入，并更新 `README.md` 操作说明。
- game-code-god 专项审核：玩法规则通过；提交前需继续排除 `Guard/logs/daemon.log`。仓库相关文件为 CRLF 入库，默认 `git diff --check` 对新增 CRLF 行会误报 trailing whitespace，本轮保留既有行尾风格以避免整文件格式化。
- PM 汇总审核：通过，可提交进入制作人终验；提交范围限定为 `Game/src/main.js`、`README.md`、`Workspaces/game-project-manager/task-board.md`。
- 制作人终验决定：通过。接受“未实机手测、敌袭节奏可能偏早”的残留风险，先让推进器最小规则进入主线，后续单独调参。
- 已验证：`node --check Game/src/main.js` 通过，ReadLints 无新增问题。

## 本轮执行

GAME-004 已交付（`Game/src/main.js`）。下一步：制作人实机体验调参 → REL-001 发布 `v0.1.0-prototype`。

### REL-001 发布拆分（2026-05-22）

- 状态：已完成，IT 已执行构建归档，PM 已完成范围与提交检查，制作人批准发布。
- 执行者：it-engineer 负责 `Releases/v0.1.0-prototype/` 归档；PM 负责发布清单、变更范围和风险检查；制作人负责最终体验验收与 tag 批准。
- 最小范围：不新增玩法，不修改 `Game/`、`Docs/`、`.cursor/`、`Guard/`；仅把当前已完成原型作为 `v0.1.0-prototype` 留档。
- 发布产物：`Releases/v0.1.0-prototype/` 需包含可运行静态网页构建、版本说明、对应 commit/tag、构建时间、平台信息、已知问题和后续方向。
- 执行检查：
  - [x] 发布前确认工作区无无关变更混入
  - [x] 确认 `Guard/logs/`、`Guard/*.pid`、`Guard/cmd.txt`、守护进程日志等不得进入提交
  - [x] 确认静态网页入口、资源路径和相对路径在归档目录内可运行
  - [x] 确认 `Releases/v0.1.0-prototype/` 内容完整后再创建 tag
  - [x] tag 使用 `v0.1.0-prototype`
- 风险：
  - 静态网页归档可能因相对路径、浏览器本地文件限制或构建目录遗漏导致不可运行，需由 IT 本地打开验证。
  - 当前 QA 仍有轻微问题，允许作为 v0.1.0-prototype 已知问题记录，不阻塞发布。
  - Guard 运行产物和日志属于本机自动化痕迹，必须排除在发布提交外。

### QA-001 备注（2026-05-22）

- 通过：设施建造、电力优先级、采矿、敌波、炮塔、胜败、重开、阶段 A 回归
- 轻微：推进器速度分支无建造入口；敌袭在第 2 个设施时触发（偏测试节奏）；重开按钮重复绘制

### RAID-040 敌袭触发节奏调整（高风险）

- 状态：完成
- 制作人方向：敌袭节奏从“第 2 个设施立即刷敌”调整为“第 2 个设施进入预警，第 4 个设施才真正触发敌袭”，降低早期建设压力，同时保留明确的敌袭预告。
- 高风险原因：该任务修改核心玩法触发规则、HUD 状态反馈和敌袭节奏，必须按高风险流程执行。

#### 高风险流程

1. 制作人确认方向与取舍：已确认，系统策划规则冻结。
2. PM 拆分任务与验收口径：当前记录。
3. `game-prototype-developer` 执行最小实现。
4. `game-system-designer` 或 `game-code-god` 专项审核核心规则。
5. `game-project-manager` 汇总审核范围、验证结果和残留风险。
6. 制作人最终体验验收，决定是否进入后续提交/发布节奏。

#### 规则冻结

- 第 2 个设施只进入敌袭预警，不生成敌人。
- 第 4 个设施才真正触发敌袭。
- `facilityCount < 2`：安全建设期。
- `facilityCount >= 2 && facilityCount < 4 && !waveStarted`：预警期。
- `facilityCount >= 4 && !waveStarted`：调用 `spawnEnemyWave()`，只触发一次。
- HUD 文案：
  - 未到第 2 个设施：提示“建造第2个设施后预警”。
  - 第 2-3 个设施：提示“预警中 / 建造第4个设施触发”。
  - 已触发：提示“已触发”。
- 本轮不新增按钮、倒计时、敌人类型、正式 UI。
- 本轮不改胜负条件、不改资源系统、不改发布归档。

#### 任务表

| ID | 标题 | 负责人 | 状态 | 依赖 | 允许修改范围 | 禁止修改范围 | 验收标准 |
|---|---|---|---|---|---|---|---|
| PM-040 | 冻结 RAID-040 规则与高风险流程 | game-project-manager | 完成 | 制作人方向 | `Workspaces/game-project-manager/task-board.md` | `Game/`、`Releases/`、`Guard/`、`.cursor/`、`Docs/`、其它文件 | 看板记录方向、冻结规则、任务拆分、负责人、允许/禁止范围、验收标准和风险 |
| RAID-040 | 敌袭触发节奏最小实现 | game-prototype-developer | 完成 | PM-040 | 后续执行仅限敌袭触发判断与 HUD 文案相关的最小代码范围 | 不新增按钮、倒计时、敌人类型、正式 UI；不改胜负条件、资源系统、发布归档 | 第 2 个设施只显示预警不刷敌；第 4 个设施调用 `spawnEnemyWave()`；敌袭只触发一次；HUD 三段文案符合冻结规则 |
| REVIEW-040 | 敌袭触发规则专项审核 | game-system-designer 或 game-code-god | 完成 | RAID-040 | 只读审核敌袭触发逻辑、设施计数、HUD 状态反馈和可玩流程 | 不直接修代码；不扩大系统规则；不引入新 UI 或新敌人规则 | 确认 `facilityCount` 阈值、`waveStarted` 单次触发、防重复刷敌、HUD 文案和禁止范围均符合冻结规则 |
| PM-041 | PM 汇总审核与终验建议 | game-project-manager | 完成 | REVIEW-040 | 看板记录、范围检查、验证结论、残留风险 | 不改玩法代码、不改发布归档 | 汇总执行结果、专项审核结论、自检方式、残留风险，并提交制作人终验 |

#### 验收用例

- `facilityCount < 2` 时不显示敌袭已触发状态，HUD 提示“建造第2个设施后预警”。
- 建造到第 2 个设施时进入预警期，不调用 `spawnEnemyWave()`，不生成敌人。
- 第 2-3 个设施期间 HUD 显示“预警中 / 建造第4个设施触发”。
- 建造到第 4 个设施且 `waveStarted === false` 时调用 `spawnEnemyWave()`。
- 第 4 个设施后继续建造设施，不重复触发敌袭。
- 敌袭触发后 HUD 显示“已触发”。
- 胜负条件、资源产消、敌人类型、按钮与发布归档无变化。

#### 风险

- 设施计数口径必须沿用当前代码的设施定义，避免把框架、核心或非设施结构错误计入敌袭阈值。
- `waveStarted` 必须作为单次触发保护，避免第 4 个设施后每次更新或继续建造都重复刷敌。
- HUD 文案变化可能暴露当前 UI 空间不足或状态命名不清，但本轮不做正式 UI，只做最小文本反馈。
- 敌袭延后到第 4 个设施会降低早期压力，可能影响 3-5 分钟单局节奏，需制作人实机体验后再决定是否继续调参。
- 若当前敌袭逻辑与胜负、教程提示或阶段目标耦合，执行者必须保持最小改动，超出范围时回报 PM 和制作人判断。

#### 执行结果（2026-05-22）

- game-prototype-developer 已完成 RAID-040 最小实现：`Game/src/main.js` 新增 `getRaidStatusText()`；第 2 个设施进入预警，第 4 个设施触发 `spawnEnemyWave()`；HUD 接入三段敌袭状态文案。
- `README.md` 已同步操作说明：第 2 个设施进入预警，第 4 个设施触发敌袭。
- game-code-god 专项审核：通过，无必须修复项。
- PM 汇总审核：通过，可进入制作人终验；提交前必须排除无关工作区变更。
- 制作人终验决定：通过。接受“未浏览器实机验证、第 4 个设施节奏可能偏松”的残留风险，先让更合理的准备期进入主线，后续单独体验调参。
- 已验证：`node --check Game/src/main.js` 通过；ReadLints 无新增问题。

### POLISH-030 重开按钮重复绘制修复（低风险）

- 状态：完成
- 负责人建议：`/game-polish-developer`
- 目标：修复游戏结束时重开按钮重复绘制的问题，降低结算界面视觉噪音，不改变核心玩法规则。
- 允许修改范围：后续执行仅限与重开按钮绘制相关的最小代码范围。
- 禁止修改范围：不得修改 `Releases/`、`Guard/`、`.cursor/`、`Docs/`；不得改动核心玩法规则、存档结构、数值框架或发布归档。
- 验收标准：游戏结束界面只绘制一个可点击的重开按钮；胜利、失败、重开流程仍可用；无新增控制台报错；看板记录执行结果、自检方式和残留风险。
- 风险：需确认重复绘制来源，避免只隐藏表现但留下重复点击区域；若结算 UI 与输入处理耦合，执行时应保持最小改动。
- 执行结果：`drawHud()` 仅在非结算状态绘制 HUD 重开按钮；结算状态由 `drawOverlay()` 绘制唯一重开按钮，点击命中区域和重开逻辑未改。
- 验证：`node --check Game/src/main.js` 通过；ReadLints 无新增问题；PM 范围审核通过。
- 残留风险：未做浏览器人工目测，后续若调整渲染顺序需复查结算态按钮可见性。

### VERIF-001 最小可重复验证闭环（低风险）

- 状态：完成
- 负责人：`game-tools-developer`
- 目标：建立后续 `Game/` 改动的最低验证闭环，包含 L0 静态检查和 L1 浏览器人工冒烟清单。
- 允许修改范围：`Scripts/validate-static.ps1`、`Docs/smoke-checklist.md`、`README.md`、本看板记录。
- 禁止修改范围：`Game/` 玩法代码、`Releases/`、`Guard/`、系统配置、依赖配置。
- 验收标准：PowerShell 脚本可一键运行；失败时非 0；README 可找到命令；冒烟清单覆盖 Canvas、控制台、移动、建造、采矿、敌袭、胜败、重开。
- 验证结果：主 agent 已运行 `pwsh -NoProfile -ExecutionPolicy Bypass -File Scripts/validate-static.ps1`，结果 `SUMMARY: PASS (6 checks)`。
- 反馈来源：L0 PowerShell 输出、PM 只读范围审核、文档覆盖检查。
- 残留风险：本轮未实际执行 L1 浏览器冒烟；L0 不覆盖运行时逻辑、CSS 语义和完整交互回归。后续涉及核心玩法、输入、胜败或发布时仍需补 L1，复杂/重复路径升级到 L2 自动化。

### SMOKE-001 L0 + HTTP 静态入口冒烟记录（2026-05-23）

- 状态：完成
- 风险等级：低风险验证记录
- 负责人：`game-tools-developer`
- 目标：补一次可追溯的 L0 静态检查与 HTTP 静态入口冒烟反馈，不新增玩法。
- 允许范围：运行 `Scripts/validate-static.ps1`；短生命周期启动 Python HTTP 服务；检查入口页面和静态资源；记录验证结果。
- 禁止范围：不修改 `Game/` 玩法代码；不修改发布归档；不提交 `Guard/logs/`、终端缓存、截图录像临时产物或无关文件。
- 验证结果：
  - L0：`SUMMARY: PASS (6 checks, 701 ms)`。
  - HTTP 服务：`python -m http.server 8765 --directory Game` 短生命周期启动，探测后已停止。
  - HTTP 冒烟：`/`、`/src/main.js`、`/src/styles.css` 均返回 200；入口 HTML 包含 `<canvas`、`./src/main.js` 和 `./src/styles.css` 引用。
  - 浏览器可用性：本机 Chrome、Edge 可执行文件存在；Edge headless 截屏探测成功，临时截图已清理。
  - Console / 完整 L1：未完成，未采集 Console 红错，也未执行移动、建造、采矿、敌袭、胜败、重开人工清单。
- 反馈来源：L0 PowerShell 输出、Python HTTP 探测、Edge headless 截屏可用性探测、工具开发自检报告。
- 残留风险：静态与 HTTP serving 已验证，运行时交互、Canvas 实际观感和 Console 错误仍未闭环；下一步需人工按 `Docs/smoke-checklist.md` 跑完整 L1，或评估 Playwright 最小试点。

### SMOKE-002 Edge Headless Console 冒烟（2026-05-23）

- 状态：完成
- 风险等级：低风险工具任务
- 负责人：`game-tools-developer`
- 目标：建立零 npm 依赖的 L0.5 浏览器 Console 自动化冒烟，采集页面加载、`#game` Canvas、Console error 和 Runtime exception。
- 允许范围：`Scripts/verify-browser-console.mjs`、`Scripts/verify-browser-console.ps1`、`README.md`、`Docs/smoke-checklist.md`、本看板记录。
- 禁止范围：不修改 `Game/` 玩法代码；不修改发布归档；不提交 `Guard/logs/daemon.log`、空 `agent`、截图录像或临时测试产物。
- 验证结果：
  - L0：`SUMMARY: PASS (6 checks, 102 ms)`。
  - L0.5：`SUMMARY: PASS (4 checks, 3724 ms)`；Console 0 errors；Runtime exceptions 0。
  - ReadLints：无新增问题。
- 反馈来源：PowerShell 静态验证、Edge headless + CDP 自动化输出、PM 提交前只读审核。
- 残留风险：L0.5 不覆盖移动、建造、采矿、敌袭、胜败、重开等交互；后续 `Game/` 改动仍需按 `Docs/smoke-checklist.md` 执行 L1，重复路径再评估 L2 自动化。

### SMOKE-003 最小 L2 交互冒烟试点（2026-05-23）

- 状态：完成
- 风险等级：中低风险工具化试点
- 负责人：`game-tools-developer`
- 审核：`game-code-god`
- 目标：新增零 npm 依赖的 L2 交互冒烟脚本，将启动、移动、建造、采矿、推进器提速、敌袭预警/触发和重开复位做成可重复验证基线。
- 允许范围：`Scripts/verify-gameplay-smoke.mjs`、`Scripts/verify-gameplay-smoke.ps1`、`README.md`、`Docs/smoke-checklist.md`、本看板记录。
- 禁止范围：不修改 `Game/` 玩法代码、数值、敌袭规则或 UI 规则；不修改发布归档；不引入 npm 依赖、Playwright、构建工具或长期服务；不提交 `Guard/logs/daemon.log`、空 `agent`、截图录像或临时产物。
- 验证结果：
  - L0：`SUMMARY: PASS (6 checks, 208 ms)`。
  - L0.5：`SUMMARY: PASS (4 checks, 4372 ms)`；Console 0 errors；Runtime exceptions 0。
  - L2：`SUMMARY: PASS (15 checks, 32877 ms)`；覆盖页面加载、Canvas、固定 1280×720 视口、移动目标、框架建造、采矿站建造、采矿 HUD 变化、推进器前后速度采样（43.5 / 64.4 px/s）、第 2 设施预警、第 4 设施敌袭触发、交互后 Console/Runtime、重开复位和重开后 Console/Runtime。
  - ReadLints：无新增问题。
- 专项审核：`game-code-god` 审核通过，无阻塞项；已根据建议补充重开后 Console/Runtime 复查，并修正文档中敌袭触发覆盖边界表述。
- 反馈来源：L0 PowerShell 输出、L0.5 Edge headless + CDP 输出、L2 Edge headless + CDP 自动点击输出、代码审核报告。
- 残留风险：首版未断言完整胜利结算（敌人全灭）和失败结算（核心 HP 归零）；脚本依赖 1280×720 固定视口、Canvas 像素/HUD 指纹和当前 UI 色彩布局；未覆盖金属不足、电力停电、炮塔开火细节、跨分辨率和高 DPR 场景。

## 历史轮次

串行：ENG-001 → ENG-002 → GAME-001 → GAME-002 + GAME-003 + PHYS-001（阶段 A）

## 发布检查清单

- [x] 无 Guard 日志/PID 等无关文件进入提交
- [x] 功能按阶段 A 验收通过
- [x] Git tag `v0.1.0-prototype`（完整 v0.1 后）
- [x] `Releases/v0.1.0-prototype/` 含可运行构建与版本说明

## 后续看板字段约定

后续新增任务应尽量包含：风险等级、验证计划、验证结果、反馈来源和残留风险。

涉及 `Game/` 可玩内容时，验收记录优先包含浏览器运行、控制台日志、Playwright 或等价自动化反馈；涉及核心玩法、系统规则、数值、存档和关键数据结构时，按高风险流程补充自动化/脚本验证与浏览器/实机体验验证。
