'use strict';
const Import = require('./room-import.cjs'),
  M = require('./model.cjs'),
  { uid } = require('../shared/utils.cjs');
const key = (courseId, roomId) => JSON.stringify([courseId, roomId]);
function prepare(
  target,
  files,
  source,
  incomingFiles,
  courseId,
  choices,
  keepArt = true,
  nativeOptions = {},
) {
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
  const Native = require('./native-compat.cjs'),
    signalMaps = new Map();
  if (Native.enabled(source))
    for (const choice of choices) {
      if (signalMaps.has(choice.courseId)) continue;
      const from = source.courses.find((c) => c.id === choice.courseId),
        map = {};
      const occupied = new Set([
        ...(original.nativeCampaign?.signals || []),
        ...[...signalMaps.values()].flatMap(Object.values),
      ]);
      for (const n of from.nativeCampaign?.signals || []) {
        let next = n,
          i = 2;
        if (occupied.has(n) && !['reuse', 'independent'].includes(nativeOptions.signalMode))
          throw Error('存在同名跨房信号，请选择复用或独立导入');
        if (nativeOptions.signalMode === 'independent')
          while (occupied.has(next)) next = n.slice(0, 38) + '-导入' + i++;
        map[n] = next;
        occupied.add(next);
      }
      signalMaps.set(choice.courseId, map);
    }
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
      {
        ...nativeOptions,
        signalMap: signalMaps.get(choice.courseId),
        replaceRoomId: choice.mode === 'overwrite' ? choice.targetRoomId : null,
      },
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
    compatibilityWarnings: Native.enabled(source)
      ? [
          ...(Native.active(project,course)?Native.dependencyWarnings(course):[]),
          ...source.courses.flatMap((c) =>
            c.connections
              .filter(
                (w) => seen.has(key(c.id, w.from.roomId)) !== seen.has(key(c.id, w.to.roomId)),
              )
              .map(() => '部分跨房连接的另一端未导入，需重新接线'),
          ),
        ].filter((v, i, a) => a.indexOf(v) === i)
      : [],
    adoptedNative: !Native.enabled(target) && Native.enabled(project),
  };
}
module.exports = { prepare, key };
