'use strict';
// Explicit cross-room AI exit/entrance routing.
//
// Authored data lives in two places and never rewrites scene geometry:
//   * room.aiExitBindings     one room-local binding table: player exit -> AI exit
//   * project.map.aiConnections  project-wide AI exit -> AI entrance wires
//
// The binding is what turns "player walks towards this exit" into "the active AI
// heads for this AI exit". The project wire is what carries the AI into the
// destination room, but only through an AI entrance that really lives there.
// Legacy same-room portalIn/portalOut pairs (routeId) stay untouched: they are
// only used when nothing explicit is bound.
const { clone } = require('../shared/utils.cjs');
// Keep optional AI-wire metadata through migration/sanitize, exactly like the
// player-wire store does.
function wireExtra(raw) {
  const out = {};
  for (const [key, value] of Object.entries(raw))
    if (!['id', 'from', 'to', 'source'].includes(key)) out[key] = clone(value);
  return out;
}
const EXIT = 'common.portalOut',
  ENTRANCE = 'common.portalIn',
  RANGE = 96,
  BIND_FIELDS = ['aiExitBindings', 'aiExitLinks', 'aiExitMap', 'aiBindings', 'aiPortBindings'],
  WIRE_FIELDS = ['aiConnections', 'aiRoutes', 'aiWires', 'aiPortWires', 'aiLinks'];

function isExit(o) {
  return !!o && o.type === EXIT;
}
function isEntrance(o) {
  return !!o && o.type === ENTRANCE;
}
function listRooms(project) {
  const out = [];
  for (const course of project?.courses || [])
    for (const room of course?.rooms || []) out.push({ courseId: course.id, course, room });
  return out;
}
function roomRef(project, roomId) {
  for (const entry of listRooms(project)) if (entry.room.id === roomId) return entry;
  return null;
}
function objectIn(room, id) {
  return (room?.objects || []).find((o) => o.id === id) || null;
}
function exitIn(room, id) {
  return (room?.exits || []).find((e) => e.id === id) || null;
}

