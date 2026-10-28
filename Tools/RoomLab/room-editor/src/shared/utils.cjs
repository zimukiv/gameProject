'use strict';
const clone = (value) => JSON.parse(JSON.stringify(value));
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const center = (a) => ({ x: a.x + a.w / 2, y: a.y + a.h / 2 });
const uid = (prefix = 'id') =>
  prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
const finite = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
function rotate(x, y, cx, cy, degrees) {
  const a = (degrees * Math.PI) / 180,
    dx = x - cx,
    dy = y - cy;
  return {
    x: cx + dx * Math.cos(a) - dy * Math.sin(a),
    y: cy + dx * Math.sin(a) + dy * Math.cos(a),
  };
}
module.exports = { clone, clamp, overlap, center, uid, finite, rotate };
