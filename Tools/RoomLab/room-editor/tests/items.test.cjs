'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  M = require('../src/project/model.cjs'),
  Registry = require('../src/plugins/registry.cjs'),
  Seeds = require('../src/assets/seeds.cjs'),
  Catalog = require('../src/assets/catalog.cjs'),
  { Engine } = require('../src/runtime/engine.cjs');

const ITEMS = ['item.coffee', 'item.calculator', 'item.phone', 'item.icedTea'];

test('all courses can place the four item blocks without collision', () => {
  const p = M.themedExample();
  for (const kind of ['physics', 'calculus', 'slacker']) {
    const course = p.courses.find((c) => c.kind === kind),
      tools = Registry.list(kind).map((d) => d.type);
    for (const type of ITEMS) {
      assert.ok(tools.includes(type), kind + ' / ' + type);
      const item = Registry.instantiate(p, type, kind + '-' + type, 2, 2, course);
      assert.equal(item.type, type);
      assert.equal(item.collision, false);
      assert.equal(item.trigger.mode, 'region');
      assert.equal(Registry.get(type).collectible, true);
      assert.equal(Registry.get(type).item, true);
    }
  }
});

test('the four item assets are catalogued as usable item artwork', () => {
  const p = M.themedExample(),
    seed = Seeds.seeds({ allThemes: true });
  p.assets = seed.assets;
  for (const course of p.courses) {
    course.artBindings = { ...seed.allBindings, ...course.artBindings };
    for (const type of ITEMS) {
      assert.equal(Catalog.groupForType(type), 'item');
      assert.ok(Catalog.available(p, course.id, type).length > 0, course.kind + ' / ' + type);
    }
  }
});

test('items are collected by passing through and persist across rooms', () => {
  const p = M.themedExample(),
    course = p.courses.find((c) => c.kind === 'physics'),
    room = course.rooms[0],
    item = Registry.instantiate(p, 'item.coffee', 'coffee-test', 5, 4, course);
  room.objects.push(item);
  const g = new Engine(p, course.id, room.id);
  Object.assign(g.player, { x: 5 * 32 + 4, y: 4 * 32 + 4, vx: 0, vy: 0, grounded: false });
  g.update(1 / 120, {});
  assert.equal(g.items['item.coffee'], 1);
  assert.equal(g.snapshot().items['item.coffee'], 1);
  assert.ok(g.credited.has(room.id + '/coffee-test'));
  assert.ok(
    g.events.some((e) => e.type === 'item-collect' && e.itemType === 'item.coffee'),
  );
  g.loadRoom('ice-room', 'ice-room-entry', {
    tokens: g.tokens,
    charges: g.charges,
    recharge: g.recharge,
    freeDash: g.player.freeDash,
    dashCount: g.player.dashCount,
  });
  assert.equal(g.items['item.coffee'], 1);
});

test('item inventory follows checkpoint rollback rules', () => {
  const p = M.themedExample(),
    course = p.courses.find((c) => c.kind === 'slacker'),
    room = course.rooms[0],
    checkpoint = Registry.instantiate(p, 'common.checkpoint', 'item-checkpoint', 2, 11, course);
  room.objects.push(checkpoint);
  const g = new Engine(p, course.id, room.id),
    coffee = g.room.objects.find((o) => o.type === 'item.coffee'),
    calculator = Registry.instantiate(p, 'item.calculator', 'calculator-test', 3, 4, course);
  g.collect(coffee);
  assert.equal(g.items['item.coffee'], 1);
  g.setCheckpoint(g.room.objects.find((o) => o.id === 'item-checkpoint'));
  g.collect(calculator);
  assert.equal(g.items['item.calculator'], 1);
  g.retry();
  assert.deepEqual(g.items, { 'item.coffee': 1 });
});