// ---- room bindings ---------------------------------------------------------
// The canonical store is an array of { exitId, aiExitId }. Object maps and the
// historical aliases are accepted so older/hand-authored data keeps working.
function rawBindingList(room) {
  if (!room || typeof room !== 'object') return [];
  let source = null,
    field = null;
  for (const name of BIND_FIELDS)
    if (room[name] !== undefined) {
      field = name;
      source = room[name];
      break;
    }
  if (!source && room.aiPorts?.exits !== undefined) {
    field = 'aiPorts.exits';
    source = room.aiPorts.exits;
  }
  if (!source) return [];
  const out = [];
  if (Array.isArray(source)) {
    for (const item of source) {
      if (!item || typeof item !== 'object') continue;
      const exitId = item.exitId || item.playerExitId || item.from || item.playerPortId || null,
        aiExitId = item.aiExitId || item.portalOutId || item.to || item.objectId || null;
      if (exitId && aiExitId) out.push({ exitId, aiExitId });
    }
  } else if (typeof source === 'object') {
    for (const [key, value] of Object.entries(source)) {
      if (!value) continue;
      const aiExitId =
        typeof value === 'string'
          ? value
          : value.aiExitId || value.portalOutId || value.id || value.to || null;
      if (aiExitId) out.push({ exitId: key, aiExitId });
    }
  }
  return out;
}
function bindings(room) {
  const seen = new Set(),
    out = [];
  for (const item of rawBindingList(room)) {
    const key = item.exitId + '\u0000' + item.aiExitId;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
function bindingFor(room, exitId) {
  const found = bindings(room).find((item) => item.exitId === exitId);
  return found ? found.aiExitId : null;
}
function aiExitFor(room, exitId) {
  const id = bindingFor(room, exitId);
  if (!id) return null;
  const object = objectIn(room, id);
  return isExit(object) ? object : null;
}
function _storage(room) {
  for (const name of BIND_FIELDS)
    if (room[name] !== undefined) return { field: name, value: room[name] };
  return { field: BIND_FIELDS[0], value: undefined };
}
function writeBindings(room, list) {
  if (!room || typeof room !== 'object') return;
  const storage = _storage(room),
    objectShape = storage.value !== undefined && !Array.isArray(storage.value);
  for (const name of BIND_FIELDS) if (name !== storage.field) delete room[name];
  if (room.aiPorts?.exits !== undefined) delete room.aiPorts.exits;
  if (!list.length) {
    delete room[storage.field];
    if (room.aiPorts && !Object.keys(room.aiPorts).length) delete room.aiPorts;
    return;
  }
  if (objectShape) {
    const map = {};
    for (const item of list) map[item.exitId] = item.aiExitId;
    room[storage.field] = map;
  } else room[storage.field] = list.map((item) => ({ exitId: item.exitId, aiExitId: item.aiExitId }));
}
// Bind one AI exit to one player exit. Clears any previous owner of either side
// (an AI exit only ever points at one player exit). Passing a falsy AI exit
// clears the binding, which is how the room property stays clearable.
function bind(room, a, b) {
  if (!room) return false;
  let exitId = a,
    aiExitId = b;
  if (a && typeof a === 'object') {
    exitId = a.exitId || a.playerExitId || null;
    aiExitId = a.aiExitId || a.portalOutId || null;
  }
  // Accept either argument order; scene ids disambiguate hand-written calls.
  if (exitId && !exitIn(room, exitId) && exitIn(room, aiExitId)) {
    const swap = exitId;
    exitId = aiExitId;
    aiExitId = swap;
  }
  if (!exitId) return false;
  if (!aiExitId) return unbind(room, exitId);
  if (!exitIn(room, exitId) || !isExit(objectIn(room, aiExitId))) return false;
  const next = bindings(room).filter(
    (item) => item.exitId !== exitId && item.aiExitId !== aiExitId,
  );
  next.push({ exitId, aiExitId });
  writeBindings(room, next);
  return true;
}
function unbind(room, id) {
  if (!room) return false;
  const before = bindings(room);
  if (!before.length) return false;
  const next = id ? before.filter((item) => item.exitId !== id && item.aiExitId !== id) : [];
  if (next.length === before.length) return false;
  writeBindings(room, next);
  return true;
}
function clearBinding(room, exitId) {
  return unbind(room, exitId);
}
// Drop stale bindings (deleted player exit, deleted/wrong-type AI exit, double
// ownership) without touching valid ones. Returns the surviving bindings.
function sanitizeRoom(room) {
  if (!room) return [];
  const raw = rawBindingList(room),
    exits = new Set((room.exits || []).map((e) => e.id)),
    aiExits = new Set((room.objects || []).filter(isExit).map((o) => o.id)),
    seenExit = new Set(),
    seenAI = new Set(),
    keep = [];
  for (const item of raw) {
    if (!exits.has(item.exitId) || !aiExits.has(item.aiExitId)) continue;
    if (seenExit.has(item.exitId) || seenAI.has(item.aiExitId)) continue;
    seenExit.add(item.exitId);
    seenAI.add(item.aiExitId);
    keep.push(item);
  }
  if (raw.length || bindings(room).length) writeBindings(room, keep);
  return keep;
}
// Remap both sides of every binding when a room is duplicated (object ids are
// rewritten by M.duplicateRoom).
function remapRoom(room, map) {
  if (!room || !(map instanceof Map)) return;
  const next = bindings(room)
    .map((item) => ({
      exitId: map.get(item.exitId) || item.exitId,
      aiExitId: map.get(item.aiExitId) || item.aiExitId,
    }))
    .filter((item) => exitIn(room, item.exitId) && isExit(objectIn(room, item.aiExitId)));
  writeBindings(room, next);
}

// ---- project-level AI wires ------------------------------------------------
function normalizeWire(raw, defaults = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const from = raw.from || {},
    to = raw.to || {},
    aiExitId = from.aiExitId || from.portalOutId || from.exitId || from.portId || null,
    aiEntranceId = to.aiEntranceId || to.portalInId || to.entryId || to.portId || null;
  if (!from.roomId || !aiExitId || !to.roomId || !aiEntranceId) return null;
  return {
    id:
      String(raw.id || '') ||
      `${from.roomId}:${aiExitId}->${to.roomId}:${aiEntranceId}`,
    from: { courseId: from.courseId || null, roomId: from.roomId, aiExitId },
    to: { courseId: to.courseId || null, roomId: to.roomId, aiEntranceId },
    ...wireExtra(raw),
    source: defaults.source || 'map',
  };
}
function stores(project) {
  const out = [];
  if (project?.map && typeof project.map === 'object')
    for (const field of WIRE_FIELDS)
      if (Array.isArray(project.map[field])) out.push({ target: project.map, field });
  for (const field of WIRE_FIELDS)
    if (Array.isArray(project?.[field])) out.push({ target: project, field });
  return out;
}
function rawWires(project) {
  const out = [];
  for (const store of stores(project))
    for (const raw of store.target[store.field]) out.push({ ...store, raw });
  return out;
}
function connections(project) {
  const out = [],
    seen = new Set();
  for (const entry of rawWires(project)) {
    const edge = normalizeWire(entry.raw, { source: 'map' });
    if (!edge) continue;
    const key = edge.from.roomId + '/' + edge.from.aiExitId;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(edge);
  }
  return out;
}
function find(project, id) {
  return connections(project).find((edge) => edge.id === id) || null;
}
function ensureMap(project) {
  if (!project.map || typeof project.map !== 'object')
    project.map = { version: 1, connections: [] };
  return project.map;
}
function connect(project, from, to, { id } = {}) {
  const source = roomRef(project, from?.roomId);
  if (!source) throw new Error('来源房间不存在：' + from?.roomId);
  const aiExitId = from.aiExitId || from.portalOutId || from.exitId,
    sourceObject = objectIn(source.room, aiExitId);
  if (!isExit(sourceObject)) throw new Error('来源 AI 出口不存在：' + aiExitId);
  const target = roomRef(project, to?.roomId);
  if (!target) throw new Error('目标房间不存在：' + to?.roomId);
  const aiEntranceId = to.aiEntranceId || to.portalInId || to.entryId,
    targetObject = objectIn(target.room, aiEntranceId);
  if (!isEntrance(targetObject)) throw new Error('目标 AI 入口不存在：' + aiEntranceId);
  const map = ensureMap(project),
    field = WIRE_FIELDS[0],
    edge = {
      id: id || `${source.room.id}:${aiExitId}->${target.room.id}:${aiEntranceId}`,
      from: { courseId: source.courseId, roomId: source.room.id, aiExitId },
      to: { courseId: target.courseId, roomId: target.room.id, aiEntranceId },
    };
  if (!Array.isArray(map[field])) map[field] = [];
  const at = map[field].findIndex(
    (raw) =>
      raw?.from?.roomId === edge.from.roomId &&
      (raw.from.aiExitId || raw.from.portalOutId || raw.from.exitId) === aiExitId,
  );
  if (at >= 0) map[field][at] = edge;
  else map[field].push(edge);
  return edge;
}
function disconnect(project, id) {
  const edge = find(project, id);
  if (!edge) return false;
  let removed = false;
  const origin = edge.from.roomId + '/' + edge.from.aiExitId;
  for (const store of stores(project)) {
    const before = store.target[store.field].length;
    store.target[store.field] = store.target[store.field].filter((raw) => {
      const normalized = normalizeWire(raw);
      return !(
        normalized &&
        normalized.from.roomId + '/' + normalized.from.aiExitId === origin
      );
    });
    if (store.target[store.field].length !== before) removed = true;
  }
  return removed;
}
function canConnect(project, from, to) {
  const source = roomRef(project, from?.roomId),
    target = roomRef(project, to?.roomId);
  if (!source || !target) return false;
  const aiExitId = from?.aiExitId || from?.portalOutId || from?.exitId,
    aiEntranceId = to?.aiEntranceId || to?.portalInId || to?.entryId;
  return isExit(objectIn(source.room, aiExitId)) && isEntrance(objectIn(target.room, aiEntranceId));
}
// The one AI exit bound to a player exit, resolved through the room's scene.
function redirectExit(room, exitId) {
  const object = aiExitFor(room, exitId);
  return object || null;
}
// Resolve the explicit AI entrance to carry the AI through when the player takes
// a wire from `playerExitId`. Returns null for unrelated exits, inactive AI, or
// when the linked entrance is not in the real destination room.
function carryEntrance(project, room, playerExitId, destinationRoomId) {
  if (!project || !room || !playerExitId || !destinationRoomId) return null;
  const aiExit = aiExitFor(room, playerExitId);
  if (!aiExit) return null;
  const edge = connections(project).find(
    (wire) => wire.from.roomId === room.id && wire.from.aiExitId === aiExit.id,
  );
  if (!edge || edge.to.roomId !== destinationRoomId) return null;
  const target = roomRef(project, destinationRoomId);
  if (!target) return null;
  const entrance = objectIn(target.room, edge.to.aiEntranceId);
  return isEntrance(entrance) ? entrance : null;
}
function forgetPorts(project, portIds) {
  const ids = new Set([].concat(portIds || []).filter(Boolean));
  if (!ids.size) return 0;
  // Deleting a player exit also orphans the AI wire rooted at its bound AI
  // exit, so remove that wire together with the binding.
  const wireIds = new Set(ids);
  for (const { room } of listRooms(project))
    for (const item of bindings(room))
      if (ids.has(item.exitId) && !ids.has(item.aiExitId)) wireIds.add(item.aiExitId);
  let removed = 0;
  for (const store of stores(project)) {
    const before = store.target[store.field].length;
    store.target[store.field] = store.target[store.field].filter((raw) => {
      const edge = normalizeWire(raw);
      return !(
        edge &&
        (wireIds.has(edge.from.aiExitId) || wireIds.has(edge.to.aiEntranceId))
      );
    });
    removed += before - store.target[store.field].length;
  }
  for (const { room } of listRooms(project)) {
    const current = bindings(room),
      next = current.filter(
        (item) => !ids.has(item.exitId) && !ids.has(item.aiExitId),
      );
    if (next.length !== current.length) {
      removed += current.length - next.length;
      writeBindings(room, next);
    }
  }
  return removed;
}
function forgetRoom(project, roomId) {
  if (!roomId) return 0;
  let removed = 0;
  for (const store of stores(project)) {
    const before = store.target[store.field].length;
    store.target[store.field] = store.target[store.field].filter((raw) => {
      const edge = normalizeWire(raw);
      return !(edge && (edge.from.roomId === roomId || edge.to.roomId === roomId));
    });
    removed += before - store.target[store.field].length;
  }
  const ref = roomRef(project, roomId);
  if (ref) {
    const current = bindings(ref.room);
    if (current.length) {
      removed += current.length;
      writeBindings(ref.room, []);
    }
  }
  return removed;
}
// Migrate/save cleanup: keep valid links, drop dangling/duplicated ones.
function sanitize(project) {
  let removed = 0;
  for (const { room } of listRooms(project)) {
    const before = bindings(room).length;
    const after = sanitizeRoom(room).length;
    if (before !== after) removed += before - after;
  }
  for (const store of stores(project)) {
    const value = store.target[store.field],
      seen = new Set(),
      keep = [];
    for (const raw of value) {
      const edge = normalizeWire(raw);
      if (!edge) {
        removed++;
        continue;
      }
      const source = roomRef(project, edge.from.roomId),
        target = roomRef(project, edge.to.roomId);
      if (!source || !target) {
        removed++;
        continue;
      }
      if (!isExit(objectIn(source.room, edge.from.aiExitId)) ||
        !isEntrance(objectIn(target.room, edge.to.aiEntranceId))) {
        removed++;
        continue;
      }
      const key = edge.from.roomId + '/' + edge.from.aiExitId;
      if (seen.has(key)) {
        removed++;
        continue;
      }
      seen.add(key);
      keep.push(edge);
    }
    store.target[store.field] = keep;
  }
  return removed;
}
function validate(project) {
  const errors = [],
    warnings = [];
  for (const { room } of listRooms(project)) {
    const raw = rawBindingList(room);
    for (const item of raw) {
      if (!exitIn(room, item.exitId))
        warnings.push('AI 出口绑定的玩家出口缺失：' + item.exitId);
      else if (!isExit(objectIn(room, item.aiExitId)))
        warnings.push('AI 出口绑定对象缺失：' + item.aiExitId);
    }
  }
  for (const entry of rawWires(project)) {
    const edge = normalizeWire(entry.raw);
    if (!edge) {
      errors.push('AI 端口连接结构无效。');
      continue;
    }
    const source = roomRef(project, edge.from.roomId);
    if (!source) {
      errors.push('AI 连接来源房间不存在：' + edge.from.roomId);
      continue;
    }
    if (!isExit(objectIn(source.room, edge.from.aiExitId)))
      errors.push('AI 连接来源出口不存在：' + edge.from.aiExitId);
    const target = roomRef(project, edge.to.roomId);
    if (!target) {
      errors.push('AI 连接目标房间不存在：' + edge.to.roomId);
      continue;
    }
    if (!isEntrance(objectIn(target.room, edge.to.aiEntranceId)))
      errors.push('AI 连接目标入口不存在：' + edge.to.aiEntranceId);
  }
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}
module.exports = {
  EXIT,
  ENTRANCE,
  RANGE,
  isExit,
  isEntrance,
  listRooms,
  roomRef,
  bindings,
  bindingFor,
  aiExitFor,
  bind,
  bindExit: bind,
  bindAIExit: bind,
  setBinding: bind,
  unbind,
  unbindExit: unbind,
  unbindAIExit: unbind,
  clearBinding,
  sanitizeRoom,
  remapRoom,
  normalizeWire,
  stores,
  rawWires,
  connections,
  aiConnections: connections,
  wires: connections,
  find,
  connect,
  link: connect,
  disconnect,
  unlink: disconnect,
  canConnect,
  redirectExit,
  targetExit: redirectExit,
  carryEntrance,
  entranceFor: carryEntrance,
  routeFor: carryEntrance,
  forgetPorts,
  forgetRoom,
  sanitize,
  validate,
};
