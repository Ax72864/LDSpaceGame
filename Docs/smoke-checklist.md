# L1 浏览器冒烟清单

本文档配合 `Scripts/validate-static.ps1`（L0 静态检查）使用，用于在改动 `Game/` 可玩内容后做最小人工冒烟验证。

完整验证分层见 [development-validation-guide.md](./development-validation-guide.md)。

## 前置条件

- 已完成 L0：`pwsh -NoProfile -ExecutionPolicy Bypass -File Scripts/validate-static.ps1` 输出 `SUMMARY: PASS`。
- 建议再跑 L0.5 Console 自动化：`pwsh -NoProfile -ExecutionPolicy Bypass -File Scripts/verify-browser-console.ps1`（或 `node Scripts/verify-browser-console.mjs`）。脚本会临时启动 Python HTTP 服务与 Edge headless，采集 **Console error / Runtime exception**、页面加载与 `#game` Canvas 是否存在；通过时输出 `SUMMARY: PASS`。**不覆盖**移动、建造、敌袭等交互。
- 建议再跑 L2 交互自动化：`pwsh -NoProfile -ExecutionPolicy Bypass -File Scripts/verify-gameplay-smoke.ps1`（或 `node Scripts/verify-gameplay-smoke.mjs`）。脚本在 1280×720 视口下通过 CDP 派发 Canvas 点击，并用 Canvas 像素/HUD 指纹验证黄金路径：移动目标、建框架、采矿站、采矿产金属、推进器提速（约 42→63）、第 2 个设施预警、第 4 个设施敌袭、重开重置。**首版不覆盖**完整胜败结算（敌人全灭 / 核心被打爆）；未覆盖项仍可按下方人工步骤补测。
- 本机可用浏览器（Edge / Chrome 等）。
- 任选一种本地静态服务方式（二选一即可；人工冒烟时使用；L0.5 脚本会自行起服务）。

## 启动本地服务

在项目根目录执行其一：

```powershell
# 方式 A：Python 内置 HTTP 服务（零 npm 依赖）
python -m http.server 8080 --directory Game
```

浏览器打开：<http://localhost:8080/>

```powershell
# 方式 B：npx serve（需 Node.js；与 README 一致）
npx serve Game
```

按终端提示打开本地 URL。

> 不要直接双击 `Game/index.html` 用 `file://` 打开；相对路径与部分浏览器策略可能导致脚本行为异常。

## 冒烟步骤

每项打勾即通过；任一项失败则记录现象并视为冒烟未通过。

### 1. 页面与 Canvas

- [ ] 页面标题为 `LDSpaceGame - Stage A Prototype`（或当前版本标题）。
- [ ] `#game` Canvas 全屏渲染，背景与 HUD 可见，无空白页。
- [ ] 打开开发者工具 Console，刷新后 **无红色报错**（警告可记录但不单独判失败）。

### 2. 移动

- [ ] 点击 Canvas 空白处，空间站向点击方向移动。
- [ ] HUD 中坐标或移动反馈正常（若可见）。

### 3. 建造

- [ ] 点击核心 **相邻绿色高亮格**，消耗金属并成功放置框架。
- [ ] 金属不足时无法建造（或 UI 有明确反馈）。
- [ ] 点击已有框架，出现建造菜单；对设施选项 **连点两次** 可放置采矿站 / 炮塔 / 推进器（视当前金属与电力是否足够）。

### 4. 采矿与资源（阶段 B）

- [ ] 建造采矿站后，将空间站移动至灰色小行星附近，金属随时间增加。
- [ ] HUD 显示金属、电力、模块数等信息，数值随操作变化合理。

### 5. 预警与敌袭

- [ ] 建造 **第 2 个设施** 后，出现 raid / 敌袭 **预警** 类 UI 或提示。
- [ ] 继续建造至 **第 4 个设施**，触发敌波；炮塔自动开火，推进器可提升移动速度（若已建造）。

### 6. 胜败与重开

- [ ] 敌人全灭且核心存活 → 胜利结算；核心 HP 归零 → 失败结算。
- [ ] 点击 **重开** 按钮后，状态重置，可再次移动与建造。

## 记录建议

| 项目 | 内容 |
|------|------|
| 日期 / 执行人 | |
| L0 结果 | PASS / FAIL |
| L0.5 Console 脚本 | PASS / FAIL / 跳过 |
| L2 Gameplay 脚本 | PASS / FAIL / 跳过 |
| 服务方式 | python 8080 / npx serve / 其他 |
| 浏览器 | |
| 失败步骤编号 | |
| Console 报错摘要 | |
| 截图路径（可选） | 放入 `Artifacts/`，勿提交 Git |

## L2 自动化覆盖边界（`verify-gameplay-smoke`）

| 已覆盖 | 未覆盖（首版残留风险） |
|--------|------------------------|
| 页面加载、Console/Runtime 无红错 | 完整胜利结算（敌人全灭） |
| Canvas 存在、1280×720 视口 | 完整失败结算（核心 HP 归零） |
| 点击设置移动目标 | 炮塔自动开火细节、电力不足「停电」分支 |
| 相邻格建框架、菜单双点放置采矿站 | 金属不足时的 UI 反馈 |
| 靠近小行星后金属 HUD 变化 | 非 1280×720 分辨率 / 高 DPR 环境 |
| 推进器前后移动速度采样（~42 / ~63） | 直接读取 `state`（游戏未暴露全局快照） |
| 第 2 个设施后敌袭 HUD 变化 | |
| 第 4 个设施后敌袭触发（像素 / HUD 信号验证） | |
| 点击「重开」后敌袭/预警 HUD 复位 | |

运行命令：

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File Scripts/verify-gameplay-smoke.ps1
```

## 何时需要 L3+

- 需稳定断言胜败结算、复杂战斗分支或跨分辨率回归时，评估 Playwright 等更强自动化（见 development-validation-guide）。
- 发布前对 `Releases/<version>/` 归档再跑一遍本清单（L0 → L0.5 → L2 → 人工补项）。
