'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict');
const M = require('../src/project/model.cjs'),
  R = require('../src/plugins/registry.cjs');
const Archive = require('../src/project/archive.cjs');
function friend() {
  const p = M.example();
  delete p.compatibility;
  const r = p.courses[0].rooms[0];
  r.objects.push({
    id: 'cp-legacy',
    type: 'common.checkpoint',
    x: 5,
    y: 13,
    w: 1,
    h: 1,
    collision: false,
    params: {},
    assetOverrides: {},
  });
  const jet = R.instantiate(p, 'physics.jet', 'side-legacy', 8, 10);
  jet.params.direction = 'right';
  jet.params.launchX = 900;
  jet.params.launchY = 0;
  const rail = R.instantiate(p, 'physics.rail', 'rail-legacy', 12, 10);
  r.objects.push(jet, rail);
  return p;
}
test('legacy friend signature materializes behavior and module dependency once without mutating source', () => {
  const source = friend(),
    original = JSON.stringify(source),
    p = M.migrate(source);
  assert.equal(JSON.stringify(source), original);
  assert.equal(p.compatibility.runtime, '2.5.5');
  assert.equal(p.compatibility.importedProfile, 'friend-2.5.2');
  assert.equal(p.pluginManifest['common.checkpoint'], '1.0.0');
  assert.equal(p.pluginManifest['physics.rail'], '2.0.0');
  const objects = p.courses[0].rooms[0].objects;
  assert.equal(objects.find((o) => o.id === 'side-legacy').collision, false);
  assert.equal(objects.find((o) => o.id === 'side-legacy').trigger.mode, 'region');
  assert.equal(objects.find((o) => o.id === 'rail-legacy').params.sideTrigger, true);
  assert.equal(objects.find((o) => o.id === 'cp-legacy').collision, false);
  objects.find((o) => o.id === 'side-legacy').collision = true;
  objects.find((o) => o.id === 'rail-legacy').params.sideTrigger = false;
  assert.deepEqual(M.migrate(p), p);
  assert.deepEqual(Archive.unpack(Archive.pack(p, new Map())).project, p);
});
test('ordinary old projects retain their collision and rail behavior; new checkpoints do not imply legacy rules', () => {
  const p = M.example();
  delete p.compatibility;
  const jet = R.instantiate(p, 'physics.jet', 'ordinary-side', 8, 10);
  jet.params.direction = 'left';
  p.courses[0].rooms[0].objects.push(jet);
  const migrated = M.migrate(p);
  assert.equal(migrated.compatibility.importedProfile, undefined);
  assert.equal(migrated.courses[0].rooms[0].objects.find((o) => o.id === jet.id).collision, true);
  const fresh = M.example();
  fresh.courses[0].rooms[0].objects.push(
    R.instantiate(fresh, 'common.checkpoint', 'new-cp', 5, 13),
  );
  assert.equal(M.migrate(fresh).compatibility.importedProfile, undefined);
});
test('newly placed checkpoint exports an explicit module dependency', () => {
  const p = M.example();
  p.courses[0].rooms[0].objects.push(R.instantiate(p, 'common.checkpoint', 'new-cp', 5, 13));
  const { unzipSync, strFromU8 } = require('fflate');
  const saved = JSON.parse(strFromU8(unzipSync(Archive.pack(p, new Map()))['project.json']));
  assert.equal(saved.pluginManifest['common.checkpoint'], '1.0.0');
});
test('side-trigger rails declare the new major while unsupported custom module versions are preserved', () => {
  const p = M.example();
  p.courses[0].rooms[0].objects.push(R.instantiate(p, 'physics.rail', 'side', 7, 10));
  p.courses[0].rooms[0].objects.at(-1).params.sideTrigger = true;
  const saved = Archive.unpack(Archive.pack(p, new Map())).project;
  assert.equal(saved.pluginManifest['physics.rail'], '2.0.0');
  const custom = friend();
  custom.pluginManifest['common.checkpoint'] = '8.0.0';
  assert.equal(M.migrate(custom).pluginManifest['common.checkpoint'], '8.0.0');
  assert.ok(
    R.validateObject(
      M.migrate(custom),
      custom.courses[0].rooms[0].objects.find((o) => o.type === 'common.checkpoint'),
    ).some((e) => e.includes('主版本')),
  );
});
