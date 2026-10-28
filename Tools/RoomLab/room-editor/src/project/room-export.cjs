'use strict';
const { clone, uid } = require('../shared/utils.cjs');
// A room package is a normal v2 project. IDs inside the room and asset paths remain stable.
function standalone(project, courseId, roomId) {
  const sourceCourse = project.courses.find((c) => c.id === courseId),
    sourceRoom = sourceCourse?.rooms.find((r) => r.id === roomId);
  if (!sourceRoom) throw new Error('请选择一个房间后导出。');
  const result = clone(project),
    course = clone(sourceCourse),
    room = clone(sourceRoom);
  result.id = uid('room-project');
  result.name = sourceRoom.name;
  result.roomExport = {
    sourceProjectId: project.id,
    sourceCourseId: courseId,
    sourceRoomId: roomId,
    externalConnections: clone(
      sourceCourse.connections.filter(
        (w) =>
          (w.from.roomId === roomId || w.to.roomId === roomId) &&
          (w.from.roomId !== roomId || w.to.roomId !== roomId),
      ),
    ),
  };
  course.rooms = [room];
  course.connections = sourceCourse.connections
    .filter((w) => w.from.roomId === roomId && w.to.roomId === roomId)
    .map(clone);
  result.courses = [course];
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
