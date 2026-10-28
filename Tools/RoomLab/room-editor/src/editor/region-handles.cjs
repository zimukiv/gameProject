'use strict';
const { clamp } = require('../shared/utils.cjs');
function corners(z) {
  return [
    { id: 'nw', x: z.x, y: z.y, cursor: 'nwse-resize' },
    { id: 'ne', x: z.x + z.w, y: z.y, cursor: 'nesw-resize' },
    { id: 'sw', x: z.x, y: z.y + z.h, cursor: 'nesw-resize' },
    { id: 'se', x: z.x + z.w, y: z.y + z.h, cursor: 'nwse-resize' },
  ];
}
function resize(z, corner, p, room) {
  let left = z.x,
    right = z.x + z.w,
    top = z.y,
    bottom = z.y + z.h;
  if (corner.includes('w')) left = clamp(Math.round(p.x), 0, right - 1);
  else right = clamp(Math.round(p.x), left + 1, room.cols);
  if (corner.includes('n')) top = clamp(Math.round(p.y), 0, bottom - 1);
  else bottom = clamp(Math.round(p.y), top + 1, room.rows);
  return { x: left, y: top, w: right - left, h: bottom - top };
}
module.exports = { corners, resize };
