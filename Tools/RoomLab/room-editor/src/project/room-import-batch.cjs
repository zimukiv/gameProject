'use strict';
const Import = require('./room-import.cjs'),
  M = require('./model.cjs'),
  { uid } = require('../shared/utils.cjs');
const key = (courseId, roomId) => JSON.stringify([courseId, roomId]);
function prepare(target, files, source, incomingFiles, courseId, choices, keepArt = true) {
  const original = target.courses.find((c) => c.id === courseId);
  if (!original || !choices.length) throw new Error('请选择目标大关和至少一个房间');
  const seen = new Set(),
    targets = new Set();
  for (const choice of choices) {
    const id = key(choice.courseId, choice.roomId),
      room = source.courses
        .find((c) => c.id === choice.courseId)
        ?.rooms.find((r) => r.id === choice.roomId);
    if (!room || seen.has(id)) throw new Error('来源房间不存在或重复选择');
    seen.add(id);
    if (choice.mode === 'overwrite') {
      const dest = original.rooms.find((r) => r.id === choice.targetRoomId);
      if (!dest || dest.name !== room.name) throw new Error('请选择同名称的覆盖目标');
      if (targets.has(dest.id)) throw new Error('覆盖目标重复，请为其余房间选择独立导入');
      targets.add(dest.id);
    } else if (choice.mode !== 'independent') throw new Error('房间导入方式无效');
  }
  if (original.rooms.length + choices.length - targets.size > 64)
    throw new Error('导入后房间超过 64 个');
  let project = target,
    output = files,
    droppedConnections = 0;
  const rooms = [],
    maps = new Map();
  for (const choice of choices) {
    const r = Import.prepare(
      project,
      output,
      source,
      incomingFiles,
      courseId,
      choice.courseId,
      choice.roomId,
      keepArt,
      { replaceRoomId: choice.mode === 'overwrite' ? choice.targetRoomId : null },
    );
    project = r.project;
    output = r.files;
    droppedConnections += r.droppedConnections;
    rooms.push({ id: r.roomId, name: r.roomName, mode: choice.mode });
    maps.set(key(choice.courseId, choice.roomId), r);
  }
  const course = project.courses.find((c) => c.id === courseId);
  for (const from of source.courses)
    for (const w of from.connections) {
      if (w.from.roomId === w.to.roomId) continue;
      const a = maps.get(key(from.id, w.from.roomId)),
        b = maps.get(key(from.id, w.to.roomId));
      if (!a || !b) continue;
      const count = course.connections.length;
      course.connections = course.connections.filter(
        (e) => e.from.exitId !== a.idMap[w.from.exitId],
      );
      droppedConnections += count - course.connections.length;
      course.connections.push({
        ...M.clone(w),
        id: uid('wire'),
        from: { roomId: a.roomId, exitId: a.idMap[w.from.exitId] },
        to: { roomId: b.roomId, entryId: b.idMap[w.to.entryId] },
      });
    }
  const errors = M.validate(project).errors;
  if (errors.length) throw new Error(errors[0]);
  return {
    project,
    files: output,
    rooms,
    addedAssets: project.assets.length - target.assets.length,
    droppedConnections,
    overwritten: rooms.filter((r) => r.mode === 'overwrite'),
  };
}
module.exports = { prepare, key };
