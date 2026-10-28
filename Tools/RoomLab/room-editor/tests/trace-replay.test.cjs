'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  R = require('../src/project/trace-replay.cjs');
test('trace replay interpolates by recorded time without changing recorded data', () => {
  const p = {
      points: [
        { x: 0, y: 0, t: 10 },
        { x: 100, y: 40, t: 12 },
      ],
    },
    before = JSON.stringify(p),
    r = R.timeline(p);
  assert.equal(r.duration, 2);
  assert.equal(R.sample(r, 1).x, 50);
  assert.equal(R.sample(r, 1).y, 20);
  assert.equal(R.sample(r, 99).x, 100);
  assert.equal(JSON.stringify(p), before);
});
test('replay never interpolates across a death or room discontinuity', () => {
  const r = R.timeline({
    points: [
      { x: 0, y: 0, t: 0 },
      { x: 100, y: 100, t: 1, break: true },
      { x: 200, y: 100, t: 2 },
    ],
  });
  assert.equal(R.sample(r, 0.5).x, 0);
  assert.equal(R.sample(r, 1).x, 100);
  assert.equal(R.sample(r, 1.5).x, 150);
});
test('legacy missing or restarting timestamps replay as finite monotonic tracks', () => {
  for (const points of [
    [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ],
    [
      { x: 0, y: 0, t: 0 },
      { x: 10, y: 10, t: 2 },
      { x: 0, y: 0, t: 0, break: true },
      { x: 10, y: 10, t: 1 },
    ],
  ]) {
    const r = R.timeline({ points });
    assert.ok(r.duration > 0);
    assert.ok(r.points.every((p, i) => Number.isFinite(p.t) && (!i || p.t >= r.points[i - 1].t)));
    assert.ok(Number.isFinite(R.sample(r, r.duration / 2).x));
  }
});
