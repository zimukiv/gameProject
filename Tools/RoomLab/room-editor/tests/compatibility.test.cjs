'use strict';
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  { test } = require('node:test'),
  { zipSync } = require('fflate'),
  M = require('../src/project/model.cjs'),
  Archive = require('../src/project/archive.cjs'),
  { add } = require('../src/project/courses.cjs');
const oldRoot = path.resolve(__dirname, 'fixtures/compat-2.3.1'),
  oldM = require(path.join(oldRoot, 'src/project/model.cjs')),
  oldArchive = require(path.join(oldRoot, 'src/project/archive.cjs'));
test('2.3.1 real JSON and asset ZIP round-trip through 2.4 without dropping rooms, IDs, links or sprites', () => {
  const old = JSON.parse(fs.readFileSync(path.join(oldRoot, 'physics/project.json'), 'utf8'));
  const migrated = M.migrate(old),
    files = new Map(
      old.assets.map((a) => [
        a.path,
        new Uint8Array(fs.readFileSync(path.join(oldRoot, 'physics', a.path))),
      ]),
    );
  assert.deepEqual(M.validate(migrated).errors, []);
  assert.equal(migrated.version, 2);
  assert.deepEqual(require('../src/project/collision.cjs').portable(migrated).courses, old.courses);
  const zip = Archive.pack(migrated, files),
    again = oldArchive.unpack(zip);
  assert.deepEqual(
    again.project.courses,
    require('../src/project/collision.cjs').portable(migrated).courses,
  );
  assert.equal(again.files.size, files.size);
  assert.deepEqual(oldM.validate(again.project).errors, []);
  for (const [p, b] of files) assert.deepEqual(again.files.get(p), b);
});
test('new multiple-course export and saved traces remain readable by 2.3.1; sync state never enters project format', () => {
  const p = M.example(),
    seed = require('../src/assets/seeds.cjs').seeds();
  p.assets = seed.assets;
  p.courses[0].artBindings = seed.bindings;
  add(p);
  const loaded = oldArchive.unpack(Archive.pack(p, seed.files));
  assert.equal(loaded.project.courses.length, 2);
  assert.equal(loaded.project.id, p.id);
  assert.deepEqual(oldM.validate(loaded.project).errors, []);
  for (const key of ['cloud', 'workspaceKey', 'accessToken', 'worktrees', 'readRevision'])
    assert.equal(key in loaded.project, false);
});
