'use strict';
const { uid, clamp } = require('../shared/utils.cjs');
function ensure(owner, { newIds = false } = {}) {
  if (owner.type !== 'physics.rail' || !Array.isArray(owner.params?.path)) return owner;
  for (const node of owner.params.path) {
    if (newIds || !node.id) node.id = uid('rail-node');
    node.parentId = owner.id;
  }
  return owner;
}
function normalize(project) {
  for (const c of project.courses || [])
    for (const r of c.rooms || []) for (const o of r.objects || []) ensure(o);
  return project;
}
function moveOwner(owner, x, y) {
  const dx = x - owner.x,
    dy = y - owner.y;
  ensure(owner);
  for (const n of owner.params?.path || []) {
    n.x += dx;
    n.y += dy;
  }
  owner.x = x;
  owner.y = y;
}
function add(owner, p) {
  ensure(owner);
  owner.params.path = owner.params.path || [];
  if (owner.params.path.length >= 64) throw new Error('轨道最多支持 64 个节点');
  const node = { id: uid('rail-node'), parentId: owner.id, x: p.x, y: p.y };
  owner.params.path.push(node);
  return node;
}
function move(owner, id, p, room, step = 0) {
  const n = owner.params.path.find((n) => n.id === id);
  if (!n) throw new Error('节点不存在');
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new Error('节点坐标必须是有效数字');
  const snap = (n) => (step ? Math.round(n / step) * step : n);
  n.x = Number(clamp(snap(p.x), 0, room.cols).toFixed(4));
  n.y = Number(clamp(snap(p.y), 0, room.rows).toFixed(4));
  return n;
}
function reorder(owner, id, direction) {
  const path = owner.params.path,
    i = path.findIndex((n) => n.id === id),
    j = i + direction;
  if (i < 0 || j < 0 || j >= path.length) return;
  [path[i], path[j]] = [path[j], path[i]];
}
function remove(owner, id) {
  owner.params.path = owner.params.path.filter((n) => n.id !== id);
}
function roman(value) {
  let result = '';
  for (const [n, label] of [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ])
    while (value >= n) {
      result += label;
      value -= n;
    }
  return result;
}
module.exports = { ensure, normalize, moveOwner, add, move, reorder, remove, roman };
