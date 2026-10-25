# Physics Level Editor work log

## Product goal and room contract

Ship a Windows editor that teammates can run without Unity Editor or Node.js. It must eventually edit all three original levels, their objects, components, references, events, images and audio; keep recoverable history; and launch a game runner that loads the latest saved edits. Room 1 Physics = `Level1.unity`, Room 2 Calculus = `Level2.unity`, Room 3 Slacker = `Level3.unity`. Each room is one continuous map and one independent coordinate space. Checkpoint labels inside a level do not create extra rooms.

The original Unity Scenes are immutable sources for this editor. User work must go into separate writable data. No data or Playtest claim is accepted solely from a static test.

## History and evidence

| Stage | Result | Remaining boundary |
| --- | --- | --- |
| Phase 1 | Three object V1 JSON and isolated Unity data/behavior roundtrip accepted | Partial Level1 sample only |
| Phase 2 | Electron desktop editor, file access, Inspector and canvas | Not a complete three-room editor |
| Phase 3 | Canvas, hierarchy, multi-select, collider editing, templates, undo/redo; stable baseline `e58ee96c892d2cc25e097909b159d8eb36d77a09` | Three-room content absent at baseline |
| P4.1 | V2 registry, schema and strict validation, static tests | No runtime event engine |
| P4.2A/B | Component adapters and isolated Unity data tests; partial mechanic tests | Full scene coverage unverified |
| M0 and M1.1 | Source audit, V3 schema, SourceMaps, ProjectManifest | Source inventories are not playable scenes |
| M1.2 | Three full-fidelity V3 source drafts | Unity reconstruction not verified |
| M1.3A | Seven real Level1 thermal objects rebuilt; isolated Unity Data and Play Mode PASS | Field coverage partial |
| M1.3B-1 | Full Level1 candidate and property audit; Unity baseline still FAIL | No edited rebuild or Play Mode acceptance |

Across three source Scenes there are 207 GameObjects, 729 component instances and 21 persistent UnityEvent calls. Level1 has 71/254, Level2 64/221, Level3 72/254 objects/components. Level1 property audit counted 4,504 fields and 14 SerializedProperty types; audit PASS does not establish successful field restoration.

### M1.3B-1 debugging record

The source YAML, M1.2 drafts and candidate data are retained. Resolved or advanced blockers included empty MonoBehaviour `m_Name` YAML scalars, empty UnityEvent argument strings, Camera Rect handling, root HUD Canvas engine-driven RectTransform state, child UI `anchoredPosition` versus `localPosition` write order, and UI.Text `FontData.m_MaxSize` normalization. Some were statically checked first and then crossed in later real Unity baseline attempts; this is not a full-scene PASS.

The eleventh real baseline rebuild ended at `PRE_SAVE` with `M13B1_CANDIDATE_STATUS=FAIL`, `M13B1_DATA_STATUS=INCOMPLETE`, `M13B1_PLAY_STATUS=NOT_RUN`. The previous font blocker was crossed. The next blocker is Guide Canvas, object ID `76a9b388-aac0-5609-b2f5-f6566fc5f049`, `$.objects[55]`, sibling index 33 (PASS). V3 expects zero local position/scale/anchored position/sizeDelta/pivot. The rebuilt instance reports `(293,246.5,0)`, scale `(0.559887886,0.559887886,0.559887886)`, anchored position `(293,246.5)`, sizeDelta `(1046.6380615,880.5334473)`, pivot `(0.5,0.5)`. This resembles the verified HUD behavior, but the original Guide Canvas loaded instance has not been independently compared. Development-only tracing exists in `PhysicsLevelV3Level1Candidate.cs`; it has not passed this Guide comparison or been synced for a new Unity run.

**RELEASE-FIRST decision (2026-10-25):** Freeze per-field M1.3B-1 debugging. A complete Unity reconstruction is no longer a prerequisite for shipping a safe browsing/editing Beta. Do not run a twelfth baseline iteration until that work is explicitly resumed.

## Windows Beta produced in this checkout

Build: `cd Tools/PhysicsLevelEditor && npm.cmd run check && npm.cmd run build && npm.cmd run package:portable`. Output is `release/PhysicsLevelEditor-win32-x64-beta-r2/PhysicsLevelEditor.exe` plus `release/PhysicsLevelEditor-win32-x64-beta-r2.zip`. Extract the full ZIP before launching the EXE; keep the runtime files next to it. Electron and its required production packages are included. No Unity Editor or Node.js installation is required to launch the packaged program in a normal Windows environment.

