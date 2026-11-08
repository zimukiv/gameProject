'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Engine } = require('../src/runtime/engine.cjs');
const M = require('../src/project/model.cjs');
const { overlap } = require('../src/shared/utils.cjs');
function scene(from, to, player, collision = true) {
  const g = new Engine(M.example(), 'physics');
  Object.assign(g.room, {
    tiles: [],
    objects: [],
    movables: [{ id: 'moving', ...from, targetX: to.x, targetY: to.y, collision }],
  });
  g.movableStates = new Map([
    ['moving', { progress: 0, angle: 0, anim: { from: 0, to: 1, t: 0, kind: 'progress' } }],
  ]);
  Object.assign(g.player, {
    x: 160,
    y: 160,
    vx: 0,
    vy: 0,
    grounded: false,
    support: null,
    ...player,
  });
  g.ai.active = false;
  return g;
}
test('upward moving brick pushes stationary airborne player every tick', () => {
  const g = scene({ x: 5, y: 7 }, { x: 5, y: 2 }, {});
  for (let i = 0; i < 40; i++) {
    g.update(1 / 120, {});
    assert.equal(overlap(g.player, g.movableRect(g.room.movables[0])), false);
  }
  assert.ok(g.player.y < 100);
});
test('fast horizontal brick cannot tunnel through idle player', () => {
  const g = scene({ x: 1, y: 5 }, { x: 50, y: 5 }, {});
  for (let i = 0; i < 7; i++) g.update(1 / 120, {});
  assert.ok(g.player.x > 230);
});
test('non-solid moving brick does not push player', () => {
  const g = scene({ x: 1, y: 5 }, { x: 50, y: 5 }, {}, false);
  for (let i = 0; i < 7; i++) g.update(1 / 120, {});
  assert.equal(g.player.x, 160);
});
test('descending and leftward solids push without directional input', () => {
  const { transport } = require('../src/runtime/moving-solids.cjs');
  for (const [from, to, actor, expected] of [
    [{ x: 100, y: 10 }, { x: 100, y: 200 }, { x: 100, y: 100 }, { y: 232 }],
    [{ x: 200, y: 100 }, { x: 10, y: 100 }, { x: 100, y: 100 }, { x: -10 }],
  ]) {
    const p = { ...actor, w: 20, h: 28, vx: 0, vy: 0 };
    const b = { id: 'b', kind: 'movable', w: 32, h: 32 };
    assert.equal(transport(p, [{ ...b, ...from }], [{ ...b, ...to }]), true);
    for (const [key, value] of Object.entries(expected)) assert.equal(p[key], value);
  }
});
test('rider is carried once, blocked push leaves actor unchanged', () => {
  const { transport } = require('../src/runtime/moving-solids.cjs');
  const b = { id: 'b', kind: 'movable', x: 100, y: 100, w: 32, h: 32 };
  const p = { x: 106, y: 72, w: 20, h: 28, grounded: true, support: 'b', vx: 0, vy: 0 };
  assert.equal(transport(p, [b], [{ ...b, x: 120, y: 80 }]), true);
  assert.equal(p.x, 126);
  assert.equal(p.y, 52);
  const wall = { id: 'ceiling', x: 0, y: 0, w: 500, h: 60 };
  const stationary = { ...p, x: 106, y: 72 };
  const snapshot = { ...stationary };
  assert.equal(transport(stationary, [b, wall], [{ ...b, y: 50 }, wall]), false);
  assert.deepEqual(stationary, snapshot);
});
test('a trapped rider is crushed instead of stopping the mechanism', () => {
  const g = scene({ x: 5, y: 5 }, { x: 5, y: 1 }, { y: 132, grounded: true, support: 'moving' });
  g.room.tiles = [{ x: 5, y: 3 }];
  for (let i = 0; i < 50 && !g.deaths; i++) g.update(1 / 120, {});
  assert.equal(g.deaths, 1);
  assert.ok(g.events.some((e) => JSON.stringify(e).includes('被机关挤压')));
});

