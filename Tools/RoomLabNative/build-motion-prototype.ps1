[CmdletBinding()]
param([string]$UnityExe='E:\Unity\6000.6.4f1\Editor\Unity.exe')
$ErrorActionPreference='Stop'
$root=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$evidence=Join-Path $root 'Validation/Native/P2'
New-Item -ItemType Directory -Path $evidence -Force | Out-Null
function Invoke-Unity([string]$method,[string]$log,[bool]$quit) {
    $args=@('-batchmode','-projectPath',('"'+$root+'"'),'-executeMethod',$method,'-logFile',('"'+(Join-Path $evidence $log)+'"'))
    if($quit){$args+= '-quit'}
    $p=Start-Process -FilePath $UnityExe -ArgumentList $args -WindowStyle Hidden -PassThru
    Write-Output "NATIVE_UNITY_STARTED method=$method pid=$($p.Id)"
    if(!$p.WaitForExit(180000)){Stop-Process -Id $p.Id -Force;throw "Native Unity timeout: $method"}
    if($p.ExitCode -ne 0){throw "Native Unity exit $($p.ExitCode): $method"}
}
Push-Location -LiteralPath $root
$oldVerify=$env:ROOMLAB_NATIVE_MOTION_VERIFY
try {
    Remove-Item Env:ROOMLAB_NATIVE_MOTION_VERIFY -ErrorAction SilentlyContinue
    Invoke-Unity 'RoomLab.Native.Editor.NativeMotionEditor.Build' 'unity-build.log' $true
    $env:ROOMLAB_NATIVE_MOTION_VERIFY='1'
    Invoke-Unity 'RoomLab.Native.Editor.NativeMotionEditor.ValidatePlayMode' 'unity-playmode.log' $false
    $env:ROOMLAB_NATIVE_MOTION_VERIFY=$oldVerify
    $exe=Join-Path $root 'Builds/NativePrototype/RoomLabNative.exe'
    $playerEvidence=Join-Path $evidence 'Standalone'
    New-Item -ItemType Directory -Path $playerEvidence -Force | Out-Null
    '{"status":"running","capturePixelsValidated":false}' | Set-Content -LiteralPath (Join-Path $playerEvidence 'native-player-result.json') -Encoding utf8
    $p=Start-Process -FilePath $exe -ArgumentList @('-nativeMotionVerify','-nativeEvidencePath',('"'+$playerEvidence+'"'),'-logFile',('"'+(Join-Path $playerEvidence 'player.log')+'"')) -WindowStyle Hidden -PassThru
    Write-Output "NATIVE_PLAYER_STARTED pid=$($p.Id)"
    if(!$p.WaitForExit(60000)){Stop-Process -Id $p.Id -Force;throw 'Native standalone verification timeout'}
    if($p.ExitCode -ne 0){throw "Native standalone exit $($p.ExitCode)"}
    Write-Output 'NATIVE_PROTOTYPE_PIPELINE_PASS build=true editorPlayMode=true standalone=true'
} finally { $env:ROOMLAB_NATIVE_MOTION_VERIFY=$oldVerify;Pop-Location }
