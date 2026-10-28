'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  M = require('../src/project/model.cjs'),
  { Engine } = require('../src/runtime/engine.cjs'),
  Archive = require('../src/project/archive.cjs'),
  Collision = require('../src/project/collision.cjs');
test('collision switch removes terrain, function block and movable colliders while legacy defaults stay unchanged', () => {
  const p = M.example(),
    r = p.courses[0].rooms[0];
  r.tiles.find((t) => t.x === 4 && t.y === 14).collision = false;
  r.objects[0].collision = false;
  r.movables = [{ id: 'moving-ghost', x: 5, y: 10, targetX: 7, targetY: 10, collision: false }];
  let g = new Engine(p);
  assert.ok(!g.colliders().some((b) => ['tile-4-14', 'jet-a', 'moving-ghost'].includes(b.id)));
  assert.ok(g.colliders().some((b) => b.id === 'tile-5-14'));
  r.objects[1].collision = true;
  g = new Engine(p);
  assert.ok(g.colliders().some((b) => b.id === 'fuel-a'));
});
test('unified AI without collision triggers on passage, solid version still triggers by landing', () => {
  const p = M.example(),
    r = p.courses[0].rooms[0];
  r.aiPolicy = 'inherit';
  r.objects = [M.object('ai', 'common.aiStart', 2, 13)];
  r.objects[0].collision = false;
  const g = new Engine(p);
  Object.assign(g.player, { x: 68, y: 13 * 32 + 4, vy: 0, grounded: false });
  g.update(1 / 120, { right: true });
  assert.equal(g.ai.active, true);
  assert.ok(!g.colliders().some((b) => b.id === 'ai'));
});
test('old hollow AI migrates by stable ID and keeps its own art; exports as compatible legacy alias', () => {
  const p = M.example(),
    r = p.courses[0].rooms[0];
  r.objects = [M.object('legacy-ai', 'common.aiStartHollow', 2, 13)];
  p.courses[0].artBindings['common.aiStartHollow'] = { idle: 'my-old-style' };
  const m = M.migrate(p),
    o = m.courses[0].rooms[0].objects[0];
  assert.equal(o.id, 'legacy-ai');
  assert.equal(o.type, 'common.aiStart');
  assert.equal(o.collision, false);
  assert.equal(o.assetOverrides.idle, 'my-old-style');
  assert.equal(p.courses[0].rooms[0].objects[0].type, 'common.aiStartHollow');
  const portable = Collision.portable(m);
  assert.equal(portable.courses[0].rooms[0].objects[0].type, 'common.aiStartHollow');
  assert.equal(portable.courses[0].rooms[0].objects[0].trigger.mode, 'region');
  assert.equal(M.migrate(portable).courses[0].rooms[0].objects[0].collision, false);
});
test('collision overrides survive ZIP, room copy, and validate their type', () => {
  const p = M.example();
  p.courses[0].rooms[0].objects[0].collision = false;
  const loaded = Archive.unpack(Archive.pack(p, new Map()));
  assert.equal(loaded.project.courses[0].rooms[0].objects[0].collision, false);
  const c = M.duplicateRoom(loaded.project.courses[0], 'jet-room');
  assert.equal(c.objects[0].collision, false);
  p.courses[0].rooms[0].tiles[0].collision = 'false';
  assert.ok(M.validate(p).errors.some((e) => e.includes('碰撞开关')));
});

test('forced solid collectibles still collect on contact and then release their collider', () => {
  const p = M.example(),
    r = p.courses[0].rooms[0];
  r.objects = [M.object('solid-token', 'common.coin', 2, 13)];
  r.objects[0].collision = true;
  const g = new Engine(p);
  Object.assign(g.player, { x: 68, y: 13 * 32 - 28, vy: 0, grounded: false });
  g.update(1 / 120);
  assert.equal(g.tokens, 10);
  assert.ok(!g.colliders().some((c) => c.id === 'solid-token'));
});
test('legacy hollow AI artwork remains selectable under the unified AI category', () => {
  const p = M.example();
  p.assets = [
    {
      id: 'legacy-style',
      courseId: p.courses[0].id,
      category: 'mechanism',
      subcategory: 'common.aiStartHollow',
    },
  ];
  const Catalog = require('../src/assets/catalog.cjs');
  assert.equal(Catalog.available(p, p.courses[0].id, 'common.aiStart').length, 1);
  assert.equal(Catalog.classification(p, p.assets[0]).subcategory, 'common.aiStart');
});
