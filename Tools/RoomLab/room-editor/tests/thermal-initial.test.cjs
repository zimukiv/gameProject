'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  M = require('../src/project/model.cjs'),
  { Engine } = require('../src/runtime/engine.cjs');
test('a cold initial controller initializes its region and ice even if ice is listed first', () => {
  const p = M.example(),
    r = p.courses[0].rooms[1],
    board = r.objects.find((o) => o.type === 'physics.thermal');
  board.params.initialState = 'cold';
  r.objects.sort((a, b) => Number(b.type === 'physics.ice') - Number(a.type === 'physics.ice'));
  const g = new Engine(p, 'physics', 'ice-room');
  assert.equal(g.zoneStates.get('cold-zone'), 'cold');
  assert.equal(g.objectStates.get('ice-5').solid, true);
  assert.equal(g.visualState(g.room.objects.find((o) => o.id === board.id)), 'cold');
  g.zoneStates.set('cold-zone', 'hot');
  g.retry();
  assert.equal(g.zoneStates.get('cold-zone'), 'cold');
});
test('a hot initial controller overrides a cold region before ice creation', () => {
  const p = M.example(),
    r = p.courses[0].rooms[1];
  r.zones[0].initial = 'cold';
  r.objects.find((o) => o.type === 'physics.thermal').params.initialState = 'hot';
  const g = new Engine(p, 'physics', 'ice-room');
  assert.equal(g.zoneStates.get('cold-zone'), 'hot');
  assert.equal(g.objectStates.get('ice-5').solid, false);
});
test('contradictory initial temperatures in one region are explained before play', () => {
  const p = M.example(),
    r = p.courses[0].rooms[1];
  r.objects.find((o) => o.type === 'physics.thermal').params.initialState = 'cold';
  r.objects.push(
    M.object('other-control', 'physics.thermal', 4, 14, {
      zoneId: 'cold-zone',
      initialState: 'hot',
    }),
  );
  assert.ok(M.validate(p, { play: true }).errors.some((e) => e.includes('初始温度')));
});
