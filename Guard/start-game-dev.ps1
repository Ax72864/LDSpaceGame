param(
    [string]$WorkspaceRoot
)

$ErrorActionPreference = "Stop"

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
        [string]$MainLog
    )

    Write-Log -Path $MainLog -Message ("Starting Cursor CLI round: {0} {1}" -f $CursorCommand, ($Arguments -join " "))

    & $CursorCommand @Arguments 2>&1 | ForEach-Object {
        Add-Content -LiteralPath $MainLog -Value ([string]$_) -Encoding UTF8
    }

    if ($null -eq $global:LASTEXITCODE) {
        return 0
    }

    return [int]$global:LASTEXITCODE
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

Write-Log -Path $mainLog -Message ("Main development loop started. PID={0}, Workspace={1}" -f $PID, $repoRoot)

try {
    while ($true) {
        $state = ConvertTo-PlainHashtable (Read-JsonFile $statePath)
        if ($state["desiredState"] -eq "disabled" -or $state["desiredState"] -eq "stopping") {
            Write-Log -Path $mainLog -Message ("Desired state is {0}; exiting main loop." -f $state["desiredState"])
            break
        }

        $prompt = Get-Content -LiteralPath $promptPath -Raw -Encoding UTF8
        $prompt = $prompt + "`n`n当前工作区：" + $repoRoot + "`n请执行一轮自主开发推进。"
        $args = Resolve-AgentArguments -TemplateArgs $config.mainAgentArgs -Workspace $repoRoot -Prompt $prompt

        Update-State -StatePath $statePath -Patch @{
            lastHeartbeatAt = Get-IsoNow
            activeAgentPid = $null
        }

        $exitCode = Invoke-AgentRound -CursorCommand $cursorCommand -Arguments $args -MainLog $mainLog
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
