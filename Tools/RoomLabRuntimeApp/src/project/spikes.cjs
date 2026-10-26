'use strict';
// The flat edge rests on the backing wall; direction names the outward-facing dome.
// Keep the lethal dome 3px inside it so grazing the artwork is forgiving.
function geometry(rect, direction = 'up') {
  const radius = Math.max(0, Math.min(rect.w, rect.h) / 2 - 2);
  const poses = {
    up: [rect.x + rect.w / 2, rect.y + rect.h, 0],
    down: [rect.x + rect.w / 2, rect.y, Math.PI],
    right: [rect.x, rect.y + rect.h / 2, Math.PI / 2],
    left: [rect.x + rect.w, rect.y + rect.h / 2, -Math.PI / 2],
  };
  const [x, y, angle] = poses[direction] || poses.up;
  return { x, y, angle, radius, hitRadius: Math.max(0, radius - 3) };
}
function touches(player, rect, direction = 'up') {
  const { x, y, hitRadius: r } = geometry(rect, direction);
  let minX = player.x, maxX = player.x + player.w, minY = player.y, maxY = player.y + player.h;
  if (direction === 'down') minY = Math.max(minY, y);
  else if (direction === 'right') minX = Math.max(minX, x);
  else if (direction === 'left') maxX = Math.min(maxX, x);
  else maxY = Math.min(maxY, y);
  if (!r || minX >= maxX || minY >= maxY) return false;
  // Closest point after clipping the player rectangle to the dome's half-plane.
  const nearX = Math.max(minX, Math.min(x, maxX));
  const nearY = Math.max(minY, Math.min(y, maxY));
  return (nearX - x) ** 2 + (nearY - y) ** 2 < r * r;
}
module.exports = { geometry, touches };
