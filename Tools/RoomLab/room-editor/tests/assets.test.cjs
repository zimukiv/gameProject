'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  M = require('../src/project/model.cjs'),
  { seeds } = require('../src/assets/seeds.cjs'),
  A = require('../src/assets/manager.cjs'),
  Archive = require('../src/project/archive.cjs'),
  Registry = require('../src/plugins/registry.cjs');
test('project zip includes referenced artwork and survives moving/importing', () => {
  const p = M.example(),
    seed = seeds();
  p.assets = seed.assets;
  p.courses[0].artBindings = seed.bindings;
  const zip = Archive.pack(p, seed.files),
    unpacked = Archive.unpack(zip);
  assert.deepEqual(unpacked.project, p);
  assert.equal(unpacked.files.size, p.assets.length);
  assert.deepEqual([...unpacked.files.values()][0], [...seed.files.values()][0]);
});
test('asset replacement keeps stable ID and all instance/course references', async () => {
  const p = M.example(),
    seed = seeds();
  p.assets = seed.assets;
  p.courses[0].artBindings = seed.bindings;
  const store = { project: p, assetFiles: seed.files, change: (fn) => fn(p) },
    before = p.assets.find((a) => a.id === 'seed-jet-idle');
  p.courses[0].rooms[0].objects[0].assetOverrides.idle = before.id;
  const bytes = new TextEncoder().encode(
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="red"/></svg>',
  );
  const after = await A.importAsset(store, {
    name: '替换.svg',
    bytes,
    width: 32,
    height: 32,
    replaceId: before.id,
  });
  assert.equal(after.id, before.id);
  assert.notEqual(after.path, before.path);
  assert.equal(A.usage(p, after.id).length, 2);
  assert.ok(store.assetFiles.has(before.path));
  assert.ok(store.assetFiles.has(after.path));
});
test('changing a definition affects newly created instances and does not overwrite existing parameters', () => {
  const p = M.example(),
    old = p.courses[0].rooms[0].objects[0];
  p.blockDefaults['physics.jet'] = { name: '测试喷气', params: { launchY: -1200 } };
  const fresh = Registry.instantiate(p, 'physics.jet', 'new', 3, 4);
  assert.equal(fresh.params.launchY, -1200);
  assert.equal(fresh.name, '测试喷气');
  assert.equal(old.params.launchY, -900);
  assert.equal(Registry.params(p, old).launchY, -900);
});
test('bad paths and missing asset bytes prevent unsafe/corrupt project packs', () => {
  const p = M.example();
  p.assets = [{ id: 'a', name: 'a', path: 'assets\\evil.svg' }];
  assert.ok(M.validate(p).errors.length);
  assert.throws(() => Archive.pack(p, new Map()));
  const seed = seeds(),
    q = M.example();
  q.assets = seed.assets;
  assert.throws(() => Archive.pack(q, new Map()), /缺少素材/);
});
test('same-theme courses isolate custom assets and defaults while retaining theme artwork', () => {
  const p = M.themedExample(),
    original = p.courses[1],
    second = require('../src/project/courses.cjs').add(p, 'calculus'),
    seed = seeds({ allThemes: true }),
    type = 'calculus.integral';
  const base = seed.assets.find((a) => a.id === 'seed-calculus-integral'),
    custom = { ...base, id: 'custom-integral', courseId: original.id, path: 'assets/custom.svg' };
  p.assets = [...seed.assets, custom];
  seed.files.set(custom.path, seed.files.get(base.path));
  p.blockDefaults[type] = { params: { cooldown: 2 } };
  original.blockDefaults = {
    [type]: { name: '本关积分板', params: { range: 20 }, assets: { idle: custom.id } },
  };
  const catalog = require('../src/assets/catalog.cjs');
  assert.deepEqual(
    catalog.available(p, second.id, type).map((a) => a.id),
    [base.id],
  );
  assert.deepEqual(
    catalog.available(p, original.id, type).map((a) => a.id),
    [base.id, custom.id],
  );
  assert.equal(A.usage(p, custom.id).length, 1);
  const loaded = Archive.unpack(Archive.pack(p, seed.files)).project;
  const placed = Registry.instantiate(loaded, type, 'a', 4, 4, loaded.courses[1]),
    other = Registry.instantiate(loaded, type, 'b', 4, 4, loaded.courses.at(-1));
  assert.equal(placed.name, '本关积分板');
  assert.equal(placed.params.range, 20);
  assert.equal(placed.params.cooldown, 2);
  assert.deepEqual(placed.assetOverrides, { idle: custom.id });
  assert.notEqual(other.params.range, 20);
  assert.deepEqual(other.assetOverrides, {});
  assert.equal(Registry.params(loaded, loaded.courses[1].rooms[0].objects[0]).range, 12);
});
