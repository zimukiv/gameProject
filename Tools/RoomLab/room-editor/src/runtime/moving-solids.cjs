'use strict';
const { overlap } = require('../shared/utils.cjs');

// Sweep the solids as well as the actor: zero actor velocity is still collidable.
// Work on a copy; a blocked push reports crushing without stopping the solid.
function transport(player, before, after, lethal = () => false) {
  const old = new Map(before.map((b) => [b.id, b]));
  const moving = after.filter(
    (b) =>
      b.kind === 'movable' && old.has(b.id) && (b.x !== old.get(b.id).x || b.y !== old.get(b.id).y),
  );
  if (!moving.length) return true;
  const ids = new Set(moving.map((b) => b.id));
  const steps = Math.max(
    1,
    ...moving.map((b) =>
      Math.ceil(Math.max(Math.abs(b.x - old.get(b.id).x), Math.abs(b.y - old.get(b.id).y)) / 4),
    ),
  );
  const p = { ...player };
  const at = (b, t) => ({
    ...b,
    x: old.get(b.id).x + (b.x - old.get(b.id).x) * t,
    y: old.get(b.id).y + (b.y - old.get(b.id).y) * t,
  });
  for (let i = 1; i <= steps; i++) {
    const scene = after.map((b) => (ids.has(b.id) ? at(b, i / steps) : b));
    const rider = p.grounded && moving.find((b) => b.id === p.support);
    if (rider) {
      p.x += (rider.x - old.get(rider.id).x) / steps;
      p.y += (rider.y - old.get(rider.id).y) / steps;
    }
    if (lethal(p)) return 'hazard';
    for (const b of moving) {
      const prev = at(b, (i - 1) / steps),
        next = at(b, i / steps);
      if (!overlap(p, next)) continue;
      if (p.y + p.h <= prev.y + 0.001 && next.y < prev.y) {
        p.y = next.y - p.h;
        p.vy = Math.min(0, p.vy);
        p.grounded = true;
        p.support = b.id;
      } else if (p.y >= prev.y + prev.h - 0.001 && next.y > prev.y) {
        p.y = next.y + next.h;
        p.vy = Math.max(0, p.vy);
      } else if (p.x + p.w <= prev.x + 0.001 && next.x < prev.x) {
        p.x = next.x - p.w;
        p.vx = Math.min(0, p.vx);
      } else if (p.x >= prev.x + prev.w - 0.001 && next.x > prev.x) {
        p.x = next.x + next.w;
        p.vx = Math.max(0, p.vx);
      } else return false;
    }
    // Spikes take precedence over crushing, including non-solid hazards crossed mid-step.
    if (lethal(p)) return 'hazard';
    // The actor cannot stop a moving solid: no free space means crushing.
    if (scene.some((b) => overlap(p, b))) return false;
  }
  Object.assign(player, p);
  return true;
}
module.exports = { transport };
