# Guard 守护开发脚本说明

`Guard` 目录用于让项目在制作人 agent 的带领下持续自主推进开发。

## 文件说明

- `Guard/start-game-dev.ps1`：启动脚本，循环调用 Cursor CLI，让制作人主 agent 持续执行开发回合。
- `Guard/daemon.ps1`：守护脚本，负责监控启动脚本、自动重启、处理 `cmd.txt` 指令和同步远端 Guard 更新。
- `Guard/config.json`：配置 Cursor CLI 命令、轮询间隔、同步间隔、日志路径和状态文件路径。
- `Guard/commands.json`：守护脚本可直接匹配的命令清单。
- `Guard/main-prompt.md`：制作人主 agent 的长期开发 prompt。
- `Guard/cmd.txt`：用户写入控制指令的入口，一行一条。
- `Guard/history.log`：已处理指令和执行结果。
- `Guard/state.json`：守护状态、主脚本 PID、最近命令和同步时间。
- `Guard/logs/daemon.log`：守护脚本日志。
- `Guard/logs/main.log`：制作人主 agent 输出日志。

## 启动方式

在项目根目录运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Guard\daemon.ps1
```

只运行一次守护循环用于测试：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Guard\daemon.ps1 -Once
```

直接启动制作人主 agent 循环：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Guard\start-game-dev.ps1
```

通常应启动 `daemon.ps1`，由它负责启动和守护主脚本。

## cmd.txt 指令格式

`Guard/cmd.txt` 使用一行一条指令。守护脚本读取后会清空 `cmd.txt`，并将原始指令、匹配动作和执行结果写入 `Guard/history.log`。

示例：

```text
停止开发
```

```text
启动开发
```

```text
查看状态
```

## 内置命令

内置命令维护在 `Guard/commands.json`：

- `start` / `启动` / `启动开发`：启动制作人主 agent 开发流程。
- `stop` / `停止` / `停止开发`：停止主开发流程，并进入 disabled 状态。
- `restart` / `重启`：重启主开发流程。
- `status` / `状态`：记录当前守护状态。
- `sync` / `同步`：提交 Guard 状态更新，fetch 并尝试 pull。
- `help` / `帮助`：输出命令清单到 `Guard/history.log`。

`commands.json` 可以由 Cursor CLI 后续维护，用于新增别名、说明或安全动作。

## 未匹配命令

如果 `cmd.txt` 中的指令无法匹配 `commands.json`，守护脚本会调用 Cursor CLI，让 agent 在项目范围内理解并执行该指令。

未匹配命令仍必须遵守项目规则：

- 可以处理项目内的文档、代码、资源和计划任务。
- 禁止执行本机环境危险操作，除非用户明确确认。
- 禁止 force push、hard reset、git clean、改写已推送历史或删除发布产物。

## 自动重启

守护脚本每 30 秒检查一次主脚本 PID：

- 如果主脚本意外退出，且状态不是 `disabled`，守护脚本会自动重启。
- 如果主脚本心跳超过 `Guard/config.json` 中的 `staleHeartbeatSeconds` 未更新，守护脚本会认为主开发回合卡住并重启主脚本。
- 如果通过 `cmd.txt` 下达停止命令，守护脚本会先尝试优雅停止，超时后结束主脚本进程树，并进入 `disabled` 状态。
- 进入 `disabled` 后不会自动重启，直到收到启动命令。

单轮 Cursor Agent 调用最长运行时间由 `maxRoundSeconds` 控制。超过该时间后，启动脚本会结束本轮 agent 进程树并进入下一轮，避免卡死后只执行一轮。

## Guard 同步

守护脚本默认每 5 分钟同步一次：

1. 自动暂存并提交 `Guard` 目录状态更新。
2. 执行 `git fetch`。
3. 尝试 `git pull --ff-only`。

如果同步失败或发生冲突，脚本只记录日志，不会执行强制覆盖、reset 或 clean。

## Cursor CLI 配置

默认配置位于 `Guard/config.json`：

```json
"cursorCommand": "C:\\Users\\ylswd\\AppData\\Local\\cursor-agent\\cursor-agent.cmd",
"mainAgentArgs": ["--workspace", "{workspace}", "--trust", "-p", "--force", "{prompt}"]
```

如果当前机器已经将 Cursor Agent CLI 加入 PATH，可以将配置改为：

```json
"cursorCommand": "cursor-agent",
"mainAgentArgs": ["--workspace", "{workspace}", "--trust", "-p", "--force", "{prompt}"]
```

`{workspace}` 会被替换为项目根目录，`{prompt}` 会被替换为 `Guard/main-prompt.md` 的内容。

首次运行前需要确保 Cursor Agent CLI 已认证：

```powershell
& "$env:LOCALAPPDATA\cursor-agent\cursor-agent.cmd" login
```

如果使用 API Key，也可以设置 `CURSOR_API_KEY` 环境变量。未认证时，启动脚本会写入日志并进入 `disabled` 状态，避免守护脚本反复重启。

## 安全边界

除本机环境危险操作外，项目事项由制作人决定并持续推进。

本机环境危险操作包括但不限于：

- 软件安装或卸载。
- 系统级 PATH、注册表、防火墙、系统服务修改。
- 权限提升、驱动安装、重启系统。
- 删除或覆盖非 Guard 目标文件。
- 执行来历不明的外部脚本或二进制文件。

这些操作必须先等待用户确认。
