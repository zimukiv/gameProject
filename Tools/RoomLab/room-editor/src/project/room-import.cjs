'use strict';
const M = require('./model.cjs'),
  Registry = require('../plugins/registry.cjs');
const { clone, uid } = require('../shared/utils.cjs');
function prepare(
  target,
  files,
  source,
  incomingFiles,
  courseId,
  sourceCourseId,
  roomId,
  keepArt = true,
  options = {},
) {
  const result = clone(target),
    course = result.courses.find((c) => c.id === courseId),
    from = source.courses.find((c) => c.id === sourceCourseId),
    original = from?.rooms.find((r) => r.id === roomId);
  if (!course || !original) throw new Error('目标大关或导入房间不存在');
  const replaced = options.replaceRoomId
    ? course.rooms.find((r) => r.id === options.replaceRoomId)
    : null;
  if (options.replaceRoomId && !replaced) throw new Error('覆盖目标房间不存在');
  const room = clone(original),
    map = new Map([[room.id, uid('room')]]),
    outputFiles = new Map(files);
  for (const item of [
    ...room.entries,
    ...room.exits,
    ...room.objects,
    ...room.movables,
    ...room.zones,
  ])
    map.set(item.id, uid('object'));
  if (replaced) {
    map.set(original.id, replaced.id);
    for (const kind of ['entries', 'exits']) {
      const used = new Set();
      for (const port of original[kind]) {
        const exact = replaced[kind].find((p) => p.id === port.id),
          named = replaced[kind].filter((p) => p.name && p.name === port.name);
        const match =
          exact ||
          (named.length === 1 && original[kind].filter((p) => p.name === port.name).length === 1
            ? named[0]
            : null);
        if (match && !used.has(match.id)) {
          map.set(port.id, match.id);
          used.add(match.id);
        }
      }
    }
  }
  for (const o of room.objects) {
    o.params = clone(Registry.params(source, o));
    if (o.type === 'physics.rail')
      for (const n of o.params.path || []) if (n.id) map.set(n.id, uid('rail-node'));
  }
  for (const trace of room.playTraces || []) {
    map.set(trace.id, uid('trace'));
    if (trace.sessionId && !map.has(trace.sessionId)) map.set(trace.sessionId, uid('play'));
  }
  if (!room.aiId) room.aiId = from.aiId || null;
  if (keepArt) {
    const art = {};
    for (const type of new Set([
      ...Registry.all().map((d) => d.type),
      ...Object.keys(source.blockDefaults || {}),
      ...Object.keys(from.artBindings || {}),
      ...Object.keys(room.artBindings || {}),
    ])) {
      const binding = room.artBindings?.[type] ?? from.artBindings?.[type];
      art[type] =
        typeof binding === 'string'
          ? binding
          : {
              ...source.blockDefaults?.[type]?.assets,
              ...from.artBindings?.[type],
              ...room.artBindings?.[type],
            };
    }
    room.artBindings = art;
  } else delete room.artBindings;
  const refs = new Set();
  function collect(v) {
    if (typeof v === 'string') refs.add(v);
    else if (v && typeof v === 'object') for (const x of Object.values(v)) collect(x);
  }
  collect(room);
  const sameBytes = (a, b) => a && b && a.length === b.length && a.every((v, i) => v === b[i]);
  for (const a of source.assets.filter((a) => refs.has(a.id) || refs.has(a.path))) {
    const bytes = incomingFiles.get(a.path);
    if (!bytes) throw new Error('房间包缺少素材：' + a.name);
    const existing = result.assets.find(
      (b) =>
        (b.courseId === courseId || b.courseId === 'common') &&
        [
          'mime',
          'width',
          'height',
          'frameWidth',
          'frameHeight',
          'fps',
          'category',
          'subcategory',
        ].every((k) => b[k] === a[k]) &&
        sameBytes(files.get(b.path), bytes),
    );
    if (existing) {
      map.set(a.id, existing.id);
      map.set(a.path, existing.path);
      continue;
    }
    const id = uid('asset'),
      path = 'assets/' + id + '-' + a.path.split('/').at(-1);
    result.assets.push({ ...clone(a), id, path, courseId });
    outputFiles.set(path, new Uint8Array(bytes));
    map.set(a.id, id);
    map.set(a.path, path);
  }
  function remap(v) {
    if (typeof v === 'string') return map.get(v) || v;
    if (Array.isArray(v)) return v.map(remap);
    if (v && typeof v === 'object')
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [map.get(k) || k, remap(x)]));
    return v;
  }
  const imported = remap(room),
    base = original.name || '导入房间';
  let name = base,
    n = 2;
  while (!replaced && course.rooms.some((r) => r.name === name))
    name = base + '（导入 ' + n++ + '）';
  imported.name = name;
  imported.graph = {
    x: Math.max(0, ...course.rooms.map((r) => (r.graph?.x || 0) + Math.max(300, r.cols * 12))) + 60,
    y: 80,
  };
  imported.importSource = { projectId: source.id, courseId: from.id, roomId: original.id };
  let droppedConnections = 0;
  if (replaced) {
    imported.name = replaced.name;
    imported.graph = clone(replaced.graph);
    const count = course.connections.length,
      entries = new Set(imported.entries.map((p) => p.id)),
      exits = new Set(imported.exits.map((p) => p.id));
    course.connections = course.connections.filter(
      (w) =>
        !(w.from.roomId === replaced.id && w.to.roomId === replaced.id) &&
        (w.from.roomId !== replaced.id || exits.has(w.from.exitId)) &&
        (w.to.roomId !== replaced.id || entries.has(w.to.entryId)),
    );
    droppedConnections = count - course.connections.length;
    course.rooms[course.rooms.indexOf(replaced)] = imported;
  } else course.rooms.push(imported);
  for (const wire of from.connections.filter(
    (w) => w.from.roomId === roomId && w.to.roomId === roomId,
  ))
    course.connections.push({ ...remap(wire), id: uid('wire') });
  for (const o of imported.objects)
    if (!result.pluginManifest?.[o.type]) {
      result.pluginManifest = result.pluginManifest || {};
      result.pluginManifest[o.type] =
        source.pluginManifest?.[o.type] || Registry.get(o.type).version;
    }
  const errors = M.validate(result).errors;
  if (errors.length) throw new Error(errors[0]);
  return {
    project: result,
    files: outputFiles,
    roomId: imported.id,
    roomName: name,
    addedAssets: result.assets.length - target.assets.length,
    idMap: Object.fromEntries(map),
    droppedConnections,
  };
}
module.exports = { prepare };
