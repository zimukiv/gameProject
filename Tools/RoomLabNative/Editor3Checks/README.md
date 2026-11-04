# Editor 3.0.0 build6 compatibility checks

Authority: repository `Tools/RoomLab/room-editor`, upstream commit `6cd56e1`. No gameplay-module changes were introduced by editor builds 5/6; build5 restores missing original built-in assets, build6 separates cloud-panel opening from local backup failures.

Run from Unity repository root:

```powershell
$env:NODE_PATH='G:\project null\room-editor\node_modules'
node Tools/RoomLabNative/Editor3Checks/export-latest.cjs
& 'E:\Unity\6000.6.4f1\Editor\Data\DotNetSdk\dotnet.exe' run --project Tools/RoomLabNative/Editor3Checks/Editor3Checks.csproj
& 'E:\Unity\6000.6.4f1\Editor\Data\DotNetSdk\dotnet.exe' run --project Tools/RoomLabNative/ThemeChecks/ThemeChecks.csproj
```

NODE_PATH supplies dependencies only; all editor implementation code is loaded from the repository. `export-latest.cjs` packs the latest checked-in example with an empty file map. It verifies exact restoration of 13 original assets, no project mutation, rejection of missing custom bytes with the same built-in ID but a different hash, and preservation of supplied custom SVG bytes and binding. Its report records frozen ZIP and custom image hashes in `latest-export-evidence.json`. Regeneration may change ZIP timestamps and must be followed by testing and rebuilding.

`editor3-three-themes.zip` is byte-identical to the built-in runtime package. `build4-three-themes.zip` remains an old regression fixture (SHA256 `469b61a1f31323c8f09f0fd556516482686d5094a7153a6cebaef5509feedd6d`); it is no longer shipped as the current built-in. Prior example regeneration changed two random physics rail-node IDs; the authored 11-room physics campaign remains separate and unchanged.

Editor3Checks: 18 assertions (15 old import checks plus exact custom image bytes/hash and course-binding preservation). ThemeChecks: 10 mechanisms. Pure data/core checks do not represent manual gameplay. Unity production validation remains in NativeEditor3Acceptance and NativePhysicsDemoPlayer.Verify.

Opt-in PlayableCoursesOnly filters the runtime model by stable CourseId; OriginalJson and SourceBytes retain the complete package. Single-course save identity remains compatible, multi-course saves use one bounded SHA256 identity. Course defaults apply at creation only. Asset paths and availability are still checked globally; missing files in an unselected course may block import. JSON missing-file visual fallback is not claimed as exact built-in seed restoration.
