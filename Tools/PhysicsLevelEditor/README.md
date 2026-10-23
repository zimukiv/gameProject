# Physics Level Editor · Phase 2

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