test('sideways and downward pushes into solid terrain crush an idle actor', () => {
  for (const [from, to, tile] of [
    [
      { x: 3, y: 5 },
      { x: 9, y: 5 },
      { x: 6, y: 5 },
    ],
    [
      { x: 5, y: 3 },
      { x: 5, y: 9 },
      { x: 5, y: 6 },
    ],
  ]) {
    const g = scene(from, to, {});
    g.room.tiles = [tile];
    for (let i = 0; i < 50 && !g.deaths; i++) g.update(1 / 120, {});
    assert.equal(g.deaths, 1);
    assert.ok(g.events.some((e) => JSON.stringify(e).includes('被机关挤压')));
  }
});

test('a platform pushing an idle rider into solid spikes kills on contact', () => {
  const g = scene({ x: 5, y: 5 }, { x: 5, y: 1 }, { y: 132, grounded: true, support: 'moving' });
  const spike = require('../src/plugins/registry.cjs').instantiate(
    g.project,
    'common.spike',
    'ceiling-spike',
    5,
    3,
  );
  spike.collision = true;
  g.room.objects = [spike];
  g.objectStates.set(spike.id, {});
  for (let i = 0; i < 30 && !g.deaths; i++) g.update(1 / 120, {});
  assert.equal(g.deaths, 1);
});

test('hazards crossed during fast transport are checked even when the final position is clear', () => {
  const { transport } = require('../src/runtime/moving-solids.cjs');
  const { spikeContact } = require('../src/runtime/hazards.cjs');
  const b = { id: 'b', kind: 'movable', x: 0, y: 100, w: 32, h: 32 };
  const p = { x: 6, y: 72, w: 20, h: 28, grounded: true, support: 'b', vx: 0, vy: 0 };
  const spike = { collision: false },
    rect = { x: 80, y: 64, w: 32, h: 32 };
  assert.equal(
    transport(p, [b], [{ ...b, x: 160 }], (actor) => spikeContact(actor, spike, rect)),
    'hazard',
  );
});

test('a fractional side overlap with a single moving brick is contact, not crushing', () => {
  const { transport } = require('../src/runtime/moving-solids.cjs');
  const b = { id: 'b', kind: 'movable', x: 100, y: 100, w: 32, h: 32 };
  for (const dx of [0, 1, -1]) {
    const p = { x: 131.99, y: 102, w: 24, h: 28, vx: -100, vy: 0 };
    const next = { ...b, x: b.x + dx, y: 99 };
    assert.equal(transport(p, [b], [next]), true);
    assert.equal(overlap(p, next), false);
  }
});

test('a rider carried into an obstacle ahead along the motion direction is crushed', () => {
  const { transport } = require('../src/runtime/moving-solids.cjs');
  const b = { id: 'b', kind: 'movable', x: 100, y: 100, w: 32, h: 32 };
  const wall = { id: 'wall', x: 130, y: 60, w: 32, h: 40 };
  const p = { x: 106, y: 72, w: 24, h: 28, grounded: true, support: 'b', vx: 0, vy: 0 };
  assert.equal(transport(p, [b, wall], [{ ...b, x: 104 }, wall]), false);
  assert.equal(p.x, 106);
});

test('a full brick separates a standing actor from spikes underneath', () => {
  const g = scene({ x: 5, y: 5 }, { x: 8, y: 5 }, { y: 132, grounded: true, support: 'moving' });
  const spike = require('../src/plugins/registry.cjs').instantiate(
    g.project,
    'common.spike',
    'underneath',
    5,
    6,
  );
  spike.collision = true;
  g.room.objects = [spike];
  g.objectStates.set(spike.id, {});
  for (let i = 0; i < 50; i++) g.update(1 / 120, {});
  assert.equal(g.deaths, 0);
  assert.ok(g.player.grounded);
});

