# AI jump / developer safety-return regression (v2)

Run from the Unity project root, without Unity or the game:

```powershell
& 'E:/Unity/6000.6.4f1/Editor/Data/DotNetSdk/dotnet.exe' run --project Tools/RoomLabNative/AIJumpChecks/AIJumpChecks.csproj
```

The runner compiles the same Data/Core source files as the player. It constructs
small in-memory fixtures, validates their tile/object counts, and never rewrites
the authored JSON. The default suite covers the approved video-related Demo
flight-route fix and the developer-only LockHealth safety-return fix.

To reproduce against the independently saved pre-fix source, using the same final
tests and no production-source overwrite:

```powershell
& 'E:/Unity/6000.6.4f1/Editor/Data/DotNetSdk/dotnet.exe' run --project Tools/RoomLabNative/AIJumpChecks/AIJumpChecks.csproj -p:UseBeforeFix=true
```

The pre-fix sources are expected to fail. The initial final-suite comparison is
preserved in `before-final-red.log` (25 cases, 14 failures). The later pending
portal cancellation test has its own `pending-portal-red.log`, which failed
against the first fix before the narrow reservation-release repair.
Current fixed default suite: exit 0, 26 cases, 373 assertions, 0 failures.
`--developer-only` selects the nine three-profile developer walk-off tests plus
the real pending-portal cancellation/retrigger test.

`--recovery-diagnostics` additionally runs five deliberately unresolved diagnostic
cases from the earlier, wider out-of-bounds recovery proposal. They remain
reported as failures (exit 1); this flag is not a default acceptance suite.
Two reproduce the existing offscreen AI warp/same-frame collectible behavior;
three describe an unimplemented warning/protection/recovery-state design. The
video showed landing path discontinuity, not offscreen AI recovery, so that wider
design was explicitly deferred rather than silently altering its expectations.

See `Handoff/AI_JUMP_FIX_V2.md` and `Validation/Native/AIJumpV2/` for the source
baseline, initial diagnosis, final RED/GREEN logs, and unchanged legacy oracles.