The Beta bundles `ProjectManifest.json`, three SourceMaps, three original M1.2 V3 drafts, ResourceSources and the old V1 sample. It shows three room entries and all audited source objects/components, object hierarchy, names, stable IDs, registered/source component fields and resolvable references. It uses clearly labelled object markers; these are **not** Unity graphics. UI/Canvas positions are not drawn as world objects.

Only ownership-A, non-RectTransform `localPosition` is writable in the three-room Beta. All other source data is shown read-only. Changes are validated against the source Scene hash, stored as a small overlay under `%APPDATA%\\physics-level-editor-beta\\room-work-copies`, and reopen with the room. Save checks external modification and writes via a temporary file; existing work copies receive timestamped backups. Restore source positions is explicit. Original Unity Scenes, M1.2 drafts, references and component source fields are never overwritten by normal Beta save.

The Phase 3 V1/V2 tool remains reachable. The three-room Beta does **not** yet support editing components/events/resources, full Unity sprite rendering, applying overlays to the Unity game, a game runner, or one-click Playtest. `Playtest: NOT_IMPLEMENTED` is shown in the UI. This is a source-browser and limited position-editing Beta, not the final full editor.

### Verification on 2026-10-25

- `npm.cmd run check`: 67 PASS, 1 legacy Unity test SKIP, 0 FAIL. New tests opened all 207 objects and 729 components; position save/reopen, backup, source preservation and invalid edits passed.
- `npm.cmd run build`: PASS. Vite renderer built; 22 Electron CJS source/JSON modules passed transitive dependency integrity checking.
- Portable package creation and ZIP listing: PASS. EXE and packaged dependencies exist; ZIP contains the three V3 drafts.
- Running the packaged EXE with `ELECTRON_RUN_AS_NODE=1` loaded its bundled CJS and all three room inventories: 71/64/72 objects and 254/221/254 components, PASS. This is a packaged data check, not a GUI check.
- Real Electron GUI launch in this controlled environment: **NOT VERIFIED**. Electron aborts before app code with an AppContainer directory ACL error despite read/execute access granted to `ALL APPLICATION PACKAGES` on the generated release folder. Teammate Windows launch and file-edit acceptance remain to be performed. No GUI PASS is claimed.
- Unity game preview from saved overlay: **NOT IMPLEMENTED**. M1.3B-1 Data and Play remain incomplete/not run.

## Next acceptance and risks

1. On a normal Windows x64 desktop, extract the ZIP and double-click the EXE. Confirm three room cards, 71/64/72 hierarchy rows, Chinese names, read-only component/reference display, a supported position edit, Save, close/reopen, and source recovery. Preserve both originals and work copy backups.
2. Review an overlay application route: immutable original Scene as base plus stable-ID validated position/parameter deltas in an isolated game runner. Reject unsupported fields. This may avoid rebuilding every Unity component, but it has not yet been implemented or verified.
3. Resume M1.3B-1 only when needed for wider editing: original Guide Canvas comparison, PRE_SAVE and POST_REOPEN, edited fixture, UnityEvent and gameplay verification. Continue Level2/3 integration separately.
4. Add real asset rendering, typed component/event editing, portable resources, game runner and final Windows release only with matching runtime acceptance.

Static tests do not imply Unity reconstruction PASS. A packaged EXE and source browsing do not imply the complete editor or one-click Playtest is complete.

## Canvas regression repair (2026-10-25)

The first three-room Beta routed V3 data to a new `release-workbench.tsx` SVG that drew each world object as a labelled circle. This bypassed the stable Phase 3 canvas geometry and interactions in `main.tsx` / `editor/document.ts`. It made real ground, platform and ice Collider sizes invisible even though the M1.2 V3 drafts retain `BoxCollider2D` dimensions and offsets.

