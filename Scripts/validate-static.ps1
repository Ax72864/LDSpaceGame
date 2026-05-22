# L0 static validation for the HTML5 Canvas prototype (no dependencies).
# Usage: pwsh -NoProfile -ExecutionPolicy Bypass -File Scripts/validate-static.ps1

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

function Add-CheckResult {
    param(
        [System.Collections.Generic.List[object]]$Results,
        [string]$Name,
        [bool]$Passed,
        [string]$Detail = ""
    )

    $Results.Add([pscustomobject]@{
            Name   = $Name
            Passed = $Passed
            Detail = $Detail
        }) | Out-Null
}

function Test-LocalAssetReference {
    param(
        [string]$Reference
    )

    if ([string]::IsNullOrWhiteSpace($Reference)) {
        return $false
    }

    $trimmed = $Reference.Trim()
    if ($trimmed.StartsWith("#")) {
        return $false
    }

    $lower = $trimmed.ToLowerInvariant()
    $externalPrefixes = @(
        "http://",
        "https://",
        "//",
        "data:",
        "mailto:",
        "javascript:",
        "blob:"
    )

    foreach ($prefix in $externalPrefixes) {
        if ($lower.StartsWith($prefix)) {
            return $false
        }
    }

    return $true
}

function Resolve-LocalAssetPath {
    param(
        [string]$BaseDirectory,
        [string]$Reference
    )

    $normalized = $Reference -replace "\\", "/"
    if ($normalized.StartsWith("./")) {
        $normalized = $normalized.Substring(2)
    }
    elseif ($normalized.StartsWith("/")) {
        $normalized = $normalized.TrimStart("/")
    }

    $combined = Join-Path $BaseDirectory ($normalized -replace "/", [System.IO.Path]::DirectorySeparatorChar)
    return [System.IO.Path]::GetFullPath($combined)
}

$repoRoot = Resolve-RepoRoot -OverrideRoot $RepoRoot
$gameRoot = Join-Path $repoRoot "Game"
$indexPath = Join-Path $gameRoot "index.html"
$mainJsPath = Join-Path $gameRoot "src\main.js"
$stylesPath = Join-Path $gameRoot "src\styles.css"

$results = [System.Collections.Generic.List[object]]::new()
$startedAt = Get-Date

Write-Host ""
Write-Host "LDSpaceGame L0 static validation"
Write-Host "Repo: $repoRoot"
Write-Host ""

$requiredFiles = @(
    @{ Path = $indexPath; Label = "Game/index.html" },
    @{ Path = $mainJsPath; Label = "Game/src/main.js" },
    @{ Path = $stylesPath; Label = "Game/src/styles.css" }
)

foreach ($item in $requiredFiles) {
    $exists = Test-Path -LiteralPath $item.Path
    $detail = if ($exists) { "Found." } else { "Missing: $($item.Path)" }
    Add-CheckResult -Results $results -Name ("Required file: {0}" -f $item.Label) -Passed $exists -Detail $detail
}

if (Test-Path -LiteralPath $indexPath) {
    $indexContent = Get-Content -LiteralPath $indexPath -Raw -Encoding UTF8

    $scriptMatches = [regex]::Matches(
        $indexContent,
        '<script\b[^>]*\bsrc\s*=\s*["'']([^"'']+)["'']',
        [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
    )
    foreach ($match in $scriptMatches) {
        $reference = $match.Groups[1].Value
        if (-not (Test-LocalAssetReference -Reference $reference)) {
            continue
        }

        $resolvedPath = Resolve-LocalAssetPath -BaseDirectory $gameRoot -Reference $reference
        $exists = Test-Path -LiteralPath $resolvedPath
        $detail = if ($exists) { "Resolved to $resolvedPath" } else { "Missing: $resolvedPath" }
        Add-CheckResult -Results $results -Name ("index.html script src: $reference") -Passed $exists -Detail $detail
    }

    $linkMatches = [regex]::Matches(
        $indexContent,
        '<link\b[^>]*\bhref\s*=\s*["'']([^"'']+)["'']',
        [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
    )
    foreach ($match in $linkMatches) {
        $reference = $match.Groups[1].Value
        if (-not (Test-LocalAssetReference -Reference $reference)) {
            continue
        }

        $resolvedPath = Resolve-LocalAssetPath -BaseDirectory $gameRoot -Reference $reference
        $exists = Test-Path -LiteralPath $resolvedPath
        $detail = if ($exists) { "Resolved to $resolvedPath" } else { "Missing: $resolvedPath" }
        Add-CheckResult -Results $results -Name ("index.html link href: $reference") -Passed $exists -Detail $detail
    }
}

if (Test-Path -LiteralPath $mainJsPath) {
    $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
    if (-not $nodeCommand) {
        Add-CheckResult -Results $results -Name "node --check Game/src/main.js" -Passed $false -Detail "Node.js not found in PATH."
    }
    else {
        $nodeOutput = & node --check $mainJsPath 2>&1
        $nodeExitCode = if ($null -eq $LASTEXITCODE) { 0 } else { [int]$LASTEXITCODE }
        $detail = if ($nodeOutput) { ($nodeOutput | ForEach-Object { [string]$_ }) -join "`n" } else { "Syntax OK." }
        Add-CheckResult -Results $results -Name "node --check Game/src/main.js" -Passed ($nodeExitCode -eq 0) -Detail $detail
    }
}

$passCount = @($results | Where-Object { $_.Passed }).Count
$failCount = @($results | Where-Object { -not $_.Passed }).Count
$elapsedMs = [int]((Get-Date) - $startedAt).TotalMilliseconds

Write-Host "Checks:"
foreach ($result in $results) {
    $status = if ($result.Passed) { "PASS" } else { "FAIL" }
    Write-Host ("  [{0}] {1}" -f $status, $result.Name)
    if ($result.Detail) {
        foreach ($line in ($result.Detail -split "`n")) {
            if ($line.Trim()) {
                Write-Host ("         {0}" -f $line)
            }
        }
    }
}

Write-Host ""
if ($failCount -eq 0) {
    Write-Host ("SUMMARY: PASS ({0} checks, {1} ms)" -f $passCount, $elapsedMs)
    exit 0
}

Write-Host ("SUMMARY: FAIL ({0} passed, {1} failed, {2} ms)" -f $passCount, $failCount, $elapsedMs)
exit 1
