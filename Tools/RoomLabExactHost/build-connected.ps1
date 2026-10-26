[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$UnityExe)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$runtimeRoot = Join-Path $projectRoot '.roomlab-runtime'
if (!(Test-Path -LiteralPath (Join-Path $runtimeRoot 'RoomLabCore.exe'))) { throw 'Run setup-runtime.ps1 first' }
if (!(Test-Path -LiteralPath $UnityExe)) { throw 'UnityExe must point to Unity 6000.6.4f1 Editor/Unity.exe' }
# Always refresh the staged runtime from the versioned app before packaging.
& (Join-Path $PSScriptRoot 'setup-runtime.ps1')
$buildRoot = Join-Path $projectRoot 'Builds/RoomLabConnected'
New-Item -ItemType Directory -Path $buildRoot -Force | Out-Null
$previousOutput = $env:ROOMLAB_EXACT_OUTPUT
try {
    $env:ROOMLAB_EXACT_OUTPUT = Join-Path $buildRoot 'RoomLabUnity.exe'
    $buildLog = Join-Path $buildRoot 'build.log'
    $arguments = @('-batchmode', '-quit', '-projectPath', ('"' + $projectRoot + '"'),
        '-executeMethod', 'RoomLabExactBuild.RebuildConnected', '-logFile', ('"' + $buildLog + '"'))
    $buildProcess = Start-Process -FilePath $UnityExe -ArgumentList $arguments -WindowStyle Hidden -PassThru -Wait
    if ($buildProcess.ExitCode -ne 0) { throw "Unity build failed; see $buildLog" }
    $buildRuntime = Join-Path $buildRoot 'RoomLabRuntime'
    New-Item -ItemType Directory -Path $buildRuntime -Force | Out-Null
    Copy-Item -Path (Join-Path $runtimeRoot '*') -Destination $buildRuntime -Recurse -Force
    Write-Output "ROOMLAB_BUILD_READY $buildRoot"
} finally {
    $env:ROOMLAB_EXACT_OUTPUT = $previousOutput
}