The repair adds `editor/v3-canvas.ts`, an adapter from V3 source fields to the Phase 3 world transform and collider geometry functions. `ui/v3-canvas-view.tsx` restores polygon Collider outlines, grid, pointer-centered zoom, pan, click/box/multi-selection, focus, snapping and one-step multi-object drag. Box and Circle colliders use their size/radius, offset, Transform scale, rotation and parent transform. The Inspector and hierarchy share selection. UI and Camera objects stay in the hierarchy with dedicated labels rather than being drawn as world geometry; source-only SpriteRenderers without trustworthy sprite bounds use a visibly distinct square placeholder. Hover or selection reveals object names, reducing label overlap.

Only supported V3 `localPosition` edits write to the original separate overlay. Collider handles and unsupported component fields remain read-only; source YAML, V3 drafts and formal Scenes are untouched. The Phase 3 V1/V2 editor is still reachable through the legacy button, and the underlying Phase 3 geometry code is reused. This is a canvas restoration, not a claim that native Sprite assets or Unity Playtest are available.

New regression tests check actual Level1/2/3 ground and platform geometry, Level1 Ice wall dimensions, CircleCollider radius/offset, work-copy movement, atomic multi-drag, the Phase 3 selected-parent rule and read-only rejection. The test suite reports 72 PASS, 1 existing Unity-only SKIP, 0 FAIL; build and ZIP packaging PASS. The packaged executable independently loads 71/64/72 objects and 254/221/254 components in Node-runtime mode. A GUI smoke launch in the controlled agent environment aborts at Electron's AppContainer ACL preflight before app code; GUI is **NOT VERIFIED** here. Prior user verification establishes that the older EXE launches on the user's desktop, but does not validate this revised canvas. The current portable artifact is `release/PhysicsLevelEditor-win32-x64-beta-r4.zip`; earlier Beta archives are retained for comparison.

## P0 real Unity playtest bridge (in progress, 2026-10-25)

The r4 canvas was accepted by the user, but its saved overlay did not affect the game. This is now the sole P0 objective. Two routes were compared: (A) a prebuilt Unity Player reads each saved overlay at launch; (B) rebuild a copied Scene/Player for each edit. Route A is used for repeat playtest speed. A one-time **isolated** Scene copy and build supplies the Player; subsequent tests read new immutable session copies of the saved overlay without rebuilding the 254 original Level1 components.

The copied Scene is named `Level1` so existing scene-name-based game logic remains valid. The isolated Editor build checks source Scene SHA-256, SourceMap SHA-256, source Scene GUID, all 71 GameObject fileIDs and 33 A-object stable IDs. It attaches `LevelObjectId` only to the copied Scene and adds a dedicated bootstrap. The runtime reads a SHA-256-bound overlay, checks room/source/ID inventory and every edit before applying any position, then writes an applied/rejected receipt with actual Transform readback. The editor refuses unsaved changes, external work-copy conflicts, missing/incompatible Players and incomplete receipts. Session files and Player logs are kept under its separate user-data directory. The Player uses the previously isolated Company/Product, so its persistent save path differs from the formal game. This route does not use object names or runtime YAML fileIDs to match a target.

New files: `Assets/Scripts/LevelRuntime/LevelEditorPlaytestBootstrap.cs`, `Assets/Editor/LevelImportExport/PhysicsLevelPlaytestBuild.cs`, `src/editor/playtest.ts`, `tests/playtest.test.ts`, `tools/compile-playtest-static.py` and the new Unity `.meta` files. The Electron main/preload/UI and portable packager have only the launch/receipt and runner inclusion changes. The packager refuses to create a Playtest-labelled ZIP without a matching isolated Unity Player.

**Verified now:** `npm.cmd run check` 73 PASS / 1 existing Unity SKIP; `npm.cmd run build` PASS; new C# sources compile against installed Unity 6000.6.4f1 assemblies (warnings only). An integration test saved Start ground at X+0.5 and X+1.0 in sequence and confirmed two distinct, hashed session overlays for the same stable object ID. The three formal Scene hashes still match ProjectManifest. These tests do **not** prove a Player build or actual Unity application.

**Current blocker:** isolated batchmode began script reload but Licensing Client IPC refused and retried; no `PLE_PLAYER_BUILD_PASS` or Player artifact was produced. The batch Editor process started by this task was stopped after repeated license timeouts. `Temp/Phase4AIsolatedProject/Temp/UnityLockfile` remained; it was **not removed**. The four new Unity script/meta files had been synced before launching, with identical source/isolated SHA-256. Do not overwrite that isolated project while its lock exists. `npm.cmd run package:portable` correctly fails closed because no verified Player build exists. There is **no new r5 ZIP yet**, and real Player data/behavior/GUI are NOT_RUN.

