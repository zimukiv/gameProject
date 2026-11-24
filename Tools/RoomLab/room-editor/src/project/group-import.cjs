'use strict';
// Import a group package produced by group-export.cjs.
//
// The single-room importer owns all content remapping (room/object/asset IDs,
// room-local bindings, rail nodes, traces...). Group import reuses it once per
// member room, then rebuilds the group-level stores the importer cannot know
// about: cross-course player wires, explicit AI wires, the group itself, and the
// relative route-map placement of the imported rooms.
const Import = require('./room-import.cjs'),
  M = require('./model.cjs'),
  Org = require('./room-organization.cjs'),
  MapCompat = require('./map-compat.cjs'),
  AIPorts = require('./ai-ports.cjs'),
  GroupExport = require('./group-export.cjs'),
  Native = require('./native-compat.cjs'),
  { clone, uid } = require('../shared/utils.cjs');
function indexOf(project) {
  const map = new Map();
  for (const course of project?.courses || [])
    for (const room of course.rooms || []) map.set(room.id, { course, room });
  return map;
}
function key(courseId, roomId) {
  return JSON.stringify([courseId, roomId]);
}
// Group manifest first; a plain project package falls back to its project order
// so older hand-made packages still import as one group.
function describe(source) {
  const index = indexOf(source),
    meta = source?.groupExport,
    manifestRooms = Array.isArray(meta?.rooms) ? meta.rooms : [],
    manifestById = new Map(manifestRooms.map((room) => [room.roomId, room]));
  let ordered = Array.isArray(meta?.group?.roomIds) ? meta.group.roomIds.filter((id) => index.has(id)) : [];
  if (!ordered.length) ordered = [...index.keys()];
  const specs = ordered
    .map((roomId) => {
      const found = index.get(roomId);
      if (!found) return null;
      return {
        courseId: found.course.id,
        roomId,
        member: manifestById.get(roomId) || null,
      };
    })
    .filter(Boolean);
  if (!specs.length) throw new Error('分组包中没有可导入的房间。');
  return {
    name:
      (typeof meta?.group?.name === 'string' && meta.group.name.trim()) ||
      source?.name ||
      '导入分组',
    color: typeof meta?.group?.color === 'string' ? meta.group.color : null,
    specs,
  };
}
function signalMaps(source, targetCourse, specs, nativeOptions = {}) {
  const maps = new Map();
  if (!Native.enabled(source)) return maps;
  for (const spec of specs) {
    if (maps.has(spec.courseId)) continue;
    const from = source.courses.find((course) => course.id === spec.courseId),
      map = {},
      occupied = new Set([
        ...(targetCourse.nativeCampaign?.signals || []),
        ...[...maps.values()].flatMap((value) => Object.values(value)),
      ]);
    for (const name of from?.nativeCampaign?.signals || []) {
      let next = name,
        i = 2;
      if (occupied.has(name) && !['reuse', 'independent'].includes(nativeOptions.signalMode))
        throw new Error('存在同名跨房信号，请选择复用或独立导入');
      if (nativeOptions.signalMode === 'independent')
        while (occupied.has(next)) next = name.slice(0, 38) + '-导入' + i++;
      map[name] = next;
      occupied.add(next);
    }
    maps.set(spec.courseId, map);
  }
  return maps;
}
function uniqueGroupName(org, base) {
  const used = new Set(org.groups.map((group) => group.name));
  if (!used.has(base)) return base;
  let index = 2;
  while (used.has(base + '（导入 ' + index + '）')) index++;
  return base + '（导入 ' + index + '）';
}
// Project-level wire stores are cleaned per origin so rebuilding a wire from
// its raw source cannot leave the importer's intermediate wire behind.
function removeOrigin(project, from) {
  if (Array.isArray(project?.map?.connections))
    project.map.connections = project.map.connections.filter(
      (wire) => !(wire?.from?.roomId === from.roomId && wire?.from?.exitId === from.exitId),
    );
  for (const course of project?.courses || []) {
    if (!Array.isArray(course.connections)) continue;
    course.connections = course.connections.filter(
      (wire) => !(wire?.from?.roomId === from.roomId && wire?.from?.exitId === from.exitId),
    );
  }
}
function remapEndpoint(endpoint, imported, roomField, portField, targetCourseId) {
  const roomId = imported.roomId;
  return {
    ...endpoint,
    courseId: targetCourseId,
    roomId,
    [portField]: imported.idMap[endpoint[portField]] || endpoint[portField],
  };
}
function prepare(
  target,
  files,
  source,
  incomingFiles,
  targetCourseId,
  keepArt = true,
  nativeOptions = {},
) {
  const targetCourse = target.courses.find((course) => course.id === targetCourseId);
  if (!targetCourse) throw new Error('请选择目标大关。');
  const info = describe(source),
    sourceIndex = indexOf(source),
    maps = signalMaps(source, targetCourse, info.specs, nativeOptions),
    // Placement uses the target course's authored (local) coordinate space; all
    // imported rooms are added to the right of the rooms that already exist.
    originX = Math.max(
      0,
      ...targetCourse.rooms.map(
        (room) => (Number(room.graph?.x) || 0) + GroupExport.card(room).width,
      ),
    ),
    originY = targetCourse.rooms.length
      ? Math.min(...targetCourse.rooms.map((room) => Number(room.graph?.y) || 0))
      : 0;
  let project = target,
    output = files;
  const importedByRoom = new Map(),
    importedRooms = [];
  for (const spec of info.specs) {
    const from = source.courses.find((course) => course.id === spec.courseId);
    if (!from) continue;
    const result = Import.prepare(
      project,
      output,
      source,
      incomingFiles,
      targetCourseId,
      spec.courseId,
      spec.roomId,
      keepArt,
      {
        ...nativeOptions,
        signalMap: maps.get(spec.courseId),
      },
    );
    project = result.project;
    output = result.files;
    importedByRoom.set(spec.roomId, result);
    importedRooms.push({ spec, result });
  }
  if (!importedRooms.length) throw new Error('分组包中没有可导入的房间。');
  const memberById = new Map(
      info.specs.filter((spec) => spec.member).map((spec) => [spec.roomId, spec.member]),
    ),
    sourceOffsets = GroupExport.offsetsOf(source),
    worldOf = (spec) => {
      const member = memberById.get(spec.roomId);
      if (member && Number.isFinite(member.worldX) && Number.isFinite(member.worldY))
        return { x: member.worldX, y: member.worldY };
      const found = sourceIndex.get(spec.roomId),
        offset = sourceOffsets(spec.courseId);
      return {
        x: (Number(found?.room?.graph?.x) || 0) + offset.x,
        y: (Number(found?.room?.graph?.y) || 0) + offset.y,
      };
    },
    worlds = importedRooms.map(({ spec }) => worldOf(spec)),
    minX = Math.min(...worlds.map((world) => world.x)),
    minY = Math.min(...worlds.map((world) => world.y));
  // Reposition every imported room as one block. The same delta is applied to
  // all members, so relative offsets between courses are preserved exactly.
  for (const [i, { result }] of importedRooms.entries()) {
    const owner = MapCompat.roomRef(project, result.roomId);
    if (!owner) continue;
    owner.room.graph = {
      x: originX + (worlds[i].x - minX),
      y: originY + (worlds[i].y - minY),
    };
  }
  // Rebuild group-level player wiring from the raw source store so velocity and
  // any future wire metadata survive (normalisation would drop extra fields).
  const sourceWires = GroupExport.playerWires(source, sourceIndex),
    targetCourseNow = project.courses.find((course) => course.id === targetCourseId);
  for (const entry of sourceWires) {
    const from = importedByRoom.get(entry.wire.from.roomId),
      to = importedByRoom.get(entry.wire.to.roomId);
    if (!from || !to) continue;
    const wire = clone(entry.wire);
    wire.id = uid('wire');
    wire.from = remapEndpoint(wire.from, from, 'roomId', 'exitId', targetCourseId);
    wire.to = remapEndpoint(wire.to, to, 'roomId', 'entryId', targetCourseId);
    if (!from.idMap[entry.wire.from.exitId] || !to.idMap[entry.wire.to.entryId]) continue;
    removeOrigin(project, wire.from);
    const crossCourse = entry.store === 'map' || entry.wire.from.courseId !== entry.wire.to.courseId;
    if (crossCourse) {
      project.map = project.map || { version: MapCompat.VERSION, connections: [] };
      if (!Array.isArray(project.map.connections)) project.map.connections = [];
      project.map.connections.push(wire);
    } else {
      targetCourseNow.connections.push(wire);
    }
  }
  // Explicit AI wires use their own project store and their own endpoint fields.
  const aiField = 'aiConnections';
  for (const wire of GroupExport.aiWires(source, sourceIndex)) {
    const from = importedByRoom.get(wire.from.roomId),
      to = importedByRoom.get(wire.to.roomId);
    if (!from || !to) continue;
    const remapped = {
      ...clone(wire),
      id: uid('ai-wire'),
      from: remapEndpoint(wire.from, from, 'roomId', 'aiExitId', targetCourseId),
      to: remapEndpoint(wire.to, to, 'roomId', 'aiEntranceId', targetCourseId),
    };
    if (!from.idMap[wire.from.aiExitId] || !to.idMap[wire.to.aiEntranceId]) continue;
    project.map = project.map || { version: 1, connections: [] };
    if (!Array.isArray(project.map[aiField])) project.map[aiField] = [];
    project.map[aiField].push(remapped);
  }
  // The group itself is recreated with the manifest's member order and colour.
  const orderedIds = importedRooms.map(({ result }) => result.roomId),
    baseOrg = Org.ensure(project),
    nextOrg = Org.createGroup(baseOrg, uniqueGroupName(baseOrg, info.name), orderedIds),
    created = nextOrg.groups[nextOrg.groups.length - 1];
  project.roomOrganization = created
    ? info.color
      ? Org.setGroupColor(nextOrg, created.id, info.color)
      : nextOrg
    : baseOrg;
  const errors = M.validate(project).errors;
  if (errors.length) throw new Error(errors[0]);
  return {
    project,
    files: output,
    rooms: importedRooms.map(({ spec, result }) => ({
      id: result.roomId,
      name: result.roomName,
      mode: 'independent',
      sourceRoomId: spec.roomId,
    })),
    groupId: created?.id || null,
    groupName: created?.name || info.name,
    addedAssets: project.assets.length - target.assets.length,
    droppedConnections: 0,
    boundaryConnections: Array.isArray(source.groupExport?.boundaryConnections)
      ? source.groupExport.boundaryConnections.length
      : 0,
    boundaryAI: Array.isArray(source.groupExport?.boundaryAI)
      ? source.groupExport.boundaryAI.length
      : 0,
    compatibilityWarnings: [],
  };
}
module.exports = { prepare, describe, key };
