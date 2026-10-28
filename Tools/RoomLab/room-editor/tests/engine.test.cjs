'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  M = require('../src/project/model.cjs'),
  { Engine } = require('../src/runtime/engine.cjs');
const step = (g, input = {}, n = 1) => {
  for (let i = 0; i < n; i++)
    g.update(1 / 120, i === 0 ? input : { ...input, jumpPressed: false, dashPressed: false });
};
function walk(g, x) {
  const start = g.room.id,
    deaths = g.deaths;
  for (
    let i = 0;
    i < 2400 && g.mode === 'playing' && g.room.id === start && Math.abs(g.player.x - x) > 3;
    i++
  )
    step(g, { right: g.player.x < x, left: g.player.x > x });
  assert.equal(g.deaths, deaths, JSON.stringify(g.events.slice(-6)));
  if (g.mode !== 'playing' || g.room.id !== start) return;
  assert.ok(Math.abs(g.player.x - x) < 5, `walk ${x}, actual ${g.player.x}`);
}
function cold(g) {
  g.player.x = 138;
  g.player.y = 420;
  g.zoneStates.set('cold-zone', 'cold');
  step(g, {}, 130);
  assert.ok(g.objectStates.get('ice-5').solid);
}
test('physics course connects all three rooms through jet, ice creation and accelerated rail', () => {
  const g = new Engine(M.example(), 'physics');
  walk(g, 890);
  assert.equal(g.room.id, 'ice-room');
  walk(g, 94);
  for (let i = 0; i < 200 && !g.objectStates.get('ice-5').solid; i++) step(g);
  assert.ok(g.objectStates.get('ice-5').solid);
  walk(g, 890);
  assert.equal(g.room.id, 'rail-room');
  assert.equal(g.ai.active, true);
  walk(g, 1090);
  assert.equal(g.mode, 'won');
  assert.equal(g.deaths, 0);
  assert.ok(g.events.some((e) => e.type === 'jet'));
  assert.ok(g.events.some((e) => e.type === 'temperature'));
  assert.ok(g.events.some((e) => e.type === 'rail-end'));
  assert.ok(g.score >= 60000);
});
test('first dash is free, total dash count is three, landing restores one free dash only', () => {
  const g = new Engine(M.example(), 'physics');
  g.player.x = 600;
  g.player.y = 80;
  g.player.grounded = false;
  step(g, { right: true, dashPressed: true });
  assert.equal(g.charges, 3);
  assert.equal(g.player.freeDash, false);
  step(g, { up: true, dashPressed: true });
  step(g, { left: true, dashPressed: true });
  assert.equal(g.charges, 1);
  assert.equal(g.player.dashCount, 3);
  const count = g.events.filter((e) => e.type === 'dash').length;
  step(g, { dashPressed: true });
  assert.equal(g.events.filter((e) => e.type === 'dash').length, count);
  Object.assign(g.player, { x: 40, y: 420, vy: 0, dash: 0, grounded: false });
  step(g);
  assert.equal(g.player.freeDash, true);
  assert.equal(g.player.dashCount, 0);
  assert.equal(g.charges, 1);
  step(g, { right: true, dashPressed: true });
  step(g);
  assert.equal(g.player.freeDash, false, 'standing contact does not refresh per frame');
});
test('dash replaces old momentum and has no gravity until finished', () => {
  const g = new Engine(M.example());
  Object.assign(g.player, { x: 600, y: 80, vy: 700, grounded: false });
  step(g, { right: true, dashPressed: true });
  const y = g.player.y;
  step(g, {}, 20);
  assert.equal(g.player.y, y);
  assert.equal(g.player.vy, 0);
  step(g, {}, 15);
  assert.ok(g.player.vy > 0);
});
test('ice accumulates separate visits and cold regenerates a new zero-timer instance', () => {
  const g = new Engine(M.example(), 'physics', 'ice-room');
  cold(g);
  Object.assign(g.player, { x: 176, y: 420, grounded: false, vy: 0 });
  step(g, {}, 240);
  const elapsed = g.objectStates.get('ice-5').standing;
  assert.ok(elapsed > 1.9 && elapsed < 2.1);
  Object.assign(g.player, { x: 480, y: 420, vx: 0, vy: 0, grounded: false });
  step(g, {}, 120);
  assert.equal(g.objectStates.get('ice-5').standing, elapsed);
  Object.assign(g.player, { x: 176, y: 420, vx: 0, vy: 0, grounded: false });
  step(g, {}, 380);
  assert.equal(g.objectStates.get('ice-5').solid, false);
  assert.ok(g.events.some((e) => e.type === 'ice-melt' && e.reason === 'standing'));
  Object.assign(g.player, { x: 480, y: 420, vy: 0, grounded: false });
  step(g, {}, 150);
  const state = g.objectStates.get('ice-5');
  assert.equal(state.solid, true);
  assert.equal(state.standing, 0);
  assert.ok(state.generation > 0);
});
test('ice material retains sliding velocity instead of instantly stopping', () => {
  const g = new Engine(M.example(), 'physics', 'ice-room');
  cold(g);
  Object.assign(g.player, { x: 176, y: 420, grounded: true, support: 'ice-5', vx: 220, vy: 0 });
  step(g, {}, 20);
  assert.ok(g.player.vx > 80 && g.player.vx < 220);
});
test('AI distance is measured to the device and a player already waiting can trigger it', () => {
  const p = M.example(),
    o = p.courses[0].rooms[0].objects[0];
  o.trigger = { mode: 'foot', requiresAI: true, distance: 2 };
  const g = new Engine(p);
  Object.assign(g.player, { x: 320, y: 420, vy: 0, grounded: false });
  g.simulateAI('jet-a', false);
  step(g, {}, 20);
  assert.equal(g.objectStates.get('jet-a').used, false);
  assert.equal(g.objectStates.get('jet-a').waitingAI, true);
  g.simulateAI('jet-a', true);
  step(g);
  assert.equal(g.objectStates.get('jet-a').used, true);
  assert.equal(g.player.launched, true);
});
test('AI activation and ID persist into another fast room and retry restores entry state', () => {
  const g = new Engine(M.example(), 'physics', 'ice-room');
  g.activateAI(g.room.objects.find((o) => o.id === 'wake-b'));
  assert.equal(g.courseState.aiActive, true);
  g.loadRoom('rail-room', 'rail-room-entry', {
    tokens: 12,
    charges: 2,
    recharge: 3,
    freeDash: false,
    dashCount: 2,
  });
  assert.equal(g.ai.active, true);
  assert.equal(g.ai.id, 'physics-demo-ai');
  g.tokens = 0;
  g.retry();
  assert.equal(g.room.id, 'rail-room');
  assert.equal(g.ai.active, true);
  assert.equal(g.tokens, 12);
  assert.equal(g.charges, 2);
});
test('entering a named port uses its position and face rather than a global spawn', () => {
  const p = M.example(),
    r = p.courses[0].rooms[0];
  r.entries.push({ id: 'alternate', name: '右侧入口', x: 20, y: 7, face: -1, notes: '' });
  const g = new Engine(p, 'physics', 'jet-room', 'alternate');
  assert.equal(g.player.x, 644);
  assert.equal(g.player.y, 228);
  assert.equal(g.player.face, -1);
});
test('rail starts at zero, accelerates and can be detached by a free dash', () => {
  const g = new Engine(M.example(), 'physics', 'rail-room'),
    o = g.room.objects.find((o) => o.type === 'physics.rail');
  g.startRail(o);
  assert.equal(g.player.rail.speed, 0);
  step(g, {}, 15);
  const speed = g.player.rail.speed;
  assert.ok(speed > 0 && speed < o.params.maxSpeed);
  step(g, { dashPressed: true, right: true });
  assert.equal(g.player.rail, null);
  assert.equal(g.charges, 3);
});
test('pause freezes ice timer, controller cooldown, AI and player', () => {
  const g = new Engine(M.example(), 'physics', 'ice-room');
  cold(g);
  g.togglePause();
  const before = g.snapshot();
  step(g, { right: true }, 200);
  assert.deepEqual(g.snapshot(), before);
});

