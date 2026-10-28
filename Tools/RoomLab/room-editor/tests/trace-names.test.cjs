'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  M = require('../src/project/model.cjs'),
  T = require('../src/project/play-traces.cjs'),
  { Engine } = require('../src/runtime/engine.cjs');
test('per-life custom names save independently and survive later unnamed saves', () => {
  const p = M.example(),
    g = new Engine(p),
    c = p.courses[0],
    r = new T.Recorder(g);
  for (let i = 0; i < 30; i++) {
    g.update(1 / 120, { right: true });
    r.capture(g);
  }
  g.retry();
  r.capture(g);
  for (let i = 0; i < 30; i++) {
    g.update(1 / 120, { right: true });
    r.capture(g);
  }
  T.saveRecording(c, r, { 1: '稳定路线', 2: '实验路线' });
  assert.deepEqual(
    c.rooms[0].playTraces.map((t) => t.name),
    ['稳定路线', '实验路线'],
  );
  const id = c.rooms[0].playTraces[1].id;
  for (let i = 0; i < 30; i++) {
    g.update(1 / 120, { right: true });
    r.capture(g);
  }
  T.saveRecording(c, r, '');
  assert.equal(c.rooms[0].playTraces[1].name, '实验路线');
  assert.equal(c.rooms[0].playTraces[1].id, id);
  assert.equal(T.lifeName(c, r, 2), '实验路线');
});
