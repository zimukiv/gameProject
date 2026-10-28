'use strict';
function timeline(trace) {
  const origin = trace.points.find((p) => Number.isFinite(p.t))?.t || 0;
  let previous = 0,
    offset = 0;
  const points = trace.points.map((p, i) => {
    let raw = Number.isFinite(p.t) ? p.t - origin : i / 60;
    if (raw + offset < previous) {
      offset = previous + 1 / 60 - raw;
    }
    const t = Math.max(0, raw + offset);
    previous = t;
    return { ...p, t };
  });
  return { trace, points, duration: points.at(-1)?.t || 0 };
}
function sample(track, time) {
  const points = track.points;
  if (!points.length) return null;
  const t = Math.max(0, time);
  let lo = 0,
    hi = points.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t <= t) lo = mid + 1;
    else hi = mid;
  }
  const a = points[Math.max(0, lo - 1)],
    b = points[lo];
  if (!b || b.break || b.t <= a.t) return { x: a.x, y: a.y, t, ended: t >= track.duration };
  const f = Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t)));
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, t, ended: false };
}
module.exports = { timeline, sample };
