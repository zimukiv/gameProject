[CmdletBinding()]
param([string]$ExistingRuntime)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$runtimeRoot = Join-Path $projectRoot '.roomlab-runtime'
$sourceApp = Join-Path $projectRoot 'Tools/RoomLabRuntimeApp'
$runtimeApp = Join-Path $runtimeRoot 'resources/app'
if (!(Test-Path -LiteralPath (Join-Path $sourceApp 'project.json'))) { throw 'Missing versioned RoomLabRuntimeApp sources' }
if (!(Test-Path -LiteralPath (Join-Path $runtimeRoot 'RoomLabCore.exe'))) {
    if ($ExistingRuntime) {
        $existingRoot = (Resolve-Path -LiteralPath $ExistingRuntime).Path
        if (!(Test-Path -LiteralPath (Join-Path $existingRoot 'RoomLabCore.exe'))) { throw 'ExistingRuntime must contain RoomLabCore.exe' }
        New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
        Copy-Item -Path (Join-Path $existingRoot '*') -Destination $runtimeRoot -Recurse -Force
    } else {
        $electronVersion = '44.5.1'
        $archiveName = "electron-v$electronVersion-win32-x64.zip"
        $expectedHash = '9b382492dcfee91f8f9e92c91f7972550a1b95d2299cac72279dab33a600d7db'
        $cacheRoot = Join-Path $projectRoot '.roomlab-downloads'
        New-Item -ItemType Directory -Path $cacheRoot -Force | Out-Null
        $archive = Join-Path $cacheRoot $archiveName
        if (!(Test-Path -LiteralPath $archive)) {
            Invoke-WebRequest -Uri "https://github.com/electron/electron/releases/download/v$electronVersion/$archiveName" -OutFile $archive
        }
        if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash) {
            throw 'Electron archive checksum mismatch; remove the cached archive and retry'
        }
        Expand-Archive -LiteralPath $archive -DestinationPath $runtimeRoot -Force
        Rename-Item -LiteralPath (Join-Path $runtimeRoot 'electron.exe') -NewName 'RoomLabCore.exe'
    }
}
New-Item -ItemType Directory -Path $runtimeApp -Force | Out-Null
Copy-Item -Path (Join-Path $sourceApp '*') -Destination $runtimeApp -Recurse -Force
Write-Output "ROOMLAB_RUNTIME_READY $runtimeRoot"
Write-Output 'Edit Tools/RoomLabRuntimeApp, then rerun this script to refresh the runtime copy.'
