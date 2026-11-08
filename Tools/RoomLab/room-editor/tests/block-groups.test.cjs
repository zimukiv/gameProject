'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict');
const M = require('../src/project/model.cjs'),
  G = require('../src/project/block-groups.cjs'),
  S = require('../src/project/selection.cjs');
const R = require('../src/plugins/registry.cjs'),
  { Engine } = require('../src/runtime/engine.cjs');
function fixture() {
  const p = M.example(),
    c = p.courses[0],
    r = c.rooms[0];
  r.tiles = [{ x: 4, y: 6 }];
  r.objects = [R.instantiate(p, 'common.spike', 'spike', 5, 6)];
  r.objects[0].collision = false;
  r.movables = [{ id: 'brick', x: 5, y: 5, targetX: 10, targetY: 5, padId: '', collision: true }];
  return {
    p,
    c,
    r,
    refs: [
      { kind: 'tiles', x: 4, y: 6 },
      { kind: 'objects', id: 'spike' },
      { kind: 'movables', id: 'brick' },
    ],
  };
}
test('mixed grouping preserves object behavior and moves all selected members and paths', () => {
  const { r, refs } = fixture();
  assert.equal(G.create(r, refs).id, 'brick');
  assert.equal(r.objects[0].attachmentTo, 'brick');
  assert.equal(r.objects[0].collision, false);
  assert.ok(S.move(r, [refs[1]], 2, 1));
  assert.equal(r.movables[0].x, 7);
  assert.equal(r.movables[0].targetX, 12);
  assert.equal(r.tiles[0].x, 6);
  assert.equal(r.objects[0].x, 7);
  r.tiles[0].locked = true;
  assert.equal(S.move(r, [refs[1]], 1, 0), false);
  G.dissolve(r, r.objects[0]);
  assert.ok(G.items(r).every(({ item }) => !item.assemblyId && !item.attachmentTo));
});
test('room duplication remaps attachment owners and import preserves mixed groups', () => {
  const { p, c, r, refs } = fixture();
  G.create(r, refs);
  const copy = M.duplicateRoom(c, r.id);
  assert.notEqual(copy.movables[0].id, 'brick');
  assert.equal(copy.objects[0].attachmentTo, copy.movables[0].id);
  assert.equal(copy.tiles[0].attachmentTo, copy.movables[0].id);
  const roundtrip = M.migrate(JSON.parse(JSON.stringify(p)));
  assert.equal(roundtrip.courses[0].rooms[0].objects[0].attachmentTo, 'brick');
});
test('attached spike and terrain use live owner position without mutating saved coordinates', () => {
  const { p, c, r, refs } = fixture();
  G.create(r, refs);
  const g = new Engine(p, c.id, r.id);
  g.movableStates.get('brick').pathTime = 0.225;
  assert.equal(g.objectRect(g.room.objects[0]).x, 7.5 * 32);
  assert.equal(g.colliders().find((b) => b.id === 'tile-4-6').x, 6.5 * 32);
  assert.equal(g.room.objects[0].x, 5);
  assert.equal(g.worldObject(g.room.objects[0]).x, 7.5);
});
test('a non-solid spike glued to a fast moving brick still kills on the swept path', () => {
  const { p, c, r, refs } = fixture();
  G.create(r, refs);
  const g = new Engine(p, c.id, r.id);
  Object.assign(g.player, { x: 7 * 32, y: 6 * 32, vx: 0, vy: 0, grounded: false });
  g.ai.active = false;
  g.room.tiles.push({ x: 7, y: 7 });
  g.movableStates.get('brick').anim = { kind: 'path', to: 0.45 };
  for (let i = 0; i < 60 && !g.deaths; i++) g.update(1 / 120, {});
  assert.equal(g.deaths, 1);
  assert.ok(g.events.some((e) => JSON.stringify(e).includes('碰到尖刺')));
});

test('mixed groups share leader solid and per-segment movement collision, retaining member shapes', () => {
  const { p, c, r, refs } = fixture();
  G.create(r, refs);
  const g = new Engine(p, c.id, r.id),
    b = g.room.movables[0],
    s = g.movableStates.get(b.id);
  assert.equal(g.colliders().length, 3, 'leader true makes all three member shapes solid');
  b.collision = false;
  assert.equal(g.colliders().length, 0);
  b.collision = true;
  b.motionPath[0].movingCollision = false;
  s.pathTime = 0.1;
  s.anim = { kind: 'path', to: 0.45 };
  assert.equal(g.colliders().length, 0, 'all members ghost during disabled segment');
  s.anim = null;
  assert.equal(g.colliders().length, 3, 'all members restore at rest');
  G.dissolve(g.room, b);
  assert.equal(g.colliders().length, 2, 'dissolve restores own spike collision setting');
});
test('static mixed groups inherit central member and legacy brick groups ignore individual overrides', () => {
  const Collision = require('../src/project/collision.cjs');
  const room = {
    tiles: [
      { x: 0, y: 0, collision: false },
      { x: 1, y: 0, collision: true },
      { x: 2, y: 0, collision: false },
    ],
    objects: [],
    movables: [],
  };
  G.create(
    room,
    room.tiles.map((t) => ({ kind: 'tiles', x: t.x, y: t.y })),
  );
  assert.ok(room.tiles.every((t) => Collision.inherited(room, t, 'tiles')));
  room.tiles[1].collision = false;
  assert.ok(room.tiles.every((t) => !Collision.inherited(room, t, 'tiles')));
  room.movables = [
    { id: 'a', x: 5, y: 5, brickGroup: 'g', collision: false },
    { id: 'b', x: 6, y: 5, brickGroup: 'g', collision: true },
    { id: 'c', x: 7, y: 5, brickGroup: 'g', collision: false },
  ];
  assert.ok(room.movables.every((b) => Collision.inherited(room, b, 'movables')));
});
