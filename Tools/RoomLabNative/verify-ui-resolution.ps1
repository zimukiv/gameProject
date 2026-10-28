# Builds the native physics demo and runs the resolution / UI adaptation matrix.
# The matrix captures every page at mainstream resolutions and asserts, from the live
# uGUI rects, that no text or control overlaps, nothing leaves the design space and no
# label is clipped. It also records the world render texture size for each window size.
#
# Exit codes: 198 from Unity means the editor license is missing (sign in once in Unity):
#   E:\Unity\6000.6.4f1\Editor\Unity.exe -projectPath "G:\project null\gameProject-roomlab255"
param([switch]$SkipBuild)
$ErrorActionPreference='Stop'
$project='G:\project null\gameProject-roomlab255'
$unity='E:\Unity\6000.6.4f1\Editor\Unity.exe'
$evidence=Join-Path $project 'Validation\Native\UI'
New-Item -ItemType Directory -Force $evidence | Out-Null
if(-not $SkipBuild){
    & $unity -batchmode -quit -projectPath $project -executeMethod RoomLab.Native.Editor.NativePhysicsDemoEditor.Build -logFile (Join-Path $evidence 'ui-build.log')
    if($LASTEXITCODE -ne 0){throw "Unity build failed with exit $LASTEXITCODE. 198 = missing editor license; see ui-build.log"}
}
$exe=Join-Path $project 'Builds\NativePhysicsDemo-Final\RoomLabPhysics.exe'
$matrix=Join-Path $evidence 'Matrix'
& $exe -nativeUiMatrix -nativeEvidencePath $matrix
"matrix exit=$LASTEXITCODE"
$report=Join-Path $matrix 'ui-matrix.txt'
if(Test-Path $report){Get-Content $report}
