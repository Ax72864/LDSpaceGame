param(
    [string]$WorkspaceRoot,
    [switch]$Once
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding

function Get-IsoNow {
    return (Get-Date).ToUniversalTime().ToString("o")
}

function Resolve-RepoRoot {
    param([string]$OverrideRoot)

    if ($OverrideRoot) {
        return (Resolve-Path $OverrideRoot).Path
    }

    return (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

function Read-JsonFile {
    param([string]$Path)

    return Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
}

function Write-JsonFile {
    param(
        [string]$Path,
        [object]$Value
    )

    $json = $Value | ConvertTo-Json -Depth 20
    Set-Content -LiteralPath $Path -Value $json -Encoding UTF8
}

function ConvertTo-PlainHashtable {
    param([object]$Object)

    $hash = @{}
    if ($null -eq $Object) {
        return $hash
    }

    foreach ($property in $Object.PSObject.Properties) {
        $hash[$property.Name] = $property.Value
    }

    return $hash
}

function Resolve-GuardPath {
    param(
        [string]$RepoRoot,
        [string]$RelativePath
    )

    return Join-Path $RepoRoot $RelativePath
}

function Write-Log {
    param(
        [string]$Path,
        [string]$Message
    )

    $line = "[{0}] {1}" -f (Get-IsoNow), $Message
    Add-Content -LiteralPath $Path -Value $line -Encoding UTF8
}

function Add-History {
    param(
        [string]$Path,
        [string]$Command,
        [string]$Action,
        [string]$Result
    )

    $entry = @(
        "## $(Get-IsoNow)",
        "- command: $Command",
        "- action: $Action",
        "- result: $Result",
        ""
    )
    Add-Content -LiteralPath $Path -Value $entry -Encoding UTF8
}

function Update-State {
    param(
        [string]$StatePath,
        [hashtable]$Patch
    )

    $state = @{}
    if (Test-Path -LiteralPath $StatePath) {
        $state = ConvertTo-PlainHashtable (Read-JsonFile $StatePath)
    }

    foreach ($key in $Patch.Keys) {
        $state[$key] = $Patch[$key]
    }
    $state["updatedAt"] = Get-IsoNow

    Write-JsonFile -Path $StatePath -Value $state
}

function Get-StateValue {
    param(
        [string]$StatePath,
        [string]$Name
    )

    if (-not (Test-Path -LiteralPath $StatePath)) {
        return $null
    }

    $state = ConvertTo-PlainHashtable (Read-JsonFile $StatePath)
    return $state[$Name]
}

function Test-ProcessAlive {
    param([object]$ProcessId)

    if ($null -eq $ProcessId -or [string]::IsNullOrWhiteSpace([string]$ProcessId)) {
        return $false
    }

    try {
        $null = Get-Process -Id ([int]$ProcessId) -ErrorAction Stop
        return $true
    }
    catch {
        return $false
    }
}

function Get-MainPid {
    param(
        [string]$PidPath,
        [string]$StatePath
    )

    if (Test-Path -LiteralPath $PidPath) {
        $text = (Get-Content -LiteralPath $PidPath -Raw -Encoding UTF8).Trim()
        if ($text) {
            return [int]$text
        }
    }

    $value = Get-StateValue -StatePath $StatePath -Name "mainPid"
    if ($value) {
        return [int]$value
    }

    return $null
}

function Start-MainScript {
    param(
        [string]$RepoRoot,
        [string]$StatePath,
        [string]$DaemonLog
    )

    $existingPid = Get-MainPid -PidPath (Join-Path $RepoRoot "Guard/main.pid") -StatePath $StatePath
    if (Test-ProcessAlive -ProcessId $existingPid) {
        return "main already running pid=$existingPid"
    }

    $powershell = (Get-Command pwsh -ErrorAction SilentlyContinue)
    if (-not $powershell) {
        $powershell = Get-Command powershell -ErrorAction Stop
    }

    $scriptPath = Join-Path $RepoRoot "Guard/start-game-dev.ps1"
    $arguments = @(
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        $scriptPath,
        "-WorkspaceRoot",
        $RepoRoot
    )

    $process = Start-Process -FilePath $powershell.Source -ArgumentList $arguments -WorkingDirectory $RepoRoot -PassThru
    Update-State -StatePath $StatePath -Patch @{
        desiredState = "running"
        mainPid = $process.Id
        lastStartedAt = Get-IsoNow
    }
    Write-Log -Path $DaemonLog -Message ("Started main script pid={0}" -f $process.Id)

    return "started main pid=$($process.Id)"
}

function Stop-MainScript {
    param(
        [string]$RepoRoot,
        [string]$StatePath,
        [string]$PidPath,
        [string]$DaemonLog,
        [int]$TimeoutSeconds
    )

    $mainPid = Get-MainPid -PidPath $PidPath -StatePath $StatePath
    Update-State -StatePath $StatePath -Patch @{
        desiredState = "disabled"
        lastHeartbeatAt = Get-IsoNow
    }

    if (-not (Test-ProcessAlive -ProcessId $mainPid)) {
        return "main not running; disabled"
    }

    Write-Log -Path $DaemonLog -Message ("Stopping main script pid={0}" -f $mainPid)
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (-not (Test-ProcessAlive -ProcessId $mainPid)) {
            Update-State -StatePath $StatePath -Patch @{ mainPid = $null; activeAgentPid = $null }
            return "main stopped gracefully"
        }
        Start-Sleep -Seconds 1
    }

    Write-Log -Path $DaemonLog -Message ("Graceful stop timed out; killing process tree pid={0}" -f $mainPid)
    & taskkill.exe /PID $mainPid /T /F | ForEach-Object {
        Write-Log -Path $DaemonLog -Message ([string]$_)
    }
    Update-State -StatePath $StatePath -Patch @{ mainPid = $null; activeAgentPid = $null }

    return "main killed after timeout"
}

function Restart-MainScript {
    param(
        [string]$RepoRoot,
        [string]$StatePath,
        [string]$PidPath,
        [string]$DaemonLog,
        [int]$TimeoutSeconds
    )

    $stopResult = Stop-MainScript -RepoRoot $RepoRoot -StatePath $StatePath -PidPath $PidPath -DaemonLog $DaemonLog -TimeoutSeconds $TimeoutSeconds
    Update-State -StatePath $StatePath -Patch @{ desiredState = "running" }
    $startResult = Start-MainScript -RepoRoot $RepoRoot -StatePath $StatePath -DaemonLog $DaemonLog

    return "$stopResult; $startResult"
}

function Invoke-GitSync {
    param(
        [string]$RepoRoot,
        [string]$StatePath,
        [string]$DaemonLog,
        [bool]$AutoCommit
    )

    Push-Location $RepoRoot
    try {
        if ($AutoCommit) {
            & git add Guard | Out-Null
            & git diff --cached --quiet
            if ($LASTEXITCODE -ne 0) {
                & git commit -m "Update Guard status" 2>&1 | ForEach-Object {
                    Write-Log -Path $DaemonLog -Message ([string]$_)
                }
            }
        }

        & git fetch 2>&1 | ForEach-Object {
            Write-Log -Path $DaemonLog -Message ([string]$_)
        }
        & git pull --ff-only 2>&1 | ForEach-Object {
            Write-Log -Path $DaemonLog -Message ([string]$_)
        }

        $result = "git sync exit=$LASTEXITCODE"
        Update-State -StatePath $StatePath -Patch @{
            lastGitSyncAt = Get-IsoNow
            lastCommandResult = $result
        }
        return $result
    }
    finally {
        Pop-Location
    }
}

function Read-CommandList {
    param([string]$Path)

    $json = Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
    $commands = New-Object System.Collections.Generic.List[object]
    foreach ($item in $json) {
        $commands.Add($item)
    }
    return $commands.ToArray()
}

function Resolve-AgentArguments {
    param(
        [object[]]$TemplateArgs,
        [string]$Workspace,
        [string]$Prompt
    )

    $resolved = New-Object System.Collections.Generic.List[string]
    foreach ($arg in $TemplateArgs) {
        $text = [string]$arg
        $text = $text.Replace("{workspace}", $Workspace)
        $text = $text.Replace("{prompt}", $Prompt)
        $resolved.Add($text)
    }
    return $resolved.ToArray()
}

function Invoke-DelegateAgent {
    param(
        [object]$Config,
        [string]$RepoRoot,
        [string]$DaemonLog,
        [string]$CommandText
    )

    $cursorCommand = [string]$Config.cursorCommand
    if (-not (Get-Command $cursorCommand -ErrorAction SilentlyContinue)) {
        return "Cursor CLI command not found: $cursorCommand"
    }

    $prompt = @"
You are the Guard command execution agent for the LDSpaceGame project.

Guard/cmd.txt contains an instruction that the daemon could not match directly:
$CommandText

Understand and execute this instruction within the project scope. You must follow .cursor/rules/, Docs/team-collaboration-rules.md, and Docs/team-member-roster.md.
Do not perform dangerous local-environment operations unless the user explicitly confirmed them. Dangerous operations include software installation, system-level configuration, privilege escalation, driver installation, system service modification, and deleting or overwriting files outside the task scope.
After execution, return a brief result.
"@

    $args = Resolve-AgentArguments -TemplateArgs $Config.delegateAgentArgs -Workspace $RepoRoot -Prompt $prompt
    Write-Log -Path $DaemonLog -Message ("Delegating unknown command to Cursor CLI: {0}" -f $CommandText)

    $output = New-Object System.Collections.Generic.List[string]
    & $cursorCommand @args 2>&1 | ForEach-Object {
        $line = [string]$_
        $output.Add($line)
        Write-Log -Path $DaemonLog -Message $line
    }

    return ("delegated exit={0}; output={1}" -f $LASTEXITCODE, (($output.ToArray() -join " ") -replace "\s+", " "))
}

function Find-GuardCommand {
    param(
        [object[]]$Commands,
        [string]$CommandText
    )

    $trimmed = $CommandText.Trim()
    foreach ($command in $Commands) {
        foreach ($alias in $command.aliases) {
            if ([string]::Equals($trimmed, [string]$alias, [System.StringComparison]::OrdinalIgnoreCase)) {
                return $command
            }
        }
    }
    return $null
}

function Invoke-GuardCommand {
    param(
        [object]$Command,
        [string]$CommandText,
        [object]$Config,
        [string]$RepoRoot,
        [string]$StatePath,
        [string]$PidPath,
        [string]$HistoryPath,
        [string]$DaemonLog,
        [object[]]$AllCommands
    )

    $action = if ($Command) { [string]$Command.action } else { "delegate" }
    Update-State -StatePath $StatePath -Patch @{
        lastCommand = $CommandText
        lastCommandResult = "running"
    }

    switch ($action) {
        "start" {
            $result = Start-MainScript -RepoRoot $RepoRoot -StatePath $StatePath -DaemonLog $DaemonLog
        }
        "stop" {
            $result = Stop-MainScript -RepoRoot $RepoRoot -StatePath $StatePath -PidPath $PidPath -DaemonLog $DaemonLog -TimeoutSeconds ([int]$Config.stopTimeoutSeconds)
        }
        "restart" {
            $result = Restart-MainScript -RepoRoot $RepoRoot -StatePath $StatePath -PidPath $PidPath -DaemonLog $DaemonLog -TimeoutSeconds ([int]$Config.stopTimeoutSeconds)
        }
        "status" {
            $mainPid = Get-MainPid -PidPath $PidPath -StatePath $StatePath
            $alive = Test-ProcessAlive -ProcessId $mainPid
            $desired = Get-StateValue -StatePath $StatePath -Name "desiredState"
            $result = "desired=$desired; mainPid=$mainPid; alive=$alive"
        }
        "sync" {
            $result = Invoke-GitSync -RepoRoot $RepoRoot -StatePath $StatePath -DaemonLog $DaemonLog -AutoCommit ([bool]$Config.autoCommitGuardStatus)
        }
        "help" {
            $items = $AllCommands | ForEach-Object {
                "{0}: {1}" -f $_.name, $_.description
            }
            $result = ($items -join " | ")
        }
        default {
            $result = Invoke-DelegateAgent -Config $Config -RepoRoot $RepoRoot -DaemonLog $DaemonLog -CommandText $CommandText
        }
    }

    Update-State -StatePath $StatePath -Patch @{
        lastCommand = $CommandText
        lastCommandResult = $result
    }
    Add-History -Path $HistoryPath -Command $CommandText -Action $action -Result $result
    Write-Log -Path $DaemonLog -Message ("Command processed: {0}; action={1}; result={2}" -f $CommandText, $action, $result)
}

function Process-CmdFile {
    param(
        [object]$Config,
        [string]$RepoRoot,
        [string]$StatePath,
        [string]$PidPath,
        [string]$CmdPath,
        [string]$HistoryPath,
        [string]$DaemonLog,
        [object[]]$Commands
    )

    if (-not (Test-Path -LiteralPath $CmdPath)) {
        Set-Content -LiteralPath $CmdPath -Value "" -Encoding UTF8
        return
    }

    $lines = Get-Content -LiteralPath $CmdPath -Encoding UTF8
    $pending = @($lines | Where-Object {
        -not [string]::IsNullOrWhiteSpace($_) -and -not $_.TrimStart().StartsWith("#")
    })

    if ($pending.Count -eq 0) {
        return
    }

    foreach ($line in $pending) {
        $command = Find-GuardCommand -Commands $Commands -CommandText $line
        Invoke-GuardCommand -Command $command -CommandText $line -Config $Config -RepoRoot $RepoRoot -StatePath $StatePath -PidPath $PidPath -HistoryPath $HistoryPath -DaemonLog $DaemonLog -AllCommands $Commands
    }

    Set-Content -LiteralPath $CmdPath -Value "" -Encoding UTF8
}

$repoRoot = Resolve-RepoRoot -OverrideRoot $WorkspaceRoot
$configPath = Join-Path $repoRoot "Guard/config.json"
$config = Read-JsonFile $configPath

$daemonLog = Resolve-GuardPath -RepoRoot $repoRoot -RelativePath $config.logs.daemon
$statePath = Resolve-GuardPath -RepoRoot $repoRoot -RelativePath $config.files.state
$pidPath = Resolve-GuardPath -RepoRoot $repoRoot -RelativePath $config.files.pid
$cmdPath = Resolve-GuardPath -RepoRoot $repoRoot -RelativePath $config.files.cmd
$historyPath = Resolve-GuardPath -RepoRoot $repoRoot -RelativePath $config.files.history
$commandsPath = Resolve-GuardPath -RepoRoot $repoRoot -RelativePath $config.files.commands

New-Item -ItemType Directory -Force -Path (Split-Path $daemonLog -Parent) | Out-Null
Update-State -StatePath $statePath -Patch @{
    daemonPid = $PID
}
Write-Log -Path $daemonLog -Message ("Guard daemon started. PID={0}, Workspace={1}" -f $PID, $repoRoot)

$lastSync = [DateTime]::MinValue

while ($true) {
    try {
        $config = Read-JsonFile $configPath
        $commands = @(Read-CommandList $commandsPath)

        Process-CmdFile -Config $config -RepoRoot $repoRoot -StatePath $statePath -PidPath $pidPath -CmdPath $cmdPath -HistoryPath $historyPath -DaemonLog $daemonLog -Commands $commands

        $desired = Get-StateValue -StatePath $statePath -Name "desiredState"
        $mainPid = Get-MainPid -PidPath $pidPath -StatePath $statePath
        $lastHeartbeat = Get-StateValue -StatePath $statePath -Name "lastHeartbeatAt"
        $heartbeatStale = $false
        if ($lastHeartbeat) {
            $heartbeatAge = ((Get-Date).ToUniversalTime() - [DateTime]::Parse([string]$lastHeartbeat).ToUniversalTime()).TotalSeconds
            $heartbeatStale = ($heartbeatAge -gt [int]$config.staleHeartbeatSeconds)
        }
        if ($desired -ne "disabled" -and ((-not (Test-ProcessAlive -ProcessId $mainPid)) -or $heartbeatStale)) {
            if ($heartbeatStale) {
                Write-Log -Path $daemonLog -Message ("Main heartbeat is stale; restarting. lastHeartbeatAt={0}" -f $lastHeartbeat)
                $null = Stop-MainScript -RepoRoot $repoRoot -StatePath $statePath -PidPath $pidPath -DaemonLog $daemonLog -TimeoutSeconds ([int]$config.stopTimeoutSeconds)
                Update-State -StatePath $statePath -Patch @{ desiredState = "running" }
            }
            Write-Log -Path $daemonLog -Message "Main script is not running; restarting."
            $restartCount = Get-StateValue -StatePath $statePath -Name "restartCount"
            if ($null -eq $restartCount) {
                $restartCount = 0
            }
            Update-State -StatePath $statePath -Patch @{ restartCount = ([int]$restartCount + 1) }
            Start-Sleep -Seconds ([int]$config.restartDelaySeconds)
            $null = Start-MainScript -RepoRoot $repoRoot -StatePath $statePath -DaemonLog $daemonLog
        }

        if (((Get-Date) - $lastSync).TotalSeconds -ge [int]$config.gitSyncSeconds) {
            $null = Invoke-GitSync -RepoRoot $repoRoot -StatePath $statePath -DaemonLog $daemonLog -AutoCommit ([bool]$config.autoCommitGuardStatus)
            $lastSync = Get-Date
        }
    }
    catch {
        Write-Log -Path $daemonLog -Message ("Daemon loop error: {0}" -f $_.Exception.Message)
    }

    if ($Once) {
        break
    }

    Start-Sleep -Seconds ([int]$config.daemonPollSeconds)
}

Write-Log -Path $daemonLog -Message "Guard daemon stopped."
