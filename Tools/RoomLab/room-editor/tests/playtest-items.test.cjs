'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/project/model.cjs');
const Playtest = require('../src/project/playtest-items.cjs');
const ItemState = require('../src/runtime/item-state.cjs');
const { Engine } = require('../src/runtime/engine.cjs');

function itemObject(id, type, x) {
  return {
    id,
    type,
    x,
    y: 8,
    w: 1,
    h: 1,
    params: {},
    aiId: null,
    assetOverrides: {},
    resetPolicy: 'checkpoint',
  };
}
function room(id, objects = []) {
  return {
    id,
    name: id,
    notes: '',
    cols: 20,
    rows: 12,
    phase: 'inherit',
    aiId: null,
    aiPolicy: 'inherit',
    environment: 'cold',
    graph: { x: 0, y: 0 },
    tiles: [],
    entries: [
      { id: id + '-entry', name: '入口', notes: '', x: 1, y: 8, face: 1, allowReturn: true },
    ],
    exits: [{ id: id + '-exit', name: '出口', notes: '', x: 18, y: 8, w: 1, h: 2 }],
    objects,
    movables: [],
    zones: [],
  };
}
function project(rooms, itemState) {
  return {
    version: 2,
    id: 'playtest-project',
    name: '试玩背包测试',
    notes: '',
    settings: { tileSize: 32, maxDashes: 3, paidStockCap: 1, freeDashOnLand: true },
    compatibility: { runtime: require('../src/project/compatibility.cjs').RUNTIME },
    courses: [
      {
        id: 'c1',
        name: 'C1',
        kind: 'physics',
        notes: '',
        aiId: 'ai',
        defaultSize: { cols: 20, rows: 12 },
        artBindings: {},
        rooms,
        connections: [],
      },
    ],
    assets: [],
    blockDefaults: {},
    pluginManifest: {},
    ...(itemState ? { itemState } : {}),
  };
}

test('道具清单来自 Registry，带名称与图标', () => {
  const catalog = Playtest.catalog();
  assert.deepEqual(catalog.map((i) => i.type).sort(), [
    'item.calculator',
    'item.coffee',
    'item.icedTea',
    'item.phone',
  ]);
  assert.ok(catalog.every((i) => i.name && i.glyph));
});

test('旧存档无配置 → 兼容全道具；显式配置优先（含空数组）', () => {
  const legacy = room('r1');
  assert.deepEqual(Playtest.resolve(legacy), {
    mode: 'legacy-all',
    items: ['item.coffee', 'item.calculator', 'item.phone', 'item.icedTea'],
    legacy: true,
  });
  const explicit = room('r2');
  Playtest.write(explicit, ['item.phone', 'item.phone', 'item.unknown']);
  assert.deepEqual(explicit.playtestItems, ['item.phone']);
  assert.equal(Playtest.resolve(explicit).mode, 'configured');
  assert.deepEqual(Playtest.resolve(explicit).items, ['item.phone']);
  Playtest.write(explicit, []);
  assert.equal(Playtest.resolve(explicit).mode, 'configured');
  assert.deepEqual(Playtest.resolve(explicit).items, []);
  Playtest.write(explicit, null);
  assert.equal(Object.hasOwn(explicit, 'playtestItems'), false);
  assert.equal(Playtest.resolve(explicit).mode, 'legacy-all');
});

test('引擎按显式配置注入试玩背包，正常流程不注入', () => {
  const p = project([room('r1')]);
  const legacy = new Engine(p, 'c1', 'r1', undefined, {
    developerMode: true,
    playtest: Playtest.resolve(p.courses[0].rooms[0]),
  });
  assert.equal(legacy.hasItem('item.coffee'), true);
  legacy.update(1 / 120, {});
  const configured = new Engine(project([room('r2')]), 'c1', 'r2', undefined, {
    developerMode: true,
    playtest: { mode: 'configured', items: ['item.icedTea'] },
  });
  assert.equal(configured.hasItem('item.icedTea'), true);
  assert.equal(configured.hasItem('item.coffee'), false);
  const production = new Engine(project([room('r3')]), 'c1', 'r3');
  assert.equal(production.hasItem('item.coffee'), false);
});

