'use strict';
// Two-dimensional route nodes for slacker.teacher. Node 0 is always the
// teacher itself; params.path holds nodes I..N walked in order. When no path
// is present the legacy patrolMinX/patrolMaxX/speed behaviour is untouched.
const TeacherLinks = require('./teacher-links.cjs');
const modes = [
  ['linear', '匀速直线'],
  ['smooth', '缓入缓出'],
  ['easeIn', '加速'],
  ['easeOut', '减速'],
];
const loops = [
  ['roundtrip', '往返'],
  ['loop', '循环'],
  ['once', '单次'],
];
const maxNodes = 24;
const nodes = (teacher) =>
  Array.isArray(teacher?.params?.path) ? teacher.params.path : [];
const hasPath = (teacher) => TeacherLinks.isTeacher(teacher) && nodes(teacher).length > 0;
const loopMode = (teacher) =>
  loops.some(([mode]) => mode === teacher?.params?.pathLoop)
    ? teacher.params.pathLoop
    : 'roundtrip';
const inRoom = (node, cols, rows) =>
  node.x >= 0 && node.y >= 0 && node.x < cols && node.y < rows;
function validNode(node) {
  return (
    node &&
    Number.isInteger(node.x) &&
    Number.isInteger(node.y) &&
    Number.isFinite(node.seconds) &&
    node.seconds >= 0.05 &&
    node.seconds <= 60 &&
    modes.some(([mode]) => mode === node.mode)
  );
}
const clone = (node) => ({ x: node.x, y: node.y, seconds: node.seconds, mode: node.mode });
function set(teacher, path) {
  teacher.params ||= {};
  teacher.params.path = path.map(clone);
}
function add(teacher, point) {
  if (nodes(teacher).length >= maxNodes) throw new Error('老师路线最多支持 ' + maxNodes + ' 个节点');
  teacher.params ||= {};
  const path = nodes(teacher).slice();
  path.push({ x: point.x, y: point.y, seconds: 0.6, mode: 'linear' });
  teacher.params.path = path;
  return path.at(-1);
}
function moveNode(teacher, index, point, room, step = 0) {
  const path = teacher.params.path || [],
    node = path[index];
  if (!node) throw new Error('老师路线节点不存在');
  const snap = (v) => (step ? Math.round(v / step) * step : v);
  node.x = snap(point.x);
  node.y = snap(point.y);
  if (!Number.isInteger(node.x) || !Number.isInteger(node.y) || !inRoom(node, room.cols, room.rows))
    throw new Error('路线节点必须在房间内');
  return node;
}
function reorder(teacher, index, direction) {
  const path = teacher.params.path,
    to = index + direction;
  if (!path || index < 0 || to < 0 || to >= path.length) return;
  [path[index], path[to]] = [path[to], path[index]];
}
function remove(teacher, index) {
  if (!teacher.params?.path) return;
  teacher.params.path.splice(index, 1);
}
function apply(teacher, path) {
  if (path.some((node) => !validNode(node))) throw new Error('节点必须整格、用时 0.05 至 60 秒');
  set(teacher, path);
}
// Moving the teacher moves node 0 with it, so the whole route follows.
function moveOwner(teacher, x, y) {
  const dx = x - teacher.x,
    dy = y - teacher.y;
  for (const node of nodes(teacher)) {
    node.x += dx;
    node.y += dy;
  }
  if (nodes(teacher).length === 0) TeacherLinks.move(teacher, dx);
  teacher.x = x;
  teacher.y = y;
}
function points(teacher) {
  return [{ x: teacher.x, y: teacher.y }, ...nodes(teacher).map((n) => ({ x: n.x, y: n.y }))];
}
function duration(teacher) {
  return nodes(teacher).reduce((total, node) => total + node.seconds, 0);
}
const ease = {
  linear: (t) => t,
  smooth: (t) => t * t * (3 - 2 * t),
  easeIn: (t) => t * t,
  easeOut: (t) => 1 - (1 - t) * (1 - t),
};
function at(teacher, time) {
  const path = nodes(teacher),
    pts = points(teacher);
  if (!path.length) return { x: teacher.x, y: teacher.y };
  const total = duration(teacher);
  if (total <= 0) return { x: path.at(-1).x, y: path.at(-1).y };
  const mode = loopMode(teacher);
  let t = Math.max(0, Number(time) || 0);
  if (mode === 'roundtrip') {
    const period = total * 2;
    t %= period;
    if (t > total) t = period - t;
  } else if (mode === 'loop') t %= total;
  else if (t > total) t = total;
  let index = 0,
    remaining = t;
  while (index < path.length - 1 && remaining > path[index].seconds) {
    remaining -= path[index].seconds;
    index++;
  }
  const node = path[index],
    span = node.seconds,
    ratio = span > 0 ? Math.min(1, Math.max(0, remaining / span)) : 1,
    eased = (ease[node.mode] || ease.linear)(ratio),
    from = pts[index],
    to = pts[index + 1];
  return {
    x: from.x + (to.x - from.x) * eased,
    y: from.y + (to.y - from.y) * eased,
  };
}
module.exports = {
  modes,
  loops,
  maxNodes,
  nodes,
  hasPath,
  loopMode,
  validNode,
  inRoom,
  add,
  apply,
  set,
  moveNode,
  reorder,
  remove,
  moveOwner,
  points,
  duration,
  at,
  label: require('./rail-nodes.cjs').label,
};
