'use strict';
const Motion = require('./brick-motion.cjs');
const Native = require('./native-compat.cjs');
const NativeBricks = require('./native-bricks.cjs');
const Groups = require('./block-groups.cjs');
const { label } = require('./rail-nodes.cjs');

// Read-only common clock: all selected routes start together, shorter ones hold at the end.
function collect(room, refs) {
  const selected = refs
    .map((ref) => ({
      ref,
      item:
        ref.kind === 'tiles'
          ? room.tiles.find((t) => t.x === ref.x && t.y === ref.y)
          : Native.get(room, ref),
    }))
    .filter((v) => v.item);
  const pads = selected.map((v) => v.item).filter(Motion.isPad);
  const ids = new Set();
  for (const { ref, item } of selected) {
    if (ref.kind === 'movables') {
      for (const b of Motion.groupMembers(room, item)) ids.add(b.id);
    }
    if (item.attachmentTo) ids.add(item.attachmentTo);
    for (const v of Groups.members(room, item)) if (v.ref.kind === 'movables') ids.add(v.item.id);
  }
  return [
    ...room.movables
      .filter((b) => ids.has(b.id) || pads.some((p) => p.id === b.padId))
      .map((b) => ({
        id: b.id,
        item: b,
        path: Motion.nodes(b),
        color: Motion.colorFor(room, b.padId),
      })),
    ...Native.list(room, 'platforms')
      .filter(
        (b, i) =>
          selected.some((v) => v.ref.kind === 'platforms' && v.ref.id === Native.identity(b, i)) ||
          pads.some((p) => NativeBricks.bound(b, p)),
      )
      .map((b, i) => ({
        id: 'native:' + Native.identity(b, i),
        item: b,
        path: [{ x: b.toX ?? b.x, y: b.toY ?? b.y, seconds: b.seconds ?? 0.9, mode: 'linear' }],
        color: '#d4a8ee',
      })),
  ];
}
function stops(routes, reverse = false) {
  const map = new Map([[0, ['起点']]]);
  routes.forEach((route, i) => {
    let t = 0;
    const path = reverse ? route.path.toReversed() : route.path;
    path.forEach((n, j) => {
      t += n.seconds;
      const key = Number(t.toFixed(6));
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(`${i + 1}号砖 · ${label(reverse ? path.length - j - 1 : j + 1)}`);
    });
  });
  return [...map].sort((a, b) => a[0] - b[0]);
}
function sample(route, time, reverse = false) {
  const duration = Motion.duration(route.path),
    elapsed = Math.max(0, Math.min(duration, time));
  return Motion.position(
    { ...route.item, motionPath: route.path },
    reverse ? duration - elapsed : elapsed,
  );
}
module.exports = { collect, stops, sample };
