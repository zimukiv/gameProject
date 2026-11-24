'use strict';
// 统一地图兼容层（阶段 1）。
// 旧存档的 `project.courses` 仍是房间归属 / 规则 / 素材绑定的唯一容器，
// 本模块只在它之上提供“项目级全局视图”：全局房间索引、全局连接与校验。
// 不删除、不改写 course，也不重排 course.connections。
const { clone } = require('../shared/utils.cjs');
const VERSION = 1,
  FIELD = 'map',
  MAX_ROOMS = 12 * 64;
// Optional per-wire metadata (labels, imported annotations, future fields) is
// preserved through sanitize/migrate. Without this a group round trip would keep
// velocity but silently drop every other wire field.
function wireExtra(raw) {
  const out = {};
  for (const [key, value] of Object.entries(raw))
    if (!['id', 'from', 'to', 'velocity', 'source'].includes(key)) out[key] = clone(value);
  return out;
}

function listRooms(project) {
  const rooms = [];
  for (const course of project?.courses || [])
    for (const room of course?.rooms || []) rooms.push({ courseId: course.id, course, room });
  return rooms;
}

function roomRef(project, roomId) {
  for (const entry of listRooms(project)) if (entry.room.id === roomId) return entry;
  return null;
}

function normalizeConnection(raw, defaults = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const from = raw.from || {},
    to = raw.to || {};
  if (!from.roomId || !from.exitId || !to.roomId || !to.entryId) return null;
  return {
    id: String(raw.id || `${from.roomId}:${from.exitId}->${to.roomId}:${to.entryId}`),
    from: { courseId: from.courseId || null, roomId: from.roomId, exitId: from.exitId },
    to: { courseId: to.courseId || null, roomId: to.roomId, entryId: to.entryId },
    velocity: raw.velocity === 'keep' ? 'keep' : 'reset',
    ...wireExtra(raw),
    source: defaults.source || 'course',
    ...defaults.extra,
  };
}

// 合并顺序：项目级显式连接优先（同一起点覆盖旧 course 连接），
// 其余旧 course.connections 原样提供为全局连接，实现“旧数据可运行”。
function connections(project) {
  const out = [],
    seen = new Set();
  const explicit = Array.isArray(project?.map?.connections) ? project.map.connections : [];
  for (const raw of explicit) {
    const edge = normalizeConnection(raw, { source: 'map' });
    if (!edge) continue;
    const key = edge.from.roomId + '/' + edge.from.exitId;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(edge);
  }
  for (const course of project?.courses || []) {
    for (const raw of course?.connections || []) {
      const edge = normalizeConnection(raw, { source: 'course' });
      if (!edge) continue;
      edge.from.courseId ??= course.id;
      const key = edge.from.roomId + '/' + edge.from.exitId;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(edge);
    }
  }
  return out;
}

function resolve(project, roomId, exitId) {
  const from = roomRef(project, roomId);
  if (!from) return null;
  const edge = connections(project).find(
    (w) => w.from.roomId === roomId && w.from.exitId === exitId,
  );
  if (!edge) return null;
  const target = roomRef(project, edge.to.roomId);
  if (!target || !target.room.entries.some((e) => e.id === edge.to.entryId)) return null;
  return {
    ...edge,
    to: { ...edge.to, courseId: target.courseId },
    crossCourse: target.courseId !== from.courseId,
  };
}

function sanitize(map) {
  if (!map || typeof map !== 'object') return undefined;
  const clean = { ...map, version: VERSION, connections: [] },
    seen = new Set();
  for (const raw of Array.isArray(map.connections) ? map.connections : []) {
    const edge = normalizeConnection(raw, { source: 'map' });
    if (!edge || seen.has(edge.id)) continue;
    seen.add(edge.id);
    clean.connections.push(edge);
  }
  return clean;
}

function ensure(project) {
  if (!project.map) project.map = { version: VERSION, connections: [] };
  project.map = sanitize(project.map) || { version: VERSION, connections: [] };
  return project.map;
}