test('life reset restores devices used in an earlier room and their external thermal effects', () => {
  const p = M.example(),
    r = p.courses[0].rooms[1],
    o = r.objects.find((o) => o.type === 'physics.thermal');
  o.resetPolicy = 'life';
  const g = new Engine(p, 'physics', 'ice-room');
  g.fire(g.room.objects.find((o) => o.type === 'physics.thermal'));
  assert.equal(g.zoneStates.get('cold-zone'), 'cold');
  g.loadRoom('rail-room', 'rail-room-entry', {
    tokens: 10,
    charges: 2,
    recharge: 0,
    freeDash: true,
    dashCount: 0,
  });
  g.retry();
  g.loadRoom('ice-room', 'ice-room-entry', {
    tokens: 10,
    charges: 2,
    recharge: 0,
    freeDash: true,
    dashCount: 0,
  });
  assert.equal(g.objectStates.get('thermal-b').used, false);
  assert.equal(g.zoneStates.get('cold-zone'), 'hot');
});

test('preserve thermal policy retains its temperature effect after death', () => {
  const p = M.example(),
    o = p.courses[0].rooms[1].objects.find((o) => o.type === 'physics.thermal');
  o.resetPolicy = 'preserve';
  const g = new Engine(p, 'physics', 'ice-room');
  g.fire(g.room.objects.find((item) => item.id === o.id));
  g.retry();
  assert.equal(g.objectStates.get('thermal-b').used, true);
  assert.equal(g.zoneStates.get('cold-zone'), 'cold');
});
