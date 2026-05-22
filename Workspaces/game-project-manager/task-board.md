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

## 历史轮次

串行：ENG-001 → ENG-002 → GAME-001 → GAME-002 + GAME-003 + PHYS-001（阶段 A）

## 发布检查清单

- [x] 无 Guard 日志/PID 等无关文件进入提交
- [x] 功能按阶段 A 验收通过
- [x] Git tag `v0.1.0-prototype`（完整 v0.1 后）
- [x] `Releases/v0.1.0-prototype/` 含可运行构建与版本说明