// 显式项目级连接：允许跨原大关；保存前校验房间/端口存在。
function connect(project, from, to, { velocity = 'reset', id } = {}) {
  const source = roomRef(project, from.roomId);
  if (!source) throw new Error('来源房间不存在：' + from.roomId);
  if (!source.room.exits.some((e) => e.id === from.exitId))
    throw new Error('来源出口不存在：' + from.exitId);
  const target = roomRef(project, to.roomId);
  if (!target) throw new Error('目标房间不存在：' + to.roomId);
  if (!target.room.entries.some((e) => e.id === to.entryId))
    throw new Error('目标入口不存在：' + to.entryId);
  const map = ensure(project),
    edge = {
      id: id || `${from.roomId}:${from.exitId}->${to.roomId}:${to.entryId}`,
      from: { courseId: source.courseId, roomId: from.roomId, exitId: from.exitId },
      to: { courseId: target.courseId, roomId: to.roomId, entryId: to.entryId },
      velocity: velocity === 'keep' ? 'keep' : 'reset',
    };
  const at = map.connections.findIndex(
    (w) => w.from.roomId === edge.from.roomId && w.from.exitId === edge.from.exitId,
  );
  if (at >= 0) map.connections[at] = edge;
  else map.connections.push(edge);
  return edge;
}

