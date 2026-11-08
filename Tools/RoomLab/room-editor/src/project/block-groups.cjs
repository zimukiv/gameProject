'use strict';
const Motion = require('./brick-motion.cjs');
const Native = require('./native-compat.cjs');
const { uid } = require('../shared/utils.cjs');
const kinds = ['tiles', 'objects', 'movables', 'platforms'];
function items(room) {
  return kinds.flatMap((kind) =>
    Native.list(room, kind).map((item, i) => ({
      item,
      ref:
        kind === 'tiles' ? { kind, x: item.x, y: item.y } : { kind, id: Native.identity(item, i) },
    })),
  );
}
function members(room, item) {
  return items(room).filter((v) =>
    item?.assemblyId ? v.item.assemblyId === item.assemblyId : v.item === item,
  );
}
function collisionOwner(room, item, kind) {
  if (!item.assemblyId && !item.brickGroup) return { item, kind };
  const all = item.assemblyId
    ? members(room, item)
    : Motion.groupMembers(room, item).map((item) => ({ item, ref: { kind: 'movables' } }));
  const leader =
    Motion.representative(all.filter((v) => v.ref.kind === 'movables').map((v) => v.item)) ||
    all.find((v) => v.ref.kind === 'platforms')?.item ||
    Motion.representative(all.map((v) => v.item));
  const chosen = all.find((v) => v.item === leader);
  return chosen ? { item: chosen.item, kind: chosen.ref.kind } : { item, kind };
}
function create(room, refs) {
  const all = items(room),
    selected = all.filter(({ ref }) =>
      refs.some(
        (r) =>
          r.kind === ref.kind &&
          (r.kind === 'tiles' ? r.x === ref.x && r.y === ref.y : r.id === ref.id),
      ),
    );
  if (selected.length < 2 || selected.some(({ item }) => item.locked))
    throw Error('请选择至少两个未锁定方块');
  const bricks = selected.filter((v) => v.ref.kind === 'movables').map((v) => v.item);
  const leader =
    Motion.representative(bricks) ||
    selected.find((v) => v.ref.kind === 'platforms')?.item ||
    Motion.representative(selected.map((v) => v.item));
  if (bricks.length && !Motion.applyGroupPath(room, bricks, leader, Motion.nodes(leader)))
    throw Error('组内路径越界');
  const id = uid('assembly');
  for (const { item, ref } of selected) {
    item.assemblyId = id;
    delete item.attachmentTo;
    if (ref.kind === 'movables') {
      item.brickGroup = id;
      item.padId = leader.padId;
    } else if (bricks.length) item.attachmentTo = leader.id;
  }
  return selected.find((v) => v.item === leader).ref;
}
function dissolve(room, item) {
  for (const v of members(room, item)) {
    delete v.item.assemblyId;
    delete v.item.attachmentTo;
    delete v.item.brickGroup;
  }
}
function cleanup(room) {
  const ids = new Set(room.movables.map((b) => b.id));
  for (const { item } of items(room))
    if (item.attachmentTo && !ids.has(item.attachmentTo)) delete item.attachmentTo;
}
module.exports = { kinds, items, members, create, dissolve, cleanup, collisionOwner };