test('项目级初始道具状态可序列化并注入', () => {
  const p = project([room('r1')], { version: 1, initial: { 'item.calculator': 2 } });
  const engine = new Engine(p, 'c1', 'r1');
  assert.equal(engine.items['item.calculator'], 2);
  ItemState.setInitial(p, { 'item.phone': 1 });
  assert.deepEqual(ItemState.initial(p), { 'item.phone': 1 });
  assert.equal(ItemState.setInitial(p, { 'item.phone': 0 }).initial['item.phone'], undefined);
});

test('道具跨房间保留，死亡按存档点回退', () => {
  const coins = [itemObject('coffee-1', 'item.coffee', 2)],
    p = project([room('r1', coins), room('r2', [itemObject('tea-1', 'item.icedTea', 3)])]);
  const engine = new Engine(p, 'c1', 'r1');
  engine.collect(engine.room.objects[0]);
  assert.equal(engine.hasItem('item.coffee'), true);
  engine.loadRoom('r2', 'r2-entry', {
    tokens: engine.tokens,
    charges: engine.charges,
    recharge: engine.recharge,
    freeDash: true,
    dashCount: 0,
  });
  assert.equal(engine.hasItem('item.coffee'), true, '跨房间保留收集状态');
  engine.collect(engine.room.objects[0]);
  assert.equal(engine.hasItem('item.icedTea'), true);
  const state = engine.itemState();
  assert.equal(state.version, 1);
  assert.deepEqual(state.items, { 'item.coffee': 1, 'item.icedTea': 1 });
  assert.ok(state.collected.includes('r1/coffee-1'));
  engine.retry('测试死亡');
  assert.equal(engine.room.id, 'r2', '存档点在进入当前房间时建立');
  assert.equal(engine.hasItem('item.coffee'), true, '存档点快照含已收集道具');
  assert.equal(engine.hasItem('item.icedTea'), false, '死后回退到存档点，不保留本轮收集');
  engine.restoreItemState({ version: 1, items: {}, collected: [] });
  assert.equal(engine.hasItem('item.coffee'), false);
});

test('旧存档回归：房间 ID / 机关 ID / 未知字段 / 素材绑定 / 连接原样保留', () => {
  const p = M.example();
  p.assets = [{ id: 'asset-1', path: 'assets/a.png', kind: 'object' }];
  p.courses[0].artBindings = { 'common.coin': { idle: 'asset-1' } };
  p.courses[0].rooms[0].objects[0].unknownExt = { keep: 1 };
  p.courses[0].rooms[0].playtestItems = ['item.coffee'];
  p.courses[0].rooms[0].phase = 'fast';
  const messages = JSON.parse(JSON.stringify(p));
  const migrated = M.migrate(messages);
  assert.deepEqual(
    migrated.courses.map((c) => c.rooms.map((r) => r.id)),
    [['jet-room', 'ice-room', 'rail-room']],
  );
  assert.equal(migrated.courses[0].rooms[0].objects[0].id, 'jet-a');
  assert.deepEqual(migrated.courses[0].rooms[0].objects[0].unknownExt, { keep: 1 });
  assert.deepEqual(migrated.courses[0].artBindings, { 'common.coin': { idle: 'asset-1' } });
  assert.deepEqual(migrated.courses[0].connections, p.courses[0].connections);
  assert.equal(migrated.courses[0].rooms[0].phase, 'fast');
  assert.deepEqual(migrated.courses[0].rooms[0].playtestItems, ['item.coffee']);
});

test('房间属性不再提供快慢节奏选择，但旧 phase 仍可加载', () => {
  const source = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../src/editor/pages/room.cjs'),
    'utf8',
  );
  assert.equal(source.includes('room-phase'), false);
  const p = project([room('r1')]);
  p.courses[0].rooms[0].phase = 'fast';
  const engine = new Engine(p, 'c1', 'r1');
  assert.equal(engine.room.phase, 'fast');
  engine.update(1 / 120, {});
});
