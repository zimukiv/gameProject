[CmdletBinding()]
param([string]$DotnetPath='E:\Unity\6000.6.4f1\Editor\Data\DotNetSdk\dotnet.exe')
$ErrorActionPreference='Stop'
$projectRoot=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Push-Location -LiteralPath $projectRoot
try { & $DotnetPath run --project (Join-Path $PSScriptRoot 'MotionChecks/MotionChecks.csproj'); if($LASTEXITCODE -ne 0){throw "Motion checks failed: $LASTEXITCODE"} } finally { Pop-Location }
