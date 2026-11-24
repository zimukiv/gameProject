'use strict';
// A group package is a normal v2 project (so the existing archive/asset
// packaging can be reused) plus a `groupExport` manifest:
//
//   project.groupExport = {
//     version: 1,
//     group: { id, name, color, roomIds: [ordered...] },
//     rooms: [{ courseId, roomId, courseName, roomName, x, y, worldX, worldY }],
//     boundaryConnections: [...],  // metadata only, never attached on import
//     boundaryAI: [...],
//   }
//
// Every wire whose two endpoints live in the group is exported. A wire that
// leaves the group is kept as boundary metadata only, so importing the package
// can never silently attach it to an unrelated room.
const { clone, uid } = require('../shared/utils.cjs');
const M = require('./model.cjs');
const MapCompat = require('./map-compat.cjs');
const AIPorts = require('./ai-ports.cjs');
const Org = require('./room-organization.cjs');
const CELL_SIZE = 10.5,
  LABEL = 16;
function card(room) {
  return {
    width: Math.max(1, Number(room?.cols) || 1) * CELL_SIZE,
    height: LABEL + Math.max(1, Number(room?.rows) || 1) * CELL_SIZE,
  };
}
function offsetsOf(project) {
  const stored = project?.layout?.courseOffsets || {};
  return (courseId) => {
    const value = stored[courseId];
    return Number.isFinite(value?.x) && Number.isFinite(value?.y)
      ? { x: value.x, y: value.y }
      : { x: 0, y: 0 };
  };
}
function roomIndex(project) {
  const index = new Map();
  for (const course of project?.courses || [])
    for (const room of course.rooms || []) index.set(room.id, { course, room });
  return index;
}
function wireEnds(raw) {
  const from = raw?.from,
    to = raw?.to;
  if (!from?.roomId || !from?.exitId || !to?.roomId || !to?.entryId) return null;
  return { from, to };
}
// Raw wires keep their extra metadata (velocity and any future fields). Project
// map wires win over a legacy course wire with the same origin, exactly like the
// unified map layer resolves them.
function playerWires(project, index) {
  const out = [],
    seen = new Set();
  const add = (raw, store, courseId) => {
    const ends = wireEnds(raw);
    if (!ends || !index.has(ends.from.roomId) || !index.has(ends.to.roomId)) return;
    const origin = ends.from.roomId + '/' + ends.from.exitId;
    if (seen.has(origin)) return;
    seen.add(origin);
    const wire = clone(raw);
    wire.from = { ...wire.from };
    wire.to = { ...wire.to };
    wire.from.courseId ||= index.get(ends.from.roomId).course.id;
    wire.to.courseId ||= index.get(ends.to.roomId).course.id;
    out.push({ wire, store, courseId });
  };
  for (const raw of project?.map?.connections || []) add(raw, 'map', null);
  for (const course of project?.courses || [])
    for (const raw of course.connections || []) add(raw, 'course', course.id);
  return out;
}
function aiWires(project, index) {
  const out = [],
    seen = new Set();
  for (const { raw } of AIPorts.rawWires(project)) {
    const edge = AIPorts.normalizeWire(raw);
    if (!edge || !index.has(edge.from.roomId) || !index.has(edge.to.roomId)) continue;
    const key = edge.from.roomId + '/' + edge.from.aiExitId;
    if (seen.has(key)) continue;
    seen.add(key);
    // Raw metadata (custom fields / endpoint extras) is kept, while the
    // normalised endpoint names guarantee a predictable import shape.
    const wire = { ...clone(raw), ...clone(edge) };
    wire.from = { ...clone(raw.from), ...clone(edge.from) };
    wire.to = { ...clone(raw.to), ...clone(edge.to) };
    wire.from.courseId ||= index.get(edge.from.roomId).course.id;
    wire.to.courseId ||= index.get(edge.to.roomId).course.id;
    out.push(wire);
  }
  return out;
}
function standaloneGroup(project, groupId) {
  const org = Org.ensure(project),
    group = Org.groupOf(org, groupId);
  if (!group) throw new Error('请选择一个房间分组后导出。');
  const index = roomIndex(project),
    ordered = group.roomIds.filter((id) => index.has(id));
  if (!ordered.length) throw new Error('该分组还没有房间。');
  const selected = new Set(ordered),
    offsets = offsetsOf(project),
    result = clone(project),
    members = ordered.map((roomId) => {
      const { course, room } = index.get(roomId),
        offset = offsets(course.id),
        x = Number(room.graph?.x) || 0,
        y = Number(room.graph?.y) || 0;
      return {
        courseId: course.id,
        roomId,
        courseName: course.name,
        roomName: room.name,
        x,
        y,
        worldX: x + offset.x,
        worldY: y + offset.y,
      };
    });
  // Source wires are classified before the project is filtered: internal wires
  // stay playable, boundary wires only survive as manifest metadata.
  const player = playerWires(project, index),
    ai = aiWires(project, index),
    internalWires = [],
    boundaryConnections = [],
    internalAI = [],
    boundaryAI = [];
  for (const entry of player) {
    const { wire } = entry;
    if (selected.has(wire.from.roomId) && selected.has(wire.to.roomId))
      internalWires.push({ ...entry, wire });
    else if (selected.has(wire.from.roomId) || selected.has(wire.to.roomId))
      boundaryConnections.push({
        ...entry,
        wire,
        boundary: {
          fromInside: selected.has(wire.from.roomId),
          toInside: selected.has(wire.to.roomId),
        },
      });
  }
  for (const wire of ai) {
    if (selected.has(wire.from.roomId) && selected.has(wire.to.roomId)) internalAI.push(wire);
    else if (selected.has(wire.from.roomId) || selected.has(wire.to.roomId))
      boundaryAI.push({
        wire,
        boundary: {
          fromInside: selected.has(wire.from.roomId),
          toInside: selected.has(wire.to.roomId),
        },
      });
  }
  // Room containers keep only group members. Empty courses are dropped because
  // every exported course must stay valid on its own.
  for (const course of result.courses) {
    course.rooms = course.rooms.filter((room) => selected.has(room.id));
    course.connections = [];
  }
  result.courses = result.courses.filter((course) => course.rooms.length);
  // The package has one canonical player-wire store plus the AI store fields.
  result.map = { ...(result.map || {}), version: MapCompat.VERSION, connections: [] };
  for (const entry of internalWires) result.map.connections.push(clone(entry.wire));
  for (const store of AIPorts.stores(result)) {
    if (!Array.isArray(store.target[store.field])) continue;
    store.target[store.field] = store.target[store.field].filter((raw) => {
      const edge = AIPorts.normalizeWire(raw);
      return (
        edge && selected.has(edge.from.roomId) && selected.has(edge.to.roomId)
      );
    });
  }
  // Project-wide organisation is dropped from the package; the manifest below
  // is the authoritative group order/colour and cannot reference other rooms.
  delete result.roomOrganization;
  result.id = uid('group-project');
  result.name = group.name;
  result.groupExport = {
    version: 1,
    group: {
      id: group.id,
      name: group.name,
      ...(group.color ? { color: group.color } : {}),
      roomIds: ordered.slice(),
    },
    rooms: members,
    boundaryConnections: boundaryConnections.map((entry) => ({
      wire: entry.wire,
      store: entry.store,
      boundary: entry.boundary,
    })),
    boundaryAI: boundaryAI.map((entry) => ({ wire: entry.wire, boundary: entry.boundary })),
  };
  // Keep only assets actually referenced by the exported rooms/courses.
  const ids = new Set();
  function visit(value) {
    if (typeof value === 'string') ids.add(value);
    else if (value && typeof value === 'object') for (const item of Object.values(value)) visit(item);
  }
  const references = { ...result };
  delete references.assets;
  delete references.groupExport;
  visit(references);
  result.assets = result.assets.filter((asset) => ids.has(asset.id) || ids.has(asset.path));
  // Fail here with the same validation the archive will apply, so callers get a
  // stable message before any zip bytes are produced.
  const errors = M.validate(result).errors;
  if (errors.length) throw new Error(errors[0]);
  return result;
}
module.exports = {
  standalone: standaloneGroup,
  standaloneGroup,
  playerWires,
  aiWires,
  offsetsOf,
  card,
};
