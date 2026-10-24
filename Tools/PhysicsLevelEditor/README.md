# Physics Level Editor · Phase 2/3

Windows desktop editor for the Phase 1 `LevelDataV1` partial JSON format. It edits real files through Electron. The renderer has no Node.js access; file operations go through a limited preload API.

## Start

From `Tools/PhysicsLevelEditor`:

```powershell
npm.cmd install
npm.cmd run desktop
```

Use **打开 Phase 1 样本** to load `Levels/Physics/Level1.phase1.json`, change the vent `Force` or platform position in Inspector, then **另存为** a new JSON. Close and reopen that file to verify persistence. The sample is marked **PARTIAL COVERAGE** and saving over it requires confirmation.

`npm.cmd run check` runs TypeScript and data tests. `npm.cmd run smoke` starts a hidden real Electron window and checks that the sample renders three objects. On systems where Windows prevents Electron sandbox processes from reading the worktree, this smoke test may fail before application code starts; launch the app from a normal user session for manual verification.

## Editing rules

- Wheel: zoom. Middle/right mouse or Alt drag: pan. Click: select. Shift/Ctrl click: multi-select. Drag background: box select. Drag selected objects: move. A drag is one undo step.
- Ctrl+S: save; Ctrl+Z: undo; Ctrl+Y or Ctrl+Shift+Z: redo; Ctrl+D: duplicate; Delete: delete.
- Grid snap is 0.5 world units. Unity world Y points upward. Transform scale, Sprite identity and Collider size are separate values.
- **分组** sets the first selected root as parent. It supports unrotated root objects and preserves world positions and collider dimensions. Other hierarchy edits use local Transform coordinates.
- Locking is session only. The Phase 1 JSON has no lock field.
- Templates store one or more Phase 1 objects. Instantiation generates new IDs and remaps parent references among copied objects; external references remain external.
- The Phase 1 Unity adapter only supports the registered fixed three-component combinations. The component list cannot be freely expanded yet. Existing Unity Sprite GUIDs can be edited, but picking arbitrary local images or audio cannot create valid Unity references in this format.
- No camera data is present in this partial JSON, so the canvas omits a camera frame. Collider outlines are shown; Sprite display bounds are unavailable without resolving Unity assets.

## Scope

This phase does not load Unity scenes, run Unity physics, package LevelPacks, perform runtime edits, or import PNG/JPG/WAV/OGG into Unity. Validation means Phase 1 data compatibility, not gameplay reachability.

## Phase 3 interaction acceptance

Run `npm.cmd run check` and `npm.cmd run build`. In a normal Windows desktop session, `npm.cmd run desktop` opens the Electron editor. `node_modules/.bin/electron.cmd . --phase3-smoke` exercises a real hidden Electron window: it opens the Phase 1 JSON, selects two objects, checks the Mixed Inspector state, changes their common Active field, and undoes that change. The smoke command prints `PHASE3_ELECTRON_GUI=...`; exit code 0 requires three objects, PARTIAL COVERAGE, Mixed, two changed objects and zero changed objects after Undo.

Manual acceptance with **打开 Phase 1 样本**:

1. Ctrl-click the platform and vent in Hierarchy. Inspector should say **选中 2 个对象**; Layer should show **Mixed**. Set their common Active field, then Undo and Redo. Both objects must change together.
2. Enter a world-coordinate offset ΔX=2, ΔY=1 and apply it. Relative spacing must remain the same. Undo once should restore both positions. Select parent and child together after grouping and drag; the child must move only once.
3. Select one object and drag a Collider corner. `collider.size` and `collider.offset` should change while `localScale` stays fixed. Change snap step in the toolbar and repeat.
4. Collapse and expand Hierarchy children. Toggle the eye and lock controls; hidden objects leave the canvas, and locked objects cannot be dragged or batch edited. These controls are session state and are not written to LevelDataV1.
5. Change the parent in Inspector. A safe change should preserve the world Collider outline; a cycle or transformation requiring shear must display an error and leave the JSON unchanged.
6. Use **另存为** to write a new JSON. Close and reopen that file. Confirm object IDs, transforms, collider fields and `PARTIAL COVERAGE` remain. Do not overwrite `Level1.phase1.json` for this acceptance run.

The Phase 1 format still accepts only three Unity-backed object kinds and fixed component combinations. Unknown components are rejected with a compatibility error without altering the source file. The editor does not derive Sprite bounds from Collider size, and no camera frame is shown because the partial JSON has no camera data.