Next single action in a normally licensed Unity Hub session: open `Temp/Phase4AIsolatedProject` in Unity 6000.6.4f1; after scripts compile with zero red errors, run `Physics Level Editor > Release First > Build isolated Room 1 playtest Player`. Capture `PLE_PLAYER_BUILD_PASS` and the output path, or report the first error. The Editor must be closed before any further file sync. Only after the Player build can `npm.cmd run package:portable` create the r5 ZIP and the real Start ground X+0.5 / X+1.0 Player tests begin. Unity Player build PASS, receipt/applied PASS and human movement/jump/gameplay PASS must be reported separately.

## Embedded Playtest acceptance (2026-10-25)

Goal: Room 1 saved work copy -> click 试玩 -> the real Unity Player runs **inside the workbench stage** -> keyboard works -> stop -> back to editing -> replay shows the new value. The isolated Player build and the SHA-bound overlay were already present; this session resolved the embedding failures and completed runtime acceptance on the packaged r5.

### Embedding diagnosis (observed, not inferred)

1. Standalone `PhysicsLevelPlaytest.exe` renders and accepts keyboard input. Baseline PASS.
2. Engine-owned attach via `-parentHWND <hwnd> delayed` (mode `unity`): the Player renders inside the host area. If the host then restyles/reparents the window **after** Unity has attached (`SetWindowLongPtr`, `SetParent`, style changes), the client area turns black. Not used.
3. Host-owned `SetParent` + `WS_CHILD` (mode `child`): renders, but synthetic A/D/Space do not move the player; keyboard focus stays outside the child window. Rejected for acceptance.
4. Owned borderless overlay: top-level `WS_POPUP` window, `GWL_HWNDPARENT` set to the workbench HWND, `WS_EX_TOOLWINDOW`, no caption, positioned over the stage. It renders real gameplay **and** receives keyboard input, has no taskbar entry, follows the stage, and cannot be moved independently. **Adopted.**
5. The earlier "owned mode renders black" reading was a harness artifact: the self-host WinForms form used `TopMost=true` and covered the owned window. `--topmost` now defaults off; with it off the owned window renders.

### DPI and geometry

- `native/PlaytestHost.cs` calls `SetProcessDpiAwarenessContext(PER_MONITOR_AWARE_V2)` with a `SetProcessDPIAware()` fallback before creating anything.
- The Electron main process measures the stage rect in DIP (renderer `getBoundingClientRect()` plus `getContentBounds()`) and converts it with `screen.dipToScreenRect()`, then fits 16:9 inside the measured stage so `CanvasScaler` never crops the HUD.
- Measured on the packaged EXE (physical 2560x1600, 150% scaling): workbench 2221x1351 at (170,89); embedded Unity window 1285x722 at (602,438), i.e. 16:9, inside the center stage, with the right Inspector still visible. Evidence: `ple-geom-front.png` (DPI-aware full-screen capture).
- Test-tooling note: a DPI-unaware screen capture produced a 1707x1067 image that is a **1:1 crop of the top-left physical region**, not a downscaled full screen. That crop cut the workbench at x=1707 and produced a false "the game spills past the stage" reading. Geometry checks must use a DPI-aware capture.

### Edit -> save -> playtest -> stop (packaged r5)

