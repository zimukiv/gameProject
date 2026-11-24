'use strict';
// 阶段 1 审查补修：房间运行归属、按需房间校验、试玩背包覆盖语义、
// ItemState 恢复与 checkpoint 道具收集一致性。
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/project/model.cjs');
const MapCompat = require('../src/project/map-compat.cjs');
const Registry = require('../src/plugins/registry.cjs');
const { Engine } = require('../src/runtime/engine.cjs');

function object(id, type, x, y, params = {}) {
  return {
    id,
    type,
    x,
    y,
    w: 1,
    h: 1,
    params,
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
function course(id, rooms, aiId = id + '-ai') {
  return {
    id,
    name: id,
    kind: 'physics',
    notes: '',
    aiId,
    defaultSize: { cols: 20, rows: 12 },
    artBindings: {},
    rooms,
    connections: [],
  };
}
function project(courses, extra = {}) {
  return {
    version: 2,
    id: 'runtime-room-binding',
    name: '运行归属回归',
    notes: '',
    settings: { tileSize: 32, maxDashes: 3, paidStockCap: 1, freeDashOnLand: true },
    compatibility: { runtime: require('../src/project/compatibility.cjs').RUNTIME },
    courses,
    assets: [],
    blockDefaults: {},
    pluginManifest: {},
    ...extra,
  };
}
const resources = () => ({
  tokens: 0,
  charges: 0,
  recharge: 0,
  freeDash: true,
  dashCount: 0,
});

test('loadRoom 跨原大关切换运行归属，AI 默认与 retry 跟随目标大关', () => {
  const p = project([
    course('c1', [room('a1', [object('wake', 'common.aiStart', 2, 8)])], 'c1-ai'),
    course('c2', [room('b1')], 'c2-ai'),
  ]);
  MapCompat.connect(p, { roomId: 'a1', exitId: 'a1-exit' }, { roomId: 'b1', entryId: 'b1-entry' });
  const engine = new Engine(p, 'c1', 'a1');
  assert.equal(engine.course.id, 'c1');
  assert.equal(engine.ai.id, 'c1-ai');
  engine.activateAI(engine.room.objects[0]);
  assert.equal(engine.courseState.aiActive, true);

  engine.exitCooldown = 0;
  engine.exitTriggerArmed = true;
  Object.assign(engine.player, { x: 18 * 32 + 4, y: 8 * 32 + 4, vx: 0, vy: 0 });
  engine.update(1 / 120, {});
  assert.equal(engine.room.id, 'b1');
  assert.equal(engine.course.id, 'c2', '运行归属应切到目标房间所属大关');
  assert.equal(engine.snapshot().courseId, 'c2');
  assert.equal(engine.ai.id, 'c2-ai', '未显式覆盖的 AI 默认应跟随目标大关');
  assert.equal(engine.ai.active, true, 'AI 激活状态仍跨房间保留');

  engine.retry('跨房重试');
  assert.equal(engine.room.id, 'b1');
  assert.equal(engine.course.id, 'c2');
  assert.equal(engine.ai.id, 'c2-ai');
});

test('未加载房间的缺失插件/越界不阻塞当前房间，加载坏房间时才失败', () => {
  const missing = room('missing-room', [object('unknown', 'missing.plugin', 2, 2)]);
  const outside = room('outside-room', [object('far', 'common.coin', 99, 99)]);
  const p = project([course('c1', [room('ok')]), course('c2', [missing, outside])]);
  const engine = new Engine(p, 'c1', 'ok');
  assert.equal(engine.room.id, 'ok');
  engine.update(1 / 120, {});
  assert.equal(engine.deaths, 0);

  assert.throws(
    () => engine.loadRoom('missing-room', 'missing-room-entry', resources()),
    /缺少功能模块/,
  );
  assert.equal(engine.room.id, 'ok', '加载失败不应切换当前房间');
  assert.throws(() => engine.loadRoom('outside-room', 'outside-room-entry', resources()), /越界/);
  assert.equal(engine.room.id, 'ok');
});

test('显式试玩背包是进入时道具的完整覆盖，不叠加项目初始道具', () => {
  const p = project([course('c1', [room('r1')])], {
    itemState: { version: 1, initial: { 'item.coffee': 2, 'item.calculator': 1 } },
  });
  const configured = new Engine(p, 'c1', 'r1', undefined, {
    developerMode: true,
    playtest: { mode: 'configured', items: ['item.icedTea'] },
  });
  assert.deepEqual(configured.items, { 'item.icedTea': 1 });

  const empty = new Engine(p, 'c1', 'r1', undefined, {
    developerMode: true,
    playtest: { mode: 'configured', items: [] },
  });
  assert.deepEqual(empty.items, {}, '勾选为空时不应携带项目初始道具');

  const legacy = new Engine(p, 'c1', 'r1', undefined, {
    developerMode: true,
    playtest: { mode: 'legacy-all', items: [] },
  });
  const all = Registry.all()
    .filter((definition) => definition.item)
    .map((definition) => definition.type);
  assert.deepEqual(Object.keys(legacy.items).sort(), all.slice().sort());
  assert.equal(legacy.items['item.coffee'], 1, '旧版全道具语义不继承初始数量');

  const production = new Engine(p, 'c1', 'r1');
  assert.deepEqual(production.items, { 'item.coffee': 2, 'item.calculator': 1 });
});

test('ItemState 恢复与 credited / 道具重收集保持一致', () => {
  const p = project([
    course('c1', [
      room('r1', [object('coffee', 'item.coffee', 3, 8), object('tea', 'item.icedTea', 5, 8)]),
    ]),
  ]);
  const engine = new Engine(p, 'c1', 'r1');
  const coffee = engine.room.objects.find((o) => o.id === 'coffee');
  const tea = engine.room.objects.find((o) => o.id === 'tea');
  engine.collect(coffee);
  const saved = engine.itemState();
  assert.deepEqual(saved, {
    version: 1,
    items: { 'item.coffee': 1 },
    collected: ['r1/coffee'],
  });

  engine.collect(tea);
  assert.deepEqual(engine.itemState().collected.sort(), ['r1/coffee', 'r1/tea']);
  engine.restoreItemState(saved);
  assert.deepEqual(engine.items, { 'item.coffee': 1 });
  assert.deepEqual(engine.itemState().collected, ['r1/coffee']);
  assert.equal(engine.credited.has('r1/tea'), false, '快照未收集的道具恢复为可重新收集');

  engine.collect(tea);
  assert.equal(engine.items['item.icedTea'], 1);
  assert.equal(
    engine.itemState().collected.filter((key) => key === 'r1/tea').length,
    1,
    '重收集不应产生重复收集键',
  );

  engine.restoreItemState({ version: 1, items: {}, collected: [] });
  assert.deepEqual(engine.items, {});
  assert.deepEqual(engine.itemState().collected, []);
  assert.equal(engine.credited.has('r1/coffee'), false);
  engine.collect(coffee);
  assert.equal(engine.items['item.coffee'], 1, '恢复为空后道具可重新收集');

  const coin = { ...object('coin-x', 'common.coin', 7, 8), type: 'common.coin' };
  engine.collect(coin);
  assert.ok(engine.credited.has('r1/coin-x'));
  engine.restoreItemState({ version: 1, items: {}, collected: [] });
  assert.equal(engine.credited.has('r1/coin-x'), true, '非道具收集物不属于道具恢复合同');
});

test('checkpoint 回退同时恢复道具与已收集键，之后可重新收集', () => {
  const p = project([
    course('c1', [
      room('r1', [
        object('cp', 'common.checkpoint', 2, 8),
        object('coffee', 'item.coffee', 3, 8),
        object('tea', 'item.icedTea', 5, 8),
      ]),
    ]),
  ]);
  const engine = new Engine(p, 'c1', 'r1');
  const coffee = engine.room.objects.find((o) => o.id === 'coffee');
  const tea = engine.room.objects.find((o) => o.id === 'tea');
  engine.collect(coffee);
  engine.setCheckpoint(engine.room.objects.find((o) => o.id === 'cp'));
  engine.collect(tea);
  assert.equal(engine.items['item.icedTea'], 1);

  engine.retry('测试存档点');
  assert.deepEqual(engine.items, { 'item.coffee': 1 });
  assert.deepEqual(engine.itemState().collected, ['r1/coffee'], '快照后的道具收集键应一并回退');
  assert.equal(engine.credited.has('r1/tea'), false);

  engine.collect(tea);
  assert.equal(engine.items['item.icedTea'], 1);
  assert.equal(engine.itemState().collected.filter((key) => key === 'r1/tea').length, 1);
});

test('validateRoom 只校验目标房间并保留旧单大关行为', () => {
  const p = M.example();
  assert.deepEqual(M.validateRoom(p, 'jet-room', { play: true }).errors, []);
  assert.deepEqual(M.validateRoom(p, 'missing-room', { play: true }).errors, [
    '目标房间不存在：missing-room',
  ]);
  const engine = new Engine(p, 'physics');
  assert.equal(engine.course.id, 'physics');
  assert.equal(engine.room.id, 'jet-room');
});
