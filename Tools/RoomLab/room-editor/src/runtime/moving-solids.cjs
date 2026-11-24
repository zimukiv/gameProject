'use strict';
// Touching faces can differ by a few floating-point ulps after path interpolation.
const overlap = (a, b) =>
  Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1e-7 &&
  Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1e-7;

// Resolve a shallow ordinary contact before declaring a crush. Only small local
// corrections are allowed; never teleport through a wall or through the pusher.
function separate(p, scene, maxDistance = 4.01) {
  const hits = scene.filter((b) => overlap(p, b));
  if (!hits.length) return true;
  const candidates = hits
    .flatMap((b) => [
      { ...p, x: b.x - p.w },
      { ...p, x: b.x + b.w },
      { ...p, y: b.y - p.h },
      { ...p, y: b.y + b.h },
    ])
    .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
  const safe = candidates.find(
    (q) => Math.hypot(q.x - p.x, q.y - p.y) <= maxDistance && !scene.some((b) => overlap(q, b)),
  );
  if (!safe) return false;
  if (safe.x !== p.x) safe.vx = 0;
  if (safe.y !== p.y) safe.vy = 0;
  Object.assign(p, safe);
  return true;
}

// A crush requires opposing faces on an axis where a solid is advancing.
// Riders are pressed only when an obstacle is ahead along actual carry motion.
function squeezed(p, scene, pushes) {
  const eps = 1e-7;
  return pushes.some(({ id, axis, direction, riderFrom }) => {
    const source = scene.find((b) => b.id === id);
    if (!source) return false;
    const end = axis === 'x' ? 'w' : 'h',
      side = axis === 'x' ? 'y' : 'x',
      span = axis === 'x' ? 'h' : 'w';
    const lateral = (b) =>
      Math.min(p[side] + p[span], b[side] + b[span]) - Math.max(p[side], b[side]) > eps;
    const behind =
      riderFrom ||
      (direction > 0
        ? Math.abs(source[axis] + source[end] - p[axis]) <= eps
        : Math.abs(source[axis] - p[axis] - p[end]) <= eps);
    if (!behind || (!riderFrom && !lateral(source))) return false;
    return scene.some(
      (b) =>
        b.id !== id &&
        lateral(b) &&
        overlap(p, b) &&
        (riderFrom
          ? direction > 0
            ? b[axis] >= riderFrom[axis] + riderFrom[end] - eps
            : b[axis] + b[end] <= riderFrom[axis] + eps
          : direction > 0
            ? b[axis] >= p[axis] - eps
            : b[axis] + b[end] <= p[axis] + p[end] + eps),
    );
  });
}

// Sweep the solids as well as the actor: zero actor velocity is still collidable.
// Work on a copy; a blocked push reports crushing without stopping the solid.
function transport(player, before, after, lethal = () => false, hazardMotion = []) {
  const old = new Map(before.map((b) => [b.id, b]));
  const moving = after.filter(
    (b) =>
      b.kind === 'movable' && old.has(b.id) && (b.x !== old.get(b.id).x || b.y !== old.get(b.id).y),
  );
  const movingHazards = hazardMotion.filter(
    (m) => m.before.x !== m.after.x || m.before.y !== m.after.y,
  );
  const restored = after.filter((b) => b.kind === 'movable' && !old.has(b.id));
  if (!moving.length && !movingHazards.length && !restored.length) return true;
  const ids = new Set(moving.map((b) => b.id));
  const steps = Math.max(
    1,
    ...moving.map((b) =>
      Math.ceil(Math.max(Math.abs(b.x - old.get(b.id).x), Math.abs(b.y - old.get(b.id).y)) / 4),
    ),
    ...movingHazards.map(({ before: a, after: b }) =>
      Math.ceil(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) / 4),
    ),
  );
  const p = { ...player };
  // A brick finishing a ghost movement may reappear around the actor. Resolve
  // ordinary contact at the endpoint; disappearance/reappearance is not a push.
  if (restored.some((b) => overlap(p, b))) separate(p, after, Infinity);
  const at = (b, t) => ({
    ...b,
    x: old.get(b.id).x + (b.x - old.get(b.id).x) * t,
    y: old.get(b.id).y + (b.y - old.get(b.id).y) * t,
  });
  for (let i = 1; i <= steps; i++) {
    const scene = after.map((b) => (ids.has(b.id) ? at(b, i / steps) : b));
    const rider = p.grounded && moving.find((b) => b.id === p.support);
    let affected = !!rider;
    const pushes = [];
    if (rider) {
      const riderFrom = { ...p };
      p.x += (rider.x - old.get(rider.id).x) / steps;
      p.y += (rider.y - old.get(rider.id).y) / steps;
      for (const axis of ['x', 'y']) {
        const direction = Math.sign(rider[axis] - old.get(rider.id)[axis]);
        if (direction) pushes.push({ id: rider.id, axis, direction, riderFrom });
      }
    }
    if (lethal(p, i / steps)) return 'hazard';
    for (const b of moving) {
      const prev = at(b, (i - 1) / steps),
        next = at(b, i / steps);
      if (!overlap(p, next)) continue;
      affected = true;
      if (p.y + p.h <= prev.y + 0.001 && next.y < prev.y) {
        p.y = next.y - p.h;
        p.vy = Math.min(0, p.vy);
        p.grounded = true;
        p.support = b.id;
        pushes.push({ id: b.id, axis: 'y', direction: -1 });
      } else if (p.y >= prev.y + prev.h - 0.001 && next.y > prev.y) {
        p.y = next.y + next.h;
        p.vy = Math.max(0, p.vy);
        pushes.push({ id: b.id, axis: 'y', direction: 1 });
      } else if (p.x + p.w <= prev.x + 0.001 && next.x < prev.x) {
        p.x = next.x - p.w;
        p.vx = Math.min(0, p.vx);
        pushes.push({ id: b.id, axis: 'x', direction: -1 });
      } else if (p.x >= prev.x + prev.w - 0.001 && next.x > prev.x) {
        p.x = next.x + next.w;
        p.vx = Math.max(0, p.vx);
        pushes.push({ id: b.id, axis: 'x', direction: 1 });
      } // A shallow pre-existing contact is resolved against the full scene below.
    }
    // Spikes take precedence over crushing, including non-solid hazards crossed mid-step.
    if (lethal(p, i / steps)) return 'hazard';
    if (
      squeezed(
        p,
        scene,
        pushes.filter((v) => v.riderFrom),
      )
    )
      return false;
    if (affected && !separate(p, scene)) {
      if (squeezed(p, scene, pushes)) return false;
      // An unclassified overlap is ordinary contact, not evidence of crushing.
      separate(p, scene, Infinity);
    }
    if (lethal(p, i / steps)) return 'hazard';
  }
  Object.assign(player, p);
  return true;
}
module.exports = { transport };