- `PLAYTEST_SMOKE={"before":"-4.5","after":"-4","applied":true,...}`.
- Receipt `%APPDATA%\Physics Level Editor Beta\playtest-sessions\ef254f55-6595-46ac-992e-b71a627c365e\receipt.json`: `status=applied`, `appliedCount=1`, Start ground `46c11342-6027-593d-87d5-ff1d6cb512b2` at `x=-4.0, y=-3.5, z=0`.
- UI footer: "Unity 已确认应用 1 项位置修改 · PID 40268 · 原始 Unity Scene 不会被覆盖".
- Keyboard inside the embedded window: clicked the stage (triggers `focusPlaytest`), then sent D/Space. HUD changed from `SCORE 0 / TOKENS 0` to `SCORE 200 / TOKENS 2`, `充能 2/3`. Evidence: `ple-input-packed.png`.
- Auto-stop after 120 s: both `PhysicsLevelPlaytest.exe` and `PlaytestHost.exe` exited; the editor canvas returned and the header went back to `试玩 Room 1`. Evidence: `ple-state-now.png`.
- Externally closing the Unity window (`WM_CLOSE`) also stops the session and restores the canvas.
- A hard Unity crash (process killed without WM_CLOSE) is **NOT TESTED**. The helper attaches a Job Object with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`, but crash survival/cleanup is unverified.
- Formal Scenes unchanged: `git status` shows no modification under `Assets/Scenes`. PlayerPrefs `GameFullscreen_h3745021268` is `0` after the run.

### Tests, build, artifact

- `npm.cmd run check`: 75 tests, 74 PASS, 1 existing Unity-only SKIP, 0 FAIL.
- `npm.cmd run build`: PASS.
- `npm.cmd run package:portable`: PASS. `release/PhysicsLevelEditor-win32-x64-beta-r5-playtest/` and `.zip` (490,823,680 bytes). SHA-256 `4EA1DD839DE2FC1D04BE8B3FCF903464F717B23DC68591C9D574EF2B15B379B2`. `r4` is retained untouched.
- The packager now compiles `native/PlaytestHost.exe` from checked-in source before packaging and refuses to ship without it; the ZIP listing is verified. `tar.exe` is invoked with a bare archive name from the release directory because bsdtar treats an absolute `C:\...` `-f` path as a remote host.
- `runner-staging/` (a junction to the isolated Player build, dev only) and `native/bin/` are gitignored; neither is part of the release.

### Capabilities and limits

- Runtime-verified: Room 1 only; A-class non-UI `localPosition` edits; work-copy save with backup and SHA-bound overlay; embedded real Player with working keyboard input; stop/exit cleanup.
- Not implemented: playtest for Rooms 2/3; collider/component-field editing; native Sprite asset rendering; Unity-Editor-free **rebuild** of the Player (the bundled Player is prebuilt).
- The embedded window is an **owned top-level overlay**, not a true child. It is visually inside the stage and follows it, but it remains a separate owned HWND. Child mode stays unsuitable because of keyboard focus.
- Minimize hides the game; restore re-shows, resizes and refocuses. Window move/resize and the renderer `ResizeObserver` reapply the rect (verified in dev; not separately re-verified on r5).
- The renderer's timed auto-stop depends on a renderer timer; Chromium throttling (occluded window) can delay it. The Stop button and window-close paths are independent of that timer.

### Minimal manual acceptance

1. Extract `PhysicsLevelEditor-win32-x64-beta-r5-playtest.zip` fully; do not run the EXE inside the ZIP.
2. Double-click `PhysicsLevelEditor.exe`, open Room 1, select `Start ground`, change X by +0.5, click `保存工作副本`.
3. Click `试玩 Room 1`, click the game area once, then A/D + Space; confirm movement/jump in the embedded game.
4. Click `停止试玩`; confirm the canvas returns; play again and confirm the saved X is still applied (receipt/footer).
5. Confirm the formal `Assets/Scenes/Level1.unity` and the other Scenes are unchanged.

### Residual test-process note

Four `PhysicsLevelEditor.exe` PIDs (30960/37568/46328/47164, started 20:38-22:00, no command line, no window) survived `WM_CLOSE` and `Stop-Process`. They predate this acceptance run and are outside it; every process started by the r5 run exited normally.

## Documentation and repository state (2026-10-26)

Added `PLAYTEST_GUIDE.md` (Chinese end-user manual for Beta r5): extraction and launch, the Room 1 edit/save/playtest/stop acceptance flow, keyboard controls, work-copy and session paths, receipt fields, window behavior (owned overlay, not a true child), troubleshooting, limits, and developer packaging prerequisites. `README.md` now links to it and marks the older Phase 2/3 sections as development documentation.

Corrected the packaged `README.txt` template: the user-data path was written as `%APPDATA%\physics-level-editor-beta\room-work-copies`, but the actual Electron `userData` directory is `%APPDATA%\Physics Level Editor Beta`. The old playtest ZIP still contains the wrong text; the clean `PhysicsLevelEditor-r5-win-x64.zip` described below was repackaged after the fix and contains the corrected Chinese README plus `PLAYTEST_GUIDE.md`.

`Tools/PhysicsLevelEditor/.gitignore` now also excludes `release/` (3.0 GB of local Beta folders and ZIPs) and Python caches. Release artifacts stay local; source, native helper source, tests, Phase 4 Unity scripts/data and documentation are committed. The formal Unity Scenes remain unmodified.

Pre-commit evidence from this acceptance session: `npm.cmd run check` 75 tests / 74 PASS / 1 existing Unity-only SKIP / 0 FAIL; `npm.cmd run build` PASS; packaged r5 smoke `PLAYTEST_SMOKE={"before":"-4.5","after":"-4","applied":true}`; receipt status `applied`, `appliedCount=1`, Start ground `x=-4.0`; embedded keyboard input changed the HUD from `SCORE 0 / TOKENS 0` to `SCORE 200 / TOKENS 2`. Hard-crash cleanup remains NOT TESTED.

## r5 release cleanup and independent acceptance (2026-10-26)

Scope: produce a clean development branch and a teammate ZIP without deleting local history, without touching the formal Scenes, and without uploading debug artifacts.

### Audit categories

- **A. Version-controlled source/resources:** `Assets/Editor/LevelImportExport/*`, `Assets/Scripts/LevelRuntime/*`, `Tools/PhysicsLevelEditor/{src,tests,native,tools}`, `package.json` + lockfile, `Levels/` + `SourceMaps/` + V3 drafts, `README.md`, `PLAYTEST_GUIDE.md`, `WORKLOG.md`, `.gitignore`.
- **B. Required in the Windows package:** Electron runtime (including `locales/`, Paks, `dxcompiler.dll` etc.), `PhysicsLevelEditor.exe`, `resources/app/dist*`, bundled `Levels` data, the five runtime npm packages (`ajv`, `ajv-formats`, `fast-deep-equal`, `fast-uri`, `json-schema-traverse`), `game-runner/` with `PhysicsLevelPlaytest.exe`, `PhysicsLevelPlaytest_Data/`, `UnityPlayer.dll`, `MonoBleedingEdge/`, `D3D12/`, `PlaytestHost.exe`, `runner-manifest.json`, `README.txt`, `PLAYTEST_GUIDE.md`.
- **C. Local-only history:** `release/` (old beta/r2/r3/r4/r5 folders and ZIPs), `%TEMP%` verification scripts/screenshots, `runner-staging/` junction, `native/bin/`, `.pyc`, user-data work copies/sessions.
- **D. Generated caches:** `node_modules/`, `dist/`, `dist-electron/`, Unity `Library/`, `Temp/`, `Logs/`, `Obj/`, `Builds/`.

### Repository changes

- Removed the remaining hardcoded user paths from the three Unity editor scripts (`PhysicsLevelPlaytestBuild.cs`, `PhysicsLevelV2Tests.cs`, `PhysicsLevelV3ThermalRebuild.cs`). Isolation is still proven by the marker file plus the separate `MiniGame Team Phase4A Test` / `Physics Level Editor Phase4A Isolated` Company/Product. Optional exact-path checks moved to `PLE_ISOLATED_PROJECT`, `PLE_DEV_PROJECT`, `PLE_FORMAL_PROJECT`.
- `package-portable.mjs`: release name is configurable via `PLE_RELEASE_NAME`; the packaged `README.txt` is now the concise Chinese teammate guide; `PLAYTEST_GUIDE.md` is copied and verified in the ZIP; ZIP size and SHA-256 are printed on success.
- `compile-playtest-static.py`: skip compiling a second `LevelEditorPlaytestBootstrap` when the isolated `Assembly-CSharp.dll` already contains it (fixes CS0433); prints `PLE_CSHARP_STATIC_COMPILE_PASS; Unity build/Player behavior NOT_RUN`.
- `main.ts`: added dev-only `--release-acceptance` (three rooms + two edit/save/playtest/stop cycles). Fixed it to switch through 三关总览 between rooms, wait for 71/64/72 rows, retry an edit that a late playtest readback re-render overwrote, and exit with `app.exit(ok?0:1)` instead of relying on `process.exitCode` + `app.quit()`.
- `.gitignore` already excludes `release/`, `node_modules/`, `dist/`, `dist-electron/`, `runner-staging/`, `native/bin/`, Python caches. `release/` remains local; no ZIP is committed.

### Clean artifact

- `release/PhysicsLevelEditor-r5-win-x64.zip`
- Size: **490,475,520 bytes (467.8 MiB)**; SHA-256 `24827ecfde91381a9047ffe47fa2d5daed2793e911b13d6971b730bbc5c77ccf`.
- Folder: 469 MB / 826 files; ZIP: 921 entries. Largest items: `PhysicsLevelEditor.exe` 235 MB, `game-runner/` 93 MB, `locales/` 49 MB, `dxcompiler.dll` 25 MB, `LICENSES.chromium.html` 20 MB.
- Contains no `.log`, `.zip`, `.pdb`, `.ps1`, Unity `Library/Temp/Obj/Logs`, editor `src/`/`tests/`, or user-path config. The only `node_modules` content is the five runtime packages (their published `src/`/`test/` files are package internals).
- Size comparison: old playtest r5 ZIP 490,823,680 bytes -> clean r5 ZIP 490,475,520 bytes (**-348,160 bytes**, about -340 KiB). The small reduction comes from the trimmed README/logs and excludes; the real Unity Player and its resources are kept.

### Independent acceptance (outside the source tree)

- Extracted to `%TEMP%\r5-final-verify2-20261026\PhysicsLevelEditor-r5-win-x64`; the source directory, Node.js and Unity Editor were not used.
- `PhysicsLevelEditor.exe --release-acceptance` (with `ELECTRON_RUN_AS_NODE` unset) exited **0** and printed:
  - rooms: room1 71 rows / 38 canvas objects; room2 64 / 33; room3 72 / 41; captions report 34, 29 and 35 real Collider outlines respectively.
  - first cycle: `before=-5`, `after=-4.5`, `applied=true`, `stopped=true`, `persisted=-4.5`, PID 23736.
  - second cycle: `before=-4.5`, `after=-4`, `applied=true`, `stopped=true`, `persisted=-4`, PID 29292.
  - `error=""`.
- Receipts: session `cb836d74...` has `status=applied`, `appliedCount=1`, `Start ground x=-4.5`; session `fffe0ec6...` has `status=applied`, `appliedCount=1`, `x=-4.0`, both bound to source Scene SHA-256 `208caa5e...`.
- Keyboard: the owned Unity window (857x481 at 401,292) received synthetic input (`attached=true`). `kbd-before.png` shows `SCORE 51700 / TOKENS 0`; after holding D, `kbd-after-d.png` shows `SCORE 51800 / TOKENS 1 / 充能 1/3` and the player moved right; after Space, `kbd-after-space.png` shows the player airborne.
- Canvas screenshots: `room-room1.png`, `room-room2.png`, `room-room3.png` show three distinct Collider layouts, not a repeated Room 1.
- Formal Scene SHA-256 after all runs: Level1 `208caa5ee0c2edb7fe3140ece317ccd0156957ad0ae89e2a738a3ccb2d396d34`, Level2 `bbe8f5622425b71c7cb6debb53c592932746b051438c36e35fd667619b8a0e51`, Level3 `b087f4199fb7589ca5b5811b214ccf8988b737ba340fca65d11b864f91cb023c`; `git status` shows no change under `Assets/Scenes`.
- Evidence retained under `release/verification-20261026/run-c-final/` (`acceptance.log`, `rooms.json`, `kbd.json`, PNGs, `userdata/`). The superseded candidate builds are under `superseded-package-abed6d/` and `superseded-package-370509/`. The user's original work copies/sessions were moved out before the runs and restored afterwards from `original-userdata/`.

### Tests

- `npm.cmd run check`: 75 tests, 74 PASS, 1 existing Unity-only SKIP, 0 FAIL.
- `npm.cmd run build`: PASS.
- C# static compile against Unity 6000.6.4f1 assemblies: PASS (syntax/API only; Unity build and Player behavior NOT_RUN).

### Not tested / manual

- Unity Player build, Unity Editor batchmode, and hard-kill crash cleanup are **NOT RUN** in this session.
- Embedded-window behavior on monitors other than the 150% DPI Windows 11 / RTX 5060 setup is **NOT TESTED**.
- Four pre-existing `PhysicsLevelEditor.exe` PIDs (30960/37568/46328/47164, no window/command line) remain from earlier sessions and were not touched.
