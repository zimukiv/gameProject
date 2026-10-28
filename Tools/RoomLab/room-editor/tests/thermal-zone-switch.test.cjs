'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  M = require('../src/project/model.cjs'),
  { Engine } = require('../src/runtime/engine.cjs'),
  T = require('../src/project/temperature.cjs');
function sample() {
  const p = M.example(),
    r = p.courses[0].rooms[1];
  r.aiPolicy = 'off';
  r.objects = r.objects.filter((o) => o.type !== 'common.aiStart');
  return { p, r };
}
test('spatial thermal zone melts and regenerates all covered ice without any ice binding', () => {
  const { p, r } = sample(),
    ice = r.objects.find((o) => o.type === 'physics.ice'),
    pad = r.objects.find((o) => o.type === 'physics.thermal');
  r.environment = 'cold';
  ice.params.respawnDelay = 0.1;
  r.objects.push(
    M.object('outside', 'physics.ice', 15, 10, { meltAfter: 5, respawnDelay: 0.1, friction: 1.4 }),
  );
  const g = new Engine(p, p.courses[0].id, r.id);
  Object.assign(g.player, { x: 18 * 32, y: 10 * 32 });
  g.zoneStates.set('cold-zone', 'cold');
  for (let i = 0; i < 30; i++) g.update(1 / 120);
  assert.equal(g.objectStates.get(ice.id).solid, true);
  const control = g.room.objects.find((o) => o.id === pad.id);
  g.fire(control);
  g.update(1 / 120);
  assert.equal(g.objectStates.get(ice.id).solid, false);
  assert.equal(g.objectStates.get('outside').solid, true);
  g.objectStates.get(pad.id).cooldown = 0;
  g.fire(control);
  for (let i = 0; i < 30; i++) g.update(1 / 120);
  assert.equal(g.objectStates.get(ice.id).solid, true);
  assert.ok(
    r.objects.filter((o) => o.type === 'physics.ice').every((o) => !('zoneId' in o.params)),
  );
});
test('legacy ice references are ignored and removed; changing geometry changes the actual temperature', () => {
  const { p, r } = sample(),
    ice = r.objects.find((o) => o.type === 'physics.ice');
  ice.params.zoneId = 'missing-old-zone';
  const m = M.migrate(p);
  assert.equal(m.courses[0].rooms[1].objects.find((o) => o.id === ice.id).params.zoneId, undefined);
  assert.deepEqual(M.validate(m).errors, []);
  r.environment = 'cold';
  const states = new Map([['cold-zone', 'hot']]);
  assert.equal(T.at(r, ice, states, 'cold'), 'hot');
  ice.x = 25;
  assert.equal(T.at(r, ice, states, 'cold'), 'cold');
});
test('overlapping temperature regions use heat priority independently of region order', () => {
  const { r } = sample(),
    ice = r.objects.find((o) => o.type === 'physics.ice');
  r.zones.push({ ...r.zones[0], id: 'overlap', initial: 'cold' });
  const states = new Map([
    ['cold-zone', 'cold'],
    ['overlap', 'hot'],
  ]);
  assert.equal(T.at(r, ice, states, 'cold'), 'hot');
  r.zones.reverse();
  assert.equal(T.at(r, ice, states, 'cold'), 'hot');
  assert.equal(T.affected(r, 'overlap').length, 8);
});
test('cold regeneration waits for occupied ice space and succeeds when the actor leaves', () => {
  const { p, r } = sample(),
    ice = r.objects.find((o) => o.type === 'physics.ice');
  ice.params.respawnDelay = 0;
  const g = new Engine(p, p.courses[0].id, r.id);
  g.zoneStates.set('cold-zone', 'cold');
  Object.assign(g.player, { x: ice.x * 32 + 2, y: ice.y * 32 + 2, grounded: false });
  g.update(1 / 120);
  assert.equal(g.objectStates.get(ice.id).solid, false);
  Object.assign(g.player, { x: 18 * 32, y: 10 * 32 });
  g.update(1 / 120);
  assert.equal(g.objectStates.get(ice.id).solid, true);
});
