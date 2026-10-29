# Demo jet chase regression (2026-10-30, v2)

Run from the repository root with the Unity-bundled .NET 8 SDK or an installed .NET 8 SDK:

```powershell
dotnet run --project Tools/RoomLabNative/JetTrailChecks/JetTrailChecks.csproj
```

The same suite against the saved pre-fix `NativeGameplayAI.cs` must fail:

```powershell
dotnet run --project Tools/RoomLabNative/JetTrailChecks/JetTrailChecks.csproj -p:UseBeforeJetFix=true
```

The actual authored room 10 case stages the player immediately above the real right jet and the trailing AI outside its collider but inside its configured range. Production `Tick` performs the landing/jet trigger. Subsequent ordinary left input lands the player on the authored upper platform; the AI must finish the recorded floor segment, pass the jet corner in chronological order, and follow the left ascent without independent ballistics or a speed discontinuity. Initial position staging is explicit; this is a focused regression, not proof of normal complete-course traversal.

Additional cases cover both unaffected legacy profiles, `affectAI=false`, range 95/97px, `hitAI`/`unlockPadId`, repeated jet contact, and preserving pending portal state. The JSON, object parameters and frozen old reference oracles are never rewritten. Logs and the original source snapshot are in `Validation/Native/JetTrail20261030`.
