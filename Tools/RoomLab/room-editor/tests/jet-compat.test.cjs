'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  M = require('../src/project/model.cjs'),
  R = require('../src/plugins/registry.cjs'),
  { Engine } = require('../src/runtime/engine.cjs');
test('jet v2 direction and force override stale vectors and preserve v1 vector behavior', () => {
  const p = M.example();
  p.pluginManifest['physics.jet'] = '2.0.0';
  const o = p.courses[0].rooms[0].objects.find((o) => o.type === 'physics.jet');
  o.params = {
    direction: 'left',
    force: 1800,
    launchX: 0,
    launchY: -900,
    cooldown: 1,
    affectAI: true,
    range: 3,
  };
  assert.deepEqual(R.validateObject(p, o), []);
  let v = R.params(p, o);
  assert.deepEqual([v.launchX, v.launchY], [-1800, 0]);
  for (const [direction, expected] of [
    ['right', [1800, 0]],
    ['down', [0, 1800]],
    ['up', [0, -1800]],
  ]) {
    o.params.direction = direction;
    v = R.params(p, o);
    assert.deepEqual([v.launchX, v.launchY], expected);
  }
  p.pluginManifest['physics.jet'] = '1.0.0';
  o.params = { launchX: -1234, launchY: 4321 };
  v = R.params(p, o);
  assert.deepEqual([v.launchX, v.launchY], [-1234, 4321]);
  assert.deepEqual(R.validateObject(p, o), []);
});
test('custom plugin numbers may exceed suggested ranges but must remain finite', () => {
  const p = M.example(),
    o = p.courses[0].rooms[2].objects.find((o) => o.type === 'physics.rail');
  o.params.acceleration = 9000;
  o.params.maxSpeed = 6000;
  assert.deepEqual(R.validateObject(p, o), []);
  assert.doesNotThrow(() => new Engine(p));
  o.params.acceleration = Infinity;
  assert.ok(R.validateObject(p, o).some((e) => e.includes('参数无效')));
});
test('imported movement settings and thermal initial alias affect runtime rather than being silently ignored', () => {
  const p = M.example();
  p.settings.performance = { jump: 400 };
  const o = p.courses[0].rooms[1].objects.find((o) => o.type === 'physics.thermal');
  o.params.initial = 'hot';
  delete o.params.initialState;
  const g = new Engine(p, p.courses[0].id, p.courses[0].rooms[1].id);
  assert.equal(g.config.jump, 400);
  assert.equal(g.zoneStates.get(o.params.zoneId), 'hot');
});
