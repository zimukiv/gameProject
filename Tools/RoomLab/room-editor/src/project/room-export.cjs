'use strict';
const { clone, uid } = require('../shared/utils.cjs');
const MapCompat = require('./map-compat.cjs');
// A room package is a normal v2 project. IDs inside the room and asset paths remain stable.
// Connections are read through the unified map layer, so a wire that crosses the
// old course containers is exported (as an external reference) instead of being
// silently dropped.
function standalone(project, courseId, roomId) {
  const sourceCourse = project.courses.find((c) => c.id === courseId),
    sourceRoom = sourceCourse?.rooms.find((r) => r.id === roomId);
  if (!sourceRoom) throw new Error('请选择一个房间后导出。');
  const result = clone(project),
    course = clone(sourceCourse),
    room = clone(sourceRoom);
  const edges = MapCompat.connections(project),
    touches = edges.filter((w) => w.from.roomId === roomId || w.to.roomId === roomId),
    internal = touches.filter((w) => w.from.roomId === roomId && w.to.roomId === roomId),
    external = touches.filter((w) => !(w.from.roomId === roomId && w.to.roomId === roomId));
  result.id = uid('room-project');
  result.name = sourceRoom.name;
  result.roomExport = {
    sourceProjectId: project.id,
    sourceCourseId: courseId,
    sourceRoomId: roomId,
    externalConnections: clone(external),
  };
  course.rooms = [room];
  course.connections = internal.map((w) => ({
    id: w.id,
    from: { roomId: w.from.roomId, exitId: w.from.exitId },
    to: { roomId: w.to.roomId, entryId: w.to.entryId },
    velocity: w.velocity,
  }));
  // Project-level wires are project-wide: the single-room package only keeps the
  // ones that stay inside the exported room.
  result.map = { version: MapCompat.VERSION, connections: clone(internal) };
  result.courses = [course];
  // The exported package has its own coordinate space: project-level course
  // offsets from the source project must not leak into it. Organisation metadata
  // is project-wide, so a single-room package never carries other rooms' group
  // or favourite references either.
  delete result.layout;
  delete result.roomOrganization;
  // Bindings and custom plugin settings may refer to assets at arbitrary nesting depths.
  const ids = new Set();
  function visit(v) {
    if (typeof v === 'string') ids.add(v);
    else if (v && typeof v === 'object') for (const x of Object.values(v)) visit(x);
  }
  const references = { ...result };
  delete references.assets;
  delete references.roomExport;
  visit(references);
  result.assets = result.assets.filter((a) => ids.has(a.id) || ids.has(a.path));
  return result;
}
module.exports = { standalone };
