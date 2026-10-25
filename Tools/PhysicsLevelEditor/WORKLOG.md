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