test('floating point touching faces and unrelated movers do not cause crush deaths', () => {
  const { transport } = require('../src/runtime/moving-solids.cjs');
  const floor = { id: 'floor', kind: 'movable', x: 100, y: 9 / 17, w: 32, h: 32 };
  const other = { id: 'other', kind: 'movable', x: 400, y: 100, w: 32, h: 32 };
  const p = {
    x: 100,
    y: floor.y - 28,
    w: 24,
    h: 28,
    vx: 0,
    vy: 0,
    grounded: true,
    support: 'floor',
  };
  assert.ok(p.y + p.h > floor.y, 'fixture reproduces floating point penetration');
  assert.equal(transport(p, [floor, other], [floor, { ...other, x: 401 }]), true);
});

test('standing on a platform moving in any direction is safe without an opposing obstacle', () => {
  const { transport } = require('../src/runtime/moving-solids.cjs');
  for (const [dx, dy] of [
    [20, 0],
    [-20, 0],
    [0, 20],
    [0, -20],
    [20, -20],
  ]) {
    const b = { id: 'b', kind: 'movable', x: 100, y: 100, w: 32, h: 32 };
    const p = { x: 106, y: 72, w: 24, h: 28, grounded: true, support: 'b', vx: 0, vy: 0 };
    assert.equal(transport(p, [b], [{ ...b, x: 100 + dx, y: 100 + dy }]), true);
    assert.equal(p.x, 106 + dx);
    assert.equal(p.y, 72 + dy);
  }
});

test('an upward rider grazing a wall beside them is not squeezed along the motion direction', () => {
  const { transport } = require('../src/runtime/moving-solids.cjs');
  const b = { id: 'b', kind: 'movable', x: 100, y: 100, w: 32, h: 32 };
  const wall = { id: 'side', x: 130, y: 40, w: 32, h: 60 };
  const p = { x: 106.01, y: 72, w: 24, h: 28, grounded: true, support: 'b', vx: 0, vy: 0 };
  assert.equal(transport(p, [b, wall], [{ ...b, y: 96 }, wall]), true);
  assert.equal(p.y, 68);
  assert.equal(p.x, 106);
});

test('moving collision defaults on, disabled movement passes through and restores at rest', () => {
  const g = scene({ x: 1, y: 5 }, { x: 20, y: 5 }, {});
  const brick = g.room.movables[0];
  assert.ok(g.colliders().some((b) => b.id === brick.id));
  brick.movingCollision = false;
  assert.ok(!g.colliders().some((b) => b.id === brick.id));
  for (let i = 0; i < 8; i++) g.update(1 / 120, {});
  assert.equal(g.player.x, 160, 'moving brick must not push player');
  for (let i = 0; i < 50; i++) g.update(1 / 120, {});
  assert.equal(g.deaths, 0);
  assert.equal(g.movableStates.get(brick.id).anim, null);
  assert.ok(g.colliders().some((b) => b.id === brick.id));
  brick.collision = false;
  assert.ok(
    !g.colliders().some((b) => b.id === brick.id),
    'permanent collision toggle takes precedence',
  );
});

test('a stationary path segment keeps collision until actual movement starts', () => {
  const Motion = require('../src/project/brick-motion.cjs');
  const b = {
    x: 5,
    y: 5,
    motionPath: [
      { x: 5, y: 5, seconds: 1, mode: 'linear' },
      { x: 7, y: 5, seconds: 1, mode: 'smooth' },
    ],
  };
  assert.equal(Motion.isMoving(b, { pathTime: 0.5, anim: { kind: 'path', to: 2 } }), false);
  assert.equal(Motion.isMoving(b, { pathTime: 1.5, anim: { kind: 'path', to: 2 } }), true);
  assert.equal(Motion.isMoving(b, { pathTime: 2, anim: null }), false);
  assert.equal(Motion.isMoving(b, { pathTime: 1.5, anim: { kind: 'path', to: 0 } }), true);
});

test('restoring a ghost brick at its endpoint separates ordinary contact without crush death', () => {
  const { transport } = require('../src/runtime/moving-solids.cjs');
  const b = { id: 'restored', kind: 'movable', x: 100, y: 100, w: 32, h: 32 };
  const p = { x: 106, y: 80, w: 24, h: 28, vx: 0, vy: 0 };
  assert.equal(transport(p, [], [b]), true);
  assert.equal(overlap(p, b), false);
});