// Look up one global edge (explicit project edge or legacy course wire) by id.
function find(project, id) {
  for (const edge of connections(project)) if (edge.id === id) return edge;
  return null;
}
// Change the arrival velocity on whichever store owns the edge, so the editor
// never has to know whether a wire is a project-level or a legacy course wire.
function updateVelocity(project, id, velocity) {
  const edge = find(project, id);
  if (!edge) return false;
  const value = velocity === 'keep' ? 'keep' : 'reset';
  for (const raw of project?.map?.connections || []) {
    const normalized = normalizeConnection(raw, { source: 'map' });
    if (normalized && normalized.id === edge.id) {
      raw.velocity = value;
      return true;
    }
  }
  for (const course of project?.courses || [])
    for (const raw of course.connections || [])
      if (raw.id === edge.id) {
        raw.velocity = value;
        return true;
      }
  return false;
}
// Delete a global edge from the owning store. Both stores are cleaned for the
// same origin port: an explicit project edge shadows a legacy course wire there,
// so deleting it must not make the old wire reappear.
function disconnect(project, id) {
  const edge = find(project, id);
  if (!edge) return false;
  let removed = false;
  const origin = edge.from.roomId + '/' + edge.from.exitId;
  if (Array.isArray(project?.map?.connections)) {
    const before = project.map.connections.length;
    project.map.connections = project.map.connections.filter((raw) => {
      const normalized = normalizeConnection(raw, { source: 'map' });
      return !(normalized && normalized.from.roomId + '/' + normalized.from.exitId === origin);
    });
    if (project.map.connections.length !== before) removed = true;
  }
  for (const course of project?.courses || []) {
    if (!Array.isArray(course.connections)) continue;
    const before = course.connections.length;
    course.connections = course.connections.filter(
      (raw) => !(raw.from?.roomId === edge.from.roomId && raw.from?.exitId === edge.from.exitId),
    );
    if (course.connections.length !== before) removed = true;
  }
  return removed;
}
// Remove every wire touching a deleted room, in both the project-level store and
// the legacy course store. Returns how many wires were dropped.
function forgetRoom(project, roomId) {
  let removed = 0;
  if (Array.isArray(project?.map?.connections)) {
    const before = project.map.connections.length;
    project.map.connections = project.map.connections.filter((raw) => {
      const edge = normalizeConnection(raw, { source: 'map' });
      return !(edge && (edge.from.roomId === roomId || edge.to.roomId === roomId));
    });
    removed += before - project.map.connections.length;
  }
  for (const course of project?.courses || []) {
    if (!Array.isArray(course.connections)) continue;
    const before = course.connections.length;
    course.connections = course.connections.filter(
      (raw) => raw.from?.roomId !== roomId && raw.to?.roomId !== roomId,
    );
    removed += before - course.connections.length;
  }
  removed += require('./ai-ports.cjs').forgetRoom(project, roomId);
  return removed;
}
// Every wire touching one of the given port ids, in both stores. Port ids are
// entry/exit object ids; a wire may start at an exit or end at an entry.
function portLinks(project, portIds) {
  const ids = new Set([].concat(portIds || []).filter(Boolean)),
    out = [];
  if (!ids.size) return out;
  const touch = (raw) =>
    (raw?.from?.exitId && ids.has(raw.from.exitId)) ||
    (raw?.to?.entryId && ids.has(raw.to.entryId));
  for (const raw of project?.map?.connections || [])
    if (touch(raw)) out.push({ store: 'map', edge: normalizeConnection(raw, { source: 'map' }) });
  for (const course of project?.courses || [])
    for (const raw of course.connections || [])
      if (touch(raw)) out.push({ store: 'course', courseId: course.id, edge: raw });
  return out;
}
// Unified port deletion: drop every wire attached to the deleted ports from the
// project-level store and every legacy course store. Shadowed legacy wires are
// removed too, so a deleted port can never reappear via the old store.
function forgetPorts(project, portIds) {
  const ids = new Set([].concat(portIds || []).filter(Boolean));
  if (!ids.size) return 0;
  const touch = (raw) =>
    (raw?.from?.exitId && ids.has(raw.from.exitId)) ||
    (raw?.to?.entryId && ids.has(raw.to.entryId));
  let removed = 0;
  if (Array.isArray(project?.map?.connections)) {
    const before = project.map.connections.length;
    project.map.connections = project.map.connections.filter((raw) => !touch(raw));
    removed += before - project.map.connections.length;
  }
  for (const course of project?.courses || []) {
    if (!Array.isArray(course.connections)) continue;
    const before = course.connections.length;
    course.connections = course.connections.filter((raw) => !touch(raw));
    removed += before - course.connections.length;
  }
  // Explicit AI exit/entrance wires and room bindings are cleaned too.
  removed += require('./ai-ports.cjs').forgetPorts(project, [...ids]);
  return removed;
}
const forgetPort = (project, portId) => forgetPorts(project, [portId]);
function validate(project) {
  const errors = [],
    warnings = [],
    ids = new Set();
  if (!project || project.version !== 2 || !Array.isArray(project.courses))
    return { errors: ['项目版本或大关列表无效。'], warnings };
  const refs = listRooms(project);
  if (refs.length > MAX_ROOMS) errors.push('房间总数超过上限。');
  for (const { course, room } of refs) {
    if (ids.has(room.id)) errors.push('房间 ID 重复：' + room.id);
    ids.add(room.id);
    if (!room.entries?.length) errors.push(room.name + ' 没有入口');
  }
  for (const edge of connections(project)) {
    const from = roomRef(project, edge.from.roomId);
    if (!from) {
      errors.push('连接来源房间不存在：' + edge.from.roomId);
      continue;
    }
    if (!from.room.exits.some((e) => e.id === edge.from.exitId))
      errors.push('连接来源出口不存在：' + edge.from.exitId);
    const to = roomRef(project, edge.to.roomId);
    if (!to) {
      errors.push('连接目标房间不存在：' + edge.to.roomId);
      continue;
    }
    if (!to.room.entries.some((e) => e.id === edge.to.entryId))
      errors.push('连接目标入口不存在：' + edge.to.entryId);
    if (to.courseId !== from.courseId) warnings.push('跨原大关连接（兼容运行）：' + edge.id);
  }
  for (const raw of project.map?.connections || [])
    if (!normalizeConnection(raw)) errors.push('项目级连接结构无效。');
  return { errors, warnings };
}

// 成品侧可消费的统一只读快照：房间 + 全局连接，courses 原样保留。
function view(project) {
  return {
    version: VERSION,
    rooms: listRooms(project).map(({ courseId, course, room }) => ({
      id: room.id,
      name: room.name,
      courseId,
      kind: course.kind,
      cols: room.cols,
      rows: room.rows,
    })),
    connections: connections(project),
  };
}

module.exports = {
  VERSION,
  FIELD,
  listRooms,
  roomRef,
  connections,
  resolve,
  sanitize,
  ensure,
  connect,
  find,
  updateVelocity,
  disconnect,
  portLinks,
  forgetPort,
  forgetPorts,
  forgetRoom,
  validate,
  view,
};
