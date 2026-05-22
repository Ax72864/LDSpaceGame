# L0.5 browser console smoke (Edge headless + CDP, no npm deps).
# Usage: pwsh -NoProfile -ExecutionPolicy Bypass -File Scripts/verify-browser-console.ps1

param(
    [string]$RepoRoot = ""
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding

function Resolve-RepoRoot {
    param([string]$OverrideRoot)

    if ($OverrideRoot) {
        return (Resolve-Path $OverrideRoot).Path
    }

    return (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

$repoRoot = Resolve-RepoRoot -OverrideRoot $RepoRoot
$scriptPath = Join-Path $PSScriptRoot "verify-browser-console.mjs"

if (-not (Test-Path -LiteralPath $scriptPath)) {
    Write-Error "Missing script: $scriptPath"
    exit 1
}

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
    Write-Error "Node.js not found in PATH."
    exit 1
}

Push-Location $repoRoot
try {
    & node $scriptPath
    $exitCode = if ($null -eq $LASTEXITCODE) { 0 } else { [int]$LASTEXITCODE }
    exit $exitCode
}
finally {
    Pop-Location
}
