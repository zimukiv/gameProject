'use strict';
// Stage 1: RoomLab editor 2.5.5 export compatibility on top of the custom DDL1.3 project.
// Runs directly against the versioned runtime sources (no editor, no Unity build).
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const M = require('../src/project/model.cjs'),
  Registry = require('../src/plugins/registry.cjs'),
  Collision = require('../src/project/collision.cjs'),
  Archive = require('../src/project/archive.cjs'),
  Import = require('../src/runtime/project-import.cjs'),
  { Engine } = require('../src/runtime/engine.cjs');
const readFixture = (name) =>
  JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));
const objectsOf = (p) => p.courses.flatMap((c) => c.rooms.flatMap((r) => r.objects || []));
const customProject = () =>
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'project.json'), 'utf8'));
test('legacy 2.5.2 baseline fixture migrates once to 2.5.5 friend profile without mutating the source', () => {
  const source = readFixture('legacy-252-project.json'),
    original = JSON.stringify(source),
    p = M.migrate(source);
  assert.equal(JSON.stringify(source), original);
  assert.equal(p.compatibility.runtime, '2.5.5');
  assert.equal(p.compatibility.importedProfile, 'friend-2.5.2');
  assert.equal(p.pluginManifest['common.checkpoint'], '1.0.0');
  assert.equal(p.pluginManifest['physics.rail'], '2.0.0');
  const jet = objectsOf(p).find((o) => o.id === 'jet-side-legacy'),
    rail = objectsOf(p).find((o) => o.type === 'physics.rail'),
    cp = objectsOf(p).find((o) => o.id === 'cp-legacy');
  assert.equal(jet.collision, false);
  assert.equal(jet.trigger.mode, 'region');
  assert.equal(rail.params.sideTrigger, true);
  assert.equal(cp.collision, false);
  assert.equal(cp.trigger.mode, 'region');
});
test('migration is idempotent and keeps user edits to collision and sideTrigger', () => {
  const once = M.migrate(readFixture('legacy-252-project.json')),
    twice = M.migrate(once);
  assert.deepEqual(twice, once);
  once.courses[0].rooms[2].objects.find((o) => o.type === 'physics.rail').params.sideTrigger = false;
  once.courses[0].rooms[0].objects.find((o) => o.id === 'jet-side-legacy').collision = true;
  assert.deepEqual(M.migrate(once), once);
});
test('2.5.5 export fixture is not reinterpreted as the friend profile', () => {
  const p = M.migrate(readFixture('export-255-project.json'));
  assert.equal(p.compatibility.runtime, '2.5.5');
  assert.equal(p.compatibility.importedProfile, undefined);
  assert.equal(objectsOf(p).find((o) => o.id === 'cp-255').collision, false);
  assert.equal(objectsOf(p).find((o) => o.type === 'physics.rail').params.sideTrigger, false);
  assert.equal(p.pluginManifest['physics.rail'], '2.0.0');
});
test('the marked custom project is never migrated again and keeps every collision/trigger value', () => {
  const source = customProject(),
    before = objectsOf(source),
    migrated = M.migrate(source),
    after = objectsOf(migrated);
  assert.equal(source.compatibility.runtime, '2.5.5');
  assert.equal(migrated.compatibility.importedProfile, 'friend-2.5.2');
  assert.equal(after.length, before.length);
  for (let i = 0; i < before.length; i++) {
    if (before[i].type === 'physics.jet' || before[i].type === 'physics.rail')
      assert.deepEqual(after[i].collision, before[i].collision, before[i].id);
    assert.deepEqual(after[i].trigger, before[i].trigger, before[i].id);
    if (before[i].type === 'physics.rail')
      assert.deepEqual(after[i].params.sideTrigger, before[i].params.sideTrigger, before[i].id);
  }
  assert.equal(migrated.pluginManifest['physics.rail'], '2.0.0');
  assert.equal(migrated.pluginManifest['common.checkpoint'], '1.0.0');
  assert.deepEqual(Collision.portable(source), Collision.portable(source));
});
test('sideTrigger defaults off, exports as a module dependency, and only extends side contact when enabled', () => {
  const p = M.example(),
    rail = Registry.instantiate(p, 'physics.rail', 'side', 7, 10);
  assert.equal(rail.params.sideTrigger, false);
  assert.equal(Registry.get('physics.rail').version, '2.0.0');
  assert.deepEqual(Registry.get('physics.rail').compatibleMajors, ['1']);
  const rect = { x: 224, y: 320, w: 32, h: 32 },
    side = { x: 200, y: 320, w: 24, h: 28, grounded: true, vy: 0 };
  assert.equal(Registry.get('physics.rail').triggerOccupied({}, { ...rail }, side, rect, 348), undefined);
  rail.params.sideTrigger = true;
  assert.equal(Registry.get('physics.rail').triggerOccupied({}, rail, side, rect, 348), true);
  p.courses[0].rooms[0].objects.push(rail);
  assert.equal(Archive.unpack(Archive.pack(p, new Map())).project.pluginManifest['physics.rail'], '2.0.0');
});
test('solid checkpoints respawn on top, hollow 2.5.5 checkpoints respawn inside, and resources restore on retry', () => {
  const p = M.example(),
    g = new Engine(p),
    solid = {
      id: 'cp-solid',
      type: 'common.checkpoint',
      x: 2,
      y: 2,
      w: 1,
      h: 1,
      collision: true,
      params: {},
      trigger: { mode: 'region' },
    },
    hollow = { ...solid, id: 'cp-hollow', collision: false };
  g.colliders = () => [];
  g.saveCheckpoint(solid);
  assert.deepEqual([g.checkpoint.spawn.x, g.checkpoint.spawn.y], [68, 2 * 32 - 28]);
  assert.equal(g.checkpoint.id, 'cp-solid');
  g.saveCheckpoint(hollow);
  assert.deepEqual([g.checkpoint.spawn.x, g.checkpoint.spawn.y], [68, 2 * 32 + 4]);
  assert.equal(g.checkpoint.id, 'cp-hollow');
  const snapshot = { tokens: g.tokens, charges: g.charges, score: g.score };
  g.tokens += 25;
  g.charges += 2;
  g.score += 5000;
  g.retry();
  assert.equal(g.tokens, snapshot.tokens);
  assert.equal(g.charges, snapshot.charges);
  assert.equal(g.score, snapshot.score);
  assert.equal(g.checkpoint.spawn.objectId, undefined);
});
test('unknown module major versions are rejected instead of guessed', () => {
  const friend = M.migrate(readFixture('legacy-252-project.json')),
    cp = objectsOf(friend).find((o) => o.type === 'common.checkpoint');
  friend.pluginManifest['common.checkpoint'] = '8.0.0';
  assert.ok(Registry.validateObject(friend, cp).some((e) => e.includes('主版本')));
  const rail = objectsOf(friend).find((o) => o.type === 'physics.rail');
  friend.pluginManifest['physics.rail'] = '3.0.0';
  assert.ok(Registry.validateObject(friend, rail).some((e) => e.includes('主版本')));
});
test('JSON and ZIP imports validate and load without writing back, and bad files fail explicitly', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roomlab255-')),
    jsonPath = path.join(dir, 'project.json'),
    zipPath = path.join(dir, 'project.zip'),
    badPath = path.join(dir, 'project.json.bak'),
    fixture = readFixture('export-255-project.json');
  fs.writeFileSync(jsonPath, JSON.stringify(fixture));
  fs.writeFileSync(zipPath, Archive.pack(M.example(), new Map()));
  fs.writeFileSync(badPath, '{}');
  const jsonLoad = Import.loadProjectFile(jsonPath);
  assert.equal(jsonLoad.source.kind, 'json');
  assert.equal(jsonLoad.project.courses.length, fixture.courses.length);
  assert.equal(fs.readFileSync(jsonPath, 'utf8'), JSON.stringify(fixture));
  const zipLoad = Import.loadProjectFile(zipPath);
  assert.equal(zipLoad.source.kind, 'zip');
  assert.equal(zipLoad.project.courses.length, 1);
  assert.throws(() => Import.loadProjectFile(path.join(dir, 'missing.json')), /找不到项目文件/);
  assert.throws(() => Import.loadProjectFile(badPath), /不支持的项目文件类型/);
  fs.writeFileSync(badPath + '.json', '{not json');
  assert.throws(() => Import.loadProjectFile(badPath + '.json'), /JSON 解析失败/);
  const bad = JSON.parse(JSON.stringify(fixture));
  bad.courses[0].rooms[0].objects[0].type = 'physics.unknown';
  fs.writeFileSync(path.join(dir, 'unknown.json'), JSON.stringify(bad));
  assert.throws(() => Import.loadProjectFile(path.join(dir, 'unknown.json')), /缺少功能模块/);
});
