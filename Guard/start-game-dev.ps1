param(
    [string]$WorkspaceRoot
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

function Write-Log {
    param(
        [string]$Path,
        [string]$Message
    )

    $line = "[{0}] {1}" -f (Get-IsoNow), $Message
    Add-Content -LiteralPath $Path -Value $line -Encoding UTF8
}

function Resolve-GuardPath {
    param(
        [string]$RepoRoot,
        [string]$RelativePath
    )

    return Join-Path $RepoRoot $RelativePath
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

function Invoke-AgentRound {
    param(
        [string]$CursorCommand,
        [string[]]$Arguments,
        [string]$MainLog,
        [string]$WorkingDirectory,
        [string]$StatePath,
        [int]$MaxRoundSeconds
    )

    $displayArgs = @($Arguments | ForEach-Object {
        if ([string]$_ -eq $Arguments[-1]) {
            "<prompt>"
        }
        else {
            [string]$_
        }
    })
    Write-Log -Path $MainLog -Message ("Starting Cursor CLI round: {0} {1}" -f $CursorCommand, ($displayArgs -join " "))

    $roundId = [guid]::NewGuid().ToString("N")
    $stdoutPath = Join-Path ([System.IO.Path]::GetTempPath()) ("ldspace-cursor-agent-{0}.out.log" -f $roundId)
    $stderrPath = Join-Path ([System.IO.Path]::GetTempPath()) ("ldspace-cursor-agent-{0}.err.log" -f $roundId)

    $process = Start-Process -FilePath $CursorCommand -ArgumentList $Arguments -WorkingDirectory $WorkingDirectory -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru
    Update-State -StatePath $StatePath -Patch @{
        activeAgentPid = $process.Id
    }

    $finished = $process.WaitForExit($MaxRoundSeconds * 1000)
    if (-not $finished) {
        Write-Log -Path $MainLog -Message ("Cursor CLI round timed out after {0} seconds; killing pid={1}." -f $MaxRoundSeconds, $process.Id)
        & taskkill.exe /PID $process.Id /T /F 2>&1 | ForEach-Object {
            Add-Content -LiteralPath $MainLog -Value ([string]$_) -Encoding UTF8
        }
        Update-State -StatePath $StatePath -Patch @{
            activeAgentPid = $null
        }
        return 124
    }

    foreach ($path in @($stdoutPath, $stderrPath)) {
        if (Test-Path -LiteralPath $path) {
            Get-Content -LiteralPath $path -Encoding UTF8 | ForEach-Object {
                Add-Content -LiteralPath $MainLog -Value ([string]$_) -Encoding UTF8
            }
            Remove-Item -LiteralPath $path -Force
        }
    }

    Update-State -StatePath $StatePath -Patch @{
        activeAgentPid = $null
    }

    return [int]$process.ExitCode
}

function Test-AgentAuthentication {
    param(
        [string]$CursorCommand,
        [string]$MainLog
    )

    Write-Log -Path $MainLog -Message "Checking Cursor Agent authentication."
    & $CursorCommand status 2>&1 | ForEach-Object {
        Add-Content -LiteralPath $MainLog -Value ([string]$_) -Encoding UTF8
    }

    if ($null -eq $global:LASTEXITCODE) {
        return $true
    }

    return ([int]$global:LASTEXITCODE -eq 0)
}

$repoRoot = Resolve-RepoRoot -OverrideRoot $WorkspaceRoot
$configPath = Join-Path $repoRoot "Guard/config.json"
$config = Read-JsonFile $configPath

$mainLog = Resolve-GuardPath -RepoRoot $repoRoot -RelativePath $config.logs.main
$statePath = Resolve-GuardPath -RepoRoot $repoRoot -RelativePath $config.files.state
$pidPath = Resolve-GuardPath -RepoRoot $repoRoot -RelativePath $config.files.pid
$promptPath = Resolve-GuardPath -RepoRoot $repoRoot -RelativePath $config.files.mainPrompt

New-Item -ItemType Directory -Force -Path (Split-Path $mainLog -Parent) | Out-Null

$cursorCommand = [string]$config.cursorCommand
if (-not (Get-Command $cursorCommand -ErrorAction SilentlyContinue)) {
    Write-Log -Path $mainLog -Message ("Cursor CLI command not found: {0}" -f $cursorCommand)
    throw "Cursor CLI command not found: $cursorCommand"
}

Set-Content -LiteralPath $pidPath -Value $PID -Encoding UTF8
Update-State -StatePath $statePath -Patch @{
    desiredState = "running"
    mainPid = $PID
    activeAgentPid = $null
    lastStartedAt = Get-IsoNow
    lastHeartbeatAt = Get-IsoNow
    lastExitCode = $null
}

if (-not (Test-AgentAuthentication -CursorCommand $cursorCommand -MainLog $mainLog)) {
    $message = "Cursor Agent authentication required. Run cursor-agent login or set CURSOR_API_KEY, then start Guard again."
    Write-Log -Path $mainLog -Message $message
    Update-State -StatePath $statePath -Patch @{
        desiredState = "disabled"
        lastExitCode = 1
        lastCommandResult = $message
    }
    throw $message
}

Write-Log -Path $mainLog -Message ("Main development loop started. PID={0}, Workspace={1}" -f $PID, $repoRoot)

try {
    while ($true) {
        $state = ConvertTo-PlainHashtable (Read-JsonFile $statePath)
        if ($state["desiredState"] -eq "disabled" -or $state["desiredState"] -eq "stopping") {
            Write-Log -Path $mainLog -Message ("Desired state is {0}; exiting main loop." -f $state["desiredState"])
            break
        }

        $prompt = Get-Content -LiteralPath $promptPath -Raw -Encoding UTF8
        $prompt = $prompt + "`n`nWorkspace: " + $repoRoot + "`nRun one autonomous development iteration."
        $args = Resolve-AgentArguments -TemplateArgs $config.mainAgentArgs -Workspace $repoRoot -Prompt $prompt

        Update-State -StatePath $statePath -Patch @{
            lastHeartbeatAt = Get-IsoNow
            activeAgentPid = $null
        }

        $exitCode = Invoke-AgentRound -CursorCommand $cursorCommand -Arguments $args -MainLog $mainLog -WorkingDirectory $repoRoot -StatePath $statePath -MaxRoundSeconds ([int]$config.maxRoundSeconds)
        Update-State -StatePath $statePath -Patch @{
            lastHeartbeatAt = Get-IsoNow
            lastExitCode = $exitCode
            activeAgentPid = $null
        }

        Write-Log -Path $mainLog -Message ("Cursor CLI round finished with exit code {0}." -f $exitCode)
        Start-Sleep -Seconds ([int]$config.mainLoopDelaySeconds)
    }
}
catch {
    Write-Log -Path $mainLog -Message ("Main loop error: {0}" -f $_.Exception.Message)
    Update-State -StatePath $statePath -Patch @{
        lastHeartbeatAt = Get-IsoNow
        lastExitCode = 1
        activeAgentPid = $null
    }
    throw
}
finally {
    Update-State -StatePath $statePath -Patch @{
        mainPid = $null
        activeAgentPid = $null
        lastHeartbeatAt = Get-IsoNow
    }
    if (Test-Path -LiteralPath $pidPath) {
        Remove-Item -LiteralPath $pidPath -Force
    }
    Write-Log -Path $mainLog -Message "Main development loop stopped."
}
