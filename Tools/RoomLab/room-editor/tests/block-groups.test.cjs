'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict');
const M = require('../src/project/model.cjs'),
  G = require('../src/project/block-groups.cjs'),
  S = require('../src/project/selection.cjs'),
  Native = require('../src/project/native-compat.cjs'),
  Collision = require('../src/project/collision.cjs'),
  MapCompat = require('../src/project/map-compat.cjs');
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
// One room that owns every grouping category: terrain, a functional object, a
// movable mechanism, the entry/exit ports, a zone and the native entities.
function allKindsFixture() {
  const { p, c, r } = fixture();
  r.zones = [{ id: 'zone', name: '热区', x: 3, y: 3, w: 2, h: 2, initial: 'hot' }];
  Native.initRoom(r);
  r.nativeCampaign.platforms.push({ id: 'platform', x: 8, y: 5, w: 1, h: 1 });
  r.nativeCampaign.patrols.push({
    id: 'patrol',
    speed: 95,
    nodes: [
      { x: 9, y: 5 },
      { x: 11, y: 5 },
    ],
  });
  r.nativeCampaign.signs.push({ id: 'sign', x: 2, y: 2, text: '标记' });
  return {
    p,
    c,
    r,
    assembly: null,
    refs: [
      { kind: 'tiles', x: 4, y: 6 },
      { kind: 'objects', id: 'spike' },
      { kind: 'movables', id: 'brick' },
      { kind: 'entries', id: r.entries[0].id },
      { kind: 'exits', id: r.exits[0].id },
      { kind: 'zones', id: 'zone' },
      { kind: 'platforms', id: 'platform' },
      { kind: 'patrols', id: 'patrol' },
      { kind: 'signs', id: 'sign' },
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

test('every selectable block category can join one assembly', () => {
  const { p, c, r, refs } = allKindsFixture();
  assert.deepEqual(G.kinds, S.kinds, 'grouping and selection expose the same categories');
  assert.ok(refs.every((ref) => G.kinds.includes(ref.kind)));
  const ids = refs.map((ref) => (ref.kind === 'tiles' ? 'tile' : ref.id)),
    wires = JSON.stringify(c.connections);

  G.create(r, refs);
  const assembly = r.movables[0].assemblyId;
  assert.ok(assembly, 'assembly created');
  assert.equal(G.members(r, r.entries[0]).length, refs.length);
  assert.ok(G.items(r).every(({ item }) => item.assemblyId === assembly));
  assert.deepEqual(
    refs.map((ref) => (ref.kind === 'tiles' ? 'tile' : ref.id)),
    ids,
    'portal and entity IDs are not rewritten by grouping',
  );
  assert.equal(JSON.stringify(c.connections), wires, 'wires are untouched');
  assert.equal(MapCompat.portLinks(p, r.exits[0].id).length, 1);
  assert.equal(MapCompat.resolve(p, r.id, r.exits[0].id)?.to.entryId, 'ice-room-entry');
});

test('moving a grouped portal keeps IDs, wires and every member together', () => {
  const { p, c, r, refs } = allKindsFixture();
  G.create(r, refs);
  const assembly = r.movables[0].assemblyId,
    wires = JSON.stringify(c.connections),
    ids = [
      r.entries[0].id,
      r.exits[0].id,
      r.zones[0].id,
      r.nativeCampaign.platforms[0].id,
      r.nativeCampaign.patrols[0].id,
      r.nativeCampaign.signs[0].id,
    ];

  assert.equal(S.move(r, [{ kind: 'entries', id: r.entries[0].id }], 1, 0), true);
  assert.equal(r.entries[0].x, 2);
  assert.equal(r.exits[0].x, 29);
  assert.equal(r.zones[0].x, 4);
  assert.equal(r.nativeCampaign.platforms[0].x, 9);
  assert.deepEqual(
    r.nativeCampaign.patrols[0].nodes.map((node) => node.x),
    [10, 12],
  );
  assert.equal(r.nativeCampaign.signs[0].x, 3);
  assert.equal(r.movables[0].x, 6);
  assert.equal(r.movables[0].targetX, 11);
  assert.ok(G.items(r).every(({ item }) => item.assemblyId === assembly));
  assert.deepEqual(
    [
      r.entries[0].id,
      r.exits[0].id,
      r.zones[0].id,
      r.nativeCampaign.platforms[0].id,
      r.nativeCampaign.patrols[0].id,
      r.nativeCampaign.signs[0].id,
    ],
    ids,
  );
  assert.equal(JSON.stringify(c.connections), wires, 'portal wires survive the move');
  assert.deepEqual(M.validate(p).errors, []);

  G.dissolve(r, r.entries[0]);
  assert.ok(
    G.items(r).every(({ item }) => !item.assemblyId && !item.attachmentTo),
    'ungrouping clears the shared membership on every category',
  );
  assert.equal(r.entries[0].id, ids[0]);
  assert.equal(r.exits[0].id, ids[1]);
  assert.equal(JSON.stringify(c.connections), wires, 'portal wires survive ungrouping');
});

test('ports, zones and signs never change a grouped terrain tile collision owner', () => {
  const room = M.room('port-collision', '端口碰撞', 12, 10);
  room.tiles = [{ x: 2, y: 2 }];
  room.entries[0] = { id: 'entry', name: '入口', x: 8, y: 8, face: 1, allowReturn: true };
  room.objects = [];
  room.movables = [];
  room.zones = [{ id: 'zone', name: '区域', x: 6, y: 2, w: 2, h: 2, initial: 'cold' }];
  Native.initRoom(room);
  room.nativeCampaign.signs.push({ id: 'sign', x: 1, y: 1, text: '标记' });
  G.create(room, [
    { kind: 'tiles', x: 2, y: 2 },
    { kind: 'entries', id: 'entry' },
    { kind: 'zones', id: 'zone' },
    { kind: 'signs', id: 'sign' },
  ]);
  assert.ok(room.tiles[0].assemblyId);
  assert.ok(Collision.inherited(room, room.tiles[0], 'tiles'), 'terrain keeps its own solid');
  G.dissolve(room, room.tiles[0]);
  assert.ok(room.tiles[0].collision === undefined && !room.tiles[0].assemblyId);
});

test('grouped ports persist through duplication and project migration', () => {
  const { p, c, r, refs } = allKindsFixture();
  G.create(r, refs);
  const assembly = r.movables[0].assemblyId,
    wires = JSON.stringify(c.connections),
    copy = M.duplicateRoom(c, r.id);
  assert.notEqual(copy.entries[0].id, r.entries[0].id);
  assert.equal(copy.entries[0].attachmentTo, copy.movables[0].id);
  assert.equal(copy.exits[0].attachmentTo, copy.movables[0].id);
  assert.equal(copy.zones[0].attachmentTo, copy.movables[0].id);
  assert.equal(copy.entries[0].assemblyId, assembly);
  assert.equal(copy.exits[0].assemblyId, assembly);
  assert.equal(copy.zones[0].assemblyId, assembly);

  const roundtrip = M.migrate(JSON.parse(JSON.stringify(p))),
    rr = roundtrip.courses[0].rooms[0];
  assert.equal(rr.entries[0].assemblyId, assembly);
  assert.equal(rr.exits[0].assemblyId, assembly);
  assert.equal(rr.zones[0].assemblyId, assembly);
  assert.equal(rr.nativeCampaign.platforms[0].assemblyId, assembly);
  assert.equal(rr.entries[0].id, r.entries[0].id);
  assert.equal(JSON.stringify(roundtrip.courses[0].connections), wires);
});

test('legacy saves migrate without inventing group membership', () => {
  const fs = require('node:fs'),
    path = require('node:path'),
    old = M.migrate(
      JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/v1-example.json'), 'utf8')),
    ),
    items = old.courses.flatMap((course) =>
      course.rooms.flatMap((room) => G.items(room)),
    );
  assert.ok(items.length > 0);
  assert.ok(items.every(({ item }) => !item.assemblyId && !item.attachmentTo));
  assert.deepEqual(M.validate(old).errors, []);
});

