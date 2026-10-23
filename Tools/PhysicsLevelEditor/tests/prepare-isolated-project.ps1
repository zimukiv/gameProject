param(
    [Parameter(Mandatory = $true)]
    [string]$Destination
)

$ErrorActionPreference = 'Stop'
$source = [System.IO.Path]::GetFullPath((Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\..')).Path).TrimEnd('\')
$target = [System.IO.Path]::GetFullPath($Destination).TrimEnd('\')
$comparison = [System.StringComparison]::OrdinalIgnoreCase

if (-not (Test-Path -LiteralPath (Join-Path $source '.git'))) {
    throw 'The source project must be the Git working tree.'
}
if (Test-Path -LiteralPath (Join-Path $source 'Temp\UnityLockfile')) {
    throw 'Close the source Unity Editor before copying; its project lock is present.'
}
if ($target.Equals($source, $comparison) -or
    $target.StartsWith($source + '\', $comparison) -or
    $source.StartsWith($target + '\', $comparison)) {
    throw 'Destination must be outside the source project and must not contain it.'
}
if (Test-Path -LiteralPath $target) {
    throw "Destination already exists; choose a new empty path: $target"
}

$sceneRelative = 'Assets\Scenes\Level1.unity'
$sourceScene = Join-Path $source $sceneRelative
$sourceHash = (Get-FileHash -LiteralPath $sourceScene -Algorithm SHA256).Hash.ToLowerInvariant()
New-Item -ItemType Directory -Path $target | Out-Null
try {
    foreach ($folder in @('Assets', 'Packages', 'ProjectSettings', 'Tools', 'Levels')) {
        Copy-Item -LiteralPath (Join-Path $source $folder) -Destination $target -Recurse
    }
    $copyHash = (Get-FileHash -LiteralPath (Join-Path $target $sceneRelative) -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($copyHash -ne $sourceHash) {
        throw 'Copied Level1 does not match the source; isolation marker was not written.'
    }
    if (Test-Path -LiteralPath (Join-Path $target '.git')) {
        throw 'Destination unexpectedly contains a Git working tree.'
    }
    $markerPath = Join-Path $target 'Tools\PhysicsLevelEditor\tests\phase1-isolation.json'
    if (Test-Path -LiteralPath $markerPath) {
        throw 'A copied isolation marker already exists; refusing to reuse it.'
    }
    $marker = [ordered]@{
        markerVersion = 1
        sourceRoot = $source
        isolatedRoot = $target
        level1Sha256 = $sourceHash
        createdUtc = [DateTime]::UtcNow.ToString('o')
    }
    $marker | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $markerPath -Encoding UTF8
    Write-Output "Isolated Unity project ready: $target"
    Write-Output 'Open this exact path through Unity Hub. The source project was not edited.'
}
catch {
    Write-Warning "Isolation copy was not completed. Partial files, if any, remain at: $target"
    throw
}
