'use strict';
const Nodes = require('./rail-nodes.cjs');
const kinds = ['tiles', 'objects', 'movables', 'entries', 'exits', 'zones'];
const key = (ref) => ref.kind + ':' + (ref.kind === 'tiles' ? ref.x + ',' + ref.y : ref.id);
const get = (room, ref) =>
  (room[ref.kind] || []).find((o) =>
    ref.kind === 'tiles' ? o.x === ref.x && o.y === ref.y : o.id === ref.id,
  );
function box(room, start, end) {
  const x0 = Math.min(start.x, end.x),
    y0 = Math.min(start.y, end.y),
    x1 = Math.max(start.x, end.x) + 1,
    y1 = Math.max(start.y, end.y) + 1;
  return kinds.flatMap((kind) =>
    room[kind]
      .filter((o) => o.x < x1 && o.y < y1 && o.x + (o.w || 1) > x0 && o.y + (o.h || 1) > y0)
      .map((o) => (kind === 'tiles' ? { kind, x: o.x, y: o.y } : { kind, id: o.id })),
  );
}
function combine(previous, incoming, mode = 'replace') {
  const result = new Map((mode === 'replace' ? [] : previous).map((ref) => [key(ref), ref]));
  for (const ref of incoming) {
    const k = key(ref);
    if (mode === 'invert' && result.has(k)) result.delete(k);
    else result.set(k, ref);
  }
  return [...result.values()];
}
function move(room, refs, dx, dy) {
  const members = refs
      .map((ref) => ({ ref, item: get(room, ref) }))
      .filter((x) => x.item && !x.item.locked),
    selected = new Set(members.filter((x) => x.ref.kind === 'tiles').map((x) => x.item));
  const stationary = new Set(
    room.tiles.filter((t) => !selected.has(t)).map((t) => t.x + ',' + t.y),
  );
  if ([...selected].some((t) => stationary.has(t.x + dx + ',' + (t.y + dy)))) return false;
  for (const { ref, item } of members) {
    if (item.type === 'physics.rail') Nodes.moveOwner(item, item.x + dx, item.y + dy);
    else {
      item.x += dx;
      item.y += dy;
    }
    if (ref.kind === 'tiles') {
      ref.x = item.x;
      ref.y = item.y;
    }
  }
  return true;
}
function remove(course, room, refs) {
  const selected = new Set(refs.map(key)),
    gone = new Set(refs.filter((r) => r.id).map((r) => r.id));
  if (room.entries.every((o) => selected.has(key({ kind: 'entries', id: o.id }))))
    throw new Error('每间房至少保留一个入口。');
  for (const kind of kinds)
    room[kind] = room[kind].filter(
      (o) => !selected.has(key(kind === 'tiles' ? { kind, x: o.x, y: o.y } : { kind, id: o.id })),
    );
  course.connections = course.connections.filter(
    (w) => !gone.has(w.from.exitId) && !gone.has(w.to.entryId),
  );
  for (const b of room.movables) if (gone.has(b.padId)) b.padId = '';
  for (const o of room.objects) {
    if (gone.has(o.params?.unlockPadId)) o.params.unlockPadId = '';
    if (gone.has(o.params?.zoneId)) o.params.zoneId = '';
  }
}
module.exports = { key, get, box, combine, move, remove };
