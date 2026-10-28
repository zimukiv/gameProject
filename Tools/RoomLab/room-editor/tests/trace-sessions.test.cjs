'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  M = require('../src/project/model.cjs'),
  T = require('../src/project/play-traces.cjs'),
  { Engine } = require('../src/runtime/engine.cjs');
test('saving consumes only current unsaved recording; retries become separate records', () => {
  const p = M.example(),
    g = new Engine(p),
    rec = new T.Recorder(g),
    c = p.courses[0];
  for (let i = 0; i < 40; i++) {
    g.update(1 / 120, { right: true });
    rec.capture(g);
  }
  g.retry();
  rec.capture(g);
  for (let i = 0; i < 40; i++) {
    g.update(1 / 120, { right: true });
    rec.capture(g);
  }
  assert.equal(T.saveRecording(c, rec, '试跑'), 2);
  const first = c.rooms[0].playTraces.map((t) => t.id);
  assert.equal(rec.rooms.size, 0);
  assert.equal(T.saveRecording(c, rec, '重复'), 0);
  for (let i = 0; i < 40; i++) {
    g.update(1 / 120, { right: true });
    rec.capture(g);
  }
  assert.equal(T.saveRecording(c, rec, '新段'), 1);
  assert.deepEqual(
    c.rooms[0].playTraces.slice(0, 2).map((t) => t.id),
    first,
  );
  assert.equal(c.rooms[0].playTraces.length, 2);
  assert.deepEqual(
    c.rooms[0].playTraces.map((t) => t.name),
    ['1', '2'],
  );
});
test('record limits reject a save before modifying any room or dropping pending points', () => {
  const p = M.example(),
    g = new Engine(p),
    rec = new T.Recorder(g),
    c = p.courses[0];
  for (let i = 0; i < 40; i++) {
    g.update(1 / 120, { right: true });
    rec.capture(g);
  }
  c.rooms[0].playTraces = Array.from({ length: 32 }, (_, i) =>
    T.create(
      'old' + i,
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      i,
    ),
  );
  const before = rec.get(g.room.id);
  assert.throws(() => T.saveRecording(c, rec, 'over'), /32|上限/);
  assert.deepEqual(rec.get(g.room.id), before);
  assert.equal(c.rooms[0].playTraces.length, 32);
});
