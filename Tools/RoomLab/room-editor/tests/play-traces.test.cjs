'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  M = require('../src/project/model.cjs'),
  { Engine } = require('../src/runtime/engine.cjs');
test('room copies preserve saved paths with new independent IDs', () => {
  const T = require('../src/project/play-traces.cjs'),
    p = M.example(),
    r = p.courses[0].rooms[0];
  r.playTraces = [
    T.create('A', [
      { x: 10, y: 20, t: 0 },
      { x: 30, y: 40, t: 1 },
    ]),
  ];
  const copy = M.duplicateRoom(p.courses[0], r.id);
  assert.notEqual(copy.playTraces[0].id, r.playTraces[0].id);
  copy.playTraces[0].points[0].x = 99;
  assert.equal(r.playTraces[0].points[0].x, 10);
});
test('project validation rejects malformed saved routes', () => {
  const p = M.example();
  p.courses[0].rooms[0].playTraces = [{ id: 'bad-route', points: [{ x: 'bad', y: 0 }] }];
  assert.ok(M.validate(p).errors.some((e) => e.includes('试玩路径')));
});
test('recorded paths survive retries as separate segments and snapshot independently', () => {
  const T = require('../src/project/play-traces.cjs'),
    g = new Engine(M.example()),
    rec = new T.Recorder(g);
  for (let i = 0; i < 50; i++) {
    g.update(1 / 120, { right: true });
    rec.capture(g);
  }
  const before = rec.get('jet-room');
  assert.ok(before.length > 2);
  g.retry();
  rec.capture(g);
  const after = rec.get('jet-room');
  assert.equal(after.at(-1).break, true);
  assert.equal(before.length + 1, after.length);
  before[0].x = -9;
  assert.notEqual(rec.get('jet-room')[0].x, -9);
});
test('trace files round trip multiple visible paths and reject malformed input', () => {
  const T = require('../src/project/play-traces.cjs'),
    r = M.example().courses[0].rooms[0];
  r.playTraces = [
    T.create(
      'A',
      [
        { x: 10, y: 20, t: 0 },
        { x: 30, y: 40, t: 1 },
      ],
      0,
    ),
    T.create(
      'B',
      [
        { x: 20, y: 30, t: 0 },
        { x: 40, y: 50, t: 1 },
      ],
      1,
    ),
  ];
  r.playTraces[0].visible = false;
  const traces = T.parse(T.serialize(r), r);
  assert.equal(traces.length, 2);
  assert.equal(traces[0].visible, false);
  assert.notEqual(traces[0].id, r.playTraces[0].id);
  assert.notEqual(traces[0].color, traces[1].color);
  assert.throws(() => T.parse('{"format":"wrong"}', r));
  assert.throws(() =>
    T.parse(
      JSON.stringify({
        format: 'room-lab-traces',
        version: 1,
        room: { cols: 30, rows: 17 },
        traces: [{ points: [{ x: 'bad', y: 0 }] }],
      }),
      r,
    ),
  );
});
