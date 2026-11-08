'use strict';
const Nodes = require('./rail-nodes.cjs');
const Motion = require('./brick-motion.cjs');
const Native = require('./native-compat.cjs');
const kinds = ['tiles', 'objects', 'movables', 'entries', 'exits', 'zones', ...Native.kinds];
const key = (ref) => ref.kind + ':' + (ref.kind === 'tiles' ? ref.x + ',' + ref.y : ref.id);
const get = (room, ref) =>
  Native.list(room, ref.kind).find((o, i) =>
    ref.kind === 'tiles' ? o.x === ref.x && o.y === ref.y : Native.identity(o, i) === ref.id,
  );
function box(room, start, end) {
  const x0 = Math.min(start.x, end.x),
    y0 = Math.min(start.y, end.y),
    x1 = Math.max(start.x, end.x) + 1,
    y1 = Math.max(start.y, end.y) + 1;
  return kinds.flatMap((kind) =>
    Native.list(room, kind)
      .map((o, i) => ({ o, i, box: Native.rect(kind, o) }))
      .filter(({ box: o }) => o.x < x1 && o.y < y1 && o.x + o.w > x0 && o.y + o.h > y0)
      .map(({ o, i }) =>
        kind === 'tiles' ? { kind, x: o.x, y: o.y } : { kind, id: Native.identity(o, i) },
      ),
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
  const originalTiles = refs
    .filter((ref) => ref.kind === 'tiles')
    .map((ref) => ({ ref, item: get(room, ref) }));
  const Groups = require('./block-groups.cjs');
  refs = combine(
    [],
    refs.flatMap((ref) => {
      const item = get(room, ref);
      return item?.assemblyId ? Groups.members(room, item).map((v) => v.ref) : [ref];
    }),
  );
  if (refs.some((ref) => get(room, ref)?.assemblyId && get(room, ref)?.locked)) return false;
  if (
    refs.some((ref) => {
      const item = get(room, ref);
      return (
        ref.kind === 'movables' &&
        item?.brickGroup &&
        Motion.groupMembers(room, item).some((member) => member.locked)
      );
    })
  )
    return false;
  const members = refs
      .map((ref) => ({ ref, item: get(room, ref) }))
      .filter((x) => x.item && !x.item.locked),
    selected = new Set(members.filter((x) => x.ref.kind === 'tiles').map((x) => x.item));
  const stationary = new Set(
    room.tiles.filter((t) => !selected.has(t)).map((t) => t.x + ',' + t.y),
  );
  if ([...selected].some((t) => stationary.has(t.x + dx + ',' + (t.y + dy)))) return false;
  for (const { ref, item } of members) {
    if (Native.kinds.includes(ref.kind)) Native.move(ref.kind, item, dx, dy);
    else if (item.type === 'physics.rail') Nodes.moveOwner(item, item.x + dx, item.y + dy);
    else if (ref.kind === 'movables') Motion.moveOwner(item, item.x + dx, item.y + dy);
    else {
      item.x += dx;
      item.y += dy;
    }
    if (ref.kind === 'tiles') {
      ref.x = item.x;
      ref.y = item.y;
    }
  }
  for (const { ref, item } of originalTiles)
    if (item) {
      ref.x = item.x;
      ref.y = item.y;
    }
  return true;
}
function remove(course, room, refs) {
  const selected = new Set(refs.map(key)),
    gone = new Set(refs.filter((r) => r.id).map((r) => r.id));
  if (room.entries.every((o) => selected.has(key({ kind: 'entries', id: o.id }))))
    throw new Error('每间房至少保留一个入口。');
  for (const kind of kinds) {
    const values = Native.list(room, kind).filter(
      (o, i) =>
        !selected.has(
          key(kind === 'tiles' ? { kind, x: o.x, y: o.y } : { kind, id: Native.identity(o, i) }),
        ),
    );
    if (Native.kinds.includes(kind)) {
      if (room.nativeCampaign) room.nativeCampaign[kind] = values;
    } else room[kind] = values;
  }
  course.connections = course.connections.filter(
    (w) => !gone.has(w.from.exitId) && !gone.has(w.to.entryId),
  );
  for (const b of room.movables) if (gone.has(b.padId)) b.padId = '';
  require('./block-groups.cjs').cleanup(room);
  for (const o of room.objects) {
    if (gone.has(o.params?.unlockPadId)) o.params.unlockPadId = '';
    if (gone.has(o.params?.zoneId)) o.params.zoneId = '';
  }
}
module.exports = { key, get, box, combine, move, remove };
