[CmdletBinding()]
param(
    [string]$DotnetPath = 'E:\Unity\6000.6.4f1\Editor\Data\DotNetSdk\dotnet.exe',
    [Parameter(ValueFromRemainingArguments=$true)][string[]]$CheckArguments
)
$ErrorActionPreference='Stop'
if (!(Test-Path -LiteralPath $DotnetPath)) { throw 'Pass -DotnetPath pointing to a full .NET 8 SDK host (the system runtime-only dotnet is insufficient).' }
$projectRoot=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$previousTelemetry=$env:DOTNET_CLI_TELEMETRY_OPTOUT
Push-Location -LiteralPath $projectRoot
try {
    $env:DOTNET_CLI_TELEMETRY_OPTOUT='1'
    & $DotnetPath run --project (Join-Path $PSScriptRoot 'DataChecks/DataChecks.csproj') -- @CheckArguments
    if ($LASTEXITCODE -ne 0) { throw "Native data checks failed with exit $LASTEXITCODE" }
} finally {
    Pop-Location
    $env:DOTNET_CLI_TELEMETRY_OPTOUT=$previousTelemetry
}
