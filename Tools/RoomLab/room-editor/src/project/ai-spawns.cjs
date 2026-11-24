'use strict';
// AI spawn points.
//
// A spawn point is a non-solid marker block (`common.aiSpawn`) placed in the room
// toolbar. A launch pad (`common.aiStart`, including the hollow v2 alias
// `common.aiStartHollow`) may reference at most one marker in the SAME room
// through `params.aiSpawnId`. The reference is what makes the activated AI
// appear at the marker instead of beside the player.
//
// The binding is authored data only:
//   * no geometry, collision or AI entrance/exit semantics are rewritten;
//   * a missing, cleared or stale reference keeps the legacy behavior (the AI
//     appears beside the player), so old saves keep working unchanged;
//   * copy/paste and room duplication remap the reference through the existing
//     ID map; deleting the marker clears the reference instead of leaving a
//     dangling id.
const LAUNCHPADS = ['common.aiStart', 'common.aiStartHollow'];
const SPAWN = 'common.aiSpawn';
const KEY = 'aiSpawnId';

function isLaunchpad(object) {
  return !!object && LAUNCHPADS.includes(object.type);
}
function isSpawn(object) {
  return !!object && object.type === SPAWN;
}
function spawns(room) {
  return (room?.objects || []).filter(isSpawn);
}
// The authored reference as a trimmed id string; anything else is "unbound".
function spawnId(launchpad) {
  const value = launchpad?.params?.[KEY];
  return typeof value === 'string' ? value.trim() : '';
}
// Resolve the bound marker, but only when it really is a spawn point in this
// room. Unknown ids and wrong-type objects fall back to null.
function target(room, launchpad) {
  if (!isLaunchpad(launchpad)) return null;
  const id = spawnId(launchpad);
  if (!id) return null;
  const object = (room?.objects || []).find((o) => o.id === id);
  return isSpawn(object) ? object : null;
}
// Write/clear the raw reference. Validation happens in bind() and at runtime;
// this stays the single writer so an explicit clear removes the key.
function set(launchpad, id) {
  if (!isLaunchpad(launchpad)) return false;
  launchpad.params ||= {};
  if (id) launchpad.params[KEY] = String(id);
  else delete launchpad.params[KEY];
  return true;
}
// Bind one marker in the same room, or clear the binding with a falsy id.
function bind(room, launchpad, id) {
  if (!isLaunchpad(launchpad)) return false;
  if (!id) return set(launchpad, '');
  if (!spawns(room).some((o) => o.id === id)) return false;
  return set(launchpad, id);
}
function bindings(room) {
  const out = [];
  for (const launchpad of room?.objects || []) {
    if (!isLaunchpad(launchpad)) continue;
    const spawn = target(room, launchpad);
    if (spawn) out.push({ launchpadId: launchpad.id, spawnId: spawn.id });
  }
  return out;
}
// Rewrite the reference when a room is duplicated. Ids outside the map are kept
// only when the marker still exists; otherwise the reference is cleared.
function remap(room, map) {
  if (!room || !(map instanceof Map)) return;
  const valid = new Set(spawns(room).map((o) => o.id));
  for (const launchpad of room.objects || []) {
    if (!isLaunchpad(launchpad)) continue;
    const id = spawnId(launchpad);
    if (!id) continue;
    const next = map.get(id) || id;
    if (valid.has(next)) set(launchpad, next);
    else set(launchpad, '');
  }
}
// Delete cleanup: drop references whose marker no longer exists. Returns the
// number of references that were removed.
function cleanup(room) {
  if (!room) return 0;
  const valid = new Set(spawns(room).map((o) => o.id));
  let removed = 0;
  for (const launchpad of room.objects || []) {
    if (!isLaunchpad(launchpad)) continue;
    const id = spawnId(launchpad);
    if (id && !valid.has(id)) {
      set(launchpad, '');
      removed++;
    }
  }
  return removed;
}
function sanitize(project) {
  let removed = 0;
  for (const course of project?.courses || [])
    for (const room of course?.rooms || []) removed += cleanup(room);
  return removed;
}
// Stale references are warnings: they never block play, because the runtime
// falls back to the legacy spawn position. A non-string value is an error.
function validate(project) {
  const errors = [],
    warnings = [];
  for (const course of project?.courses || [])
    for (const room of course?.rooms || []) {
      for (const launchpad of room?.objects || []) {
        if (!isLaunchpad(launchpad)) continue;
        const raw = launchpad.params?.[KEY];
        if (raw !== undefined && typeof raw !== 'string')
          errors.push('AI 启动板出现点引用必须是字符串：' + launchpad.id);
        else if (raw && !target(room, launchpad))
          warnings.push('AI 启动板绑定的出现点缺失：' + raw);
      }
    }
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}
module.exports = {
  LAUNCHPADS,
  SPAWN,
  KEY,
  isLaunchpad,
  isSpawn,
  spawns,
  spawnId,
  target,
  set,
  bind,
  bindings,
  remap,
  cleanup,
  sanitize,
  validate,
};
