'use strict';
const { clone } = require('../shared/utils.cjs');
// Explicit repair only: ordinary imports still preserve out-of-bounds authoring data.
function prepare(source, ids) {
  const project = clone(source),
    selected = new Set(ids),
    repairs = [];
  for (const course of project.courses)
    for (const room of course.rooms)
      for (const zone of room.zones) {
        if (!selected.has(zone.id)) continue;
        const before = { x: zone.x, y: zone.y, w: zone.w, h: zone.h };
        const x = Math.max(0, zone.x),
          y = Math.max(0, zone.y);
        const w = Math.min(room.cols, zone.x + zone.w) - x;
        const h = Math.min(room.rows, zone.y + zone.h) - y;
        if (![x, y, w, h].every(Number.isInteger) || w <= 0 || h <= 0)
          throw Error('温控区与房间没有有效交集：' + zone.id);
        if (x === zone.x && y === zone.y && w === zone.w && h === zone.h) continue;
        Object.assign(zone, { x, y, w, h });
        repairs.push({ room: room.name, id: zone.id, before, after: { x, y, w, h } });
      }
  return { project, repairs };
}
module.exports = { prepare };
