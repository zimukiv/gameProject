# Three-theme mechanism checks

Run from the Unity repository root:

```powershell
dotnet run --project Tools/RoomLabNative/ThemeChecks
```

An optional first argument selects another complete editor JSON/ZIP. Default: `Assets/StreamingAssets/RoomLabNative/Editor3/build4-three-themes.zip`.

Uses the actual production Fire method. Checks 10 authored template mechanism instances: group animation 0 to 1, launch direction and speed, sign-in counts, cooldown and rejected repeated activation, independent checkpoint snapshots, retry and continuation state. This is automated state validation, not a keyboard playthrough. The editor implementations remain the behavioral authority; teacher patrol and the planning document's alternate teleport mechanics are not implemented by build4.
