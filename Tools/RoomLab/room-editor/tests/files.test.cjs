'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path'),
  M = require('../src/project/model.cjs'),
  { seeds } = require('../src/assets/seeds.cjs'),
  F = require('../src/desktop/project-files.cjs');
test('native folder save/reopen preserves artwork and data on Chinese space paths', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'room-lab-中文-')),
    file = path.join(root, '测试 项目.json'),
    p = M.example(),
    seed = seeds();
  p.assets = seed.assets;
  p.courses[0].artBindings = seed.bindings;
  p.courses[0].rooms[0].graph = { x: 321, y: -54 };
  p.courses[0].rooms[1].graph = { x: 321, y: -54 };
  F.writeProject(
    file,
    p,
    [...seed.files].map(([path, bytes]) => ({ path, bytes })),
  );
  const read = F.readProject(file);
  assert.deepEqual(read.project, p);
  assert.deepEqual(read.project.courses[0].rooms[0].graph, { x: 321, y: -54 });
  assert.deepEqual(read.project.courses[0].rooms[1].graph, { x: 321, y: -54 });
  assert.equal(read.files.length, seed.assets.length);
  p.notes = '第二次保存';
  F.writeProject(file, p, read.files);
  assert.ok(fs.readdirSync(path.join(root, '.project-backups')).length);
});
test('native file guard refuses path traversal and preflights conflicting artwork', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'room-safe-'));
  assert.throws(() => F.inside(root, 'assets/../outside'));
  assert.throws(() => F.inside(root, 'C:/outside.png'));
  const file = path.join(root, 'project.json'),
    p = M.example(),
    seed = seeds();
  p.assets = seed.assets;
  const files = [...seed.files].map(([path, bytes]) => ({ path, bytes }));
  F.writeProject(file, p, files);
  const before = fs.readFileSync(file, 'utf8');
  files[0].bytes = new Uint8Array([1, 2, 3]);
  assert.throws(() => F.writeProject(file, p, files), /已有素材内容不同/);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('save-as can replace conflicting artwork and keeps the previous bytes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'room-replace-')),
    file = path.join(root, 'project.json'),
    p = M.example(),
    seed = seeds();
  p.assets = seed.assets;
  const files = [...seed.files].map(([path, bytes]) => ({ path, bytes })),
    original = new Uint8Array(seed.files.get(files[0].path));
  F.writeProject(file, p, files);
  files[0].bytes = new Uint8Array([9, 9, 9, 9]);

  // Default callers still get the hard failure, and nothing is written yet.
  let conflict = null;
  try {
    F.writeProject(file, p, files);
  } catch (error) {
    conflict = error;
  }
  assert.equal(conflict && conflict.code, 'asset-conflict');
  assert.equal(conflict.assetConflicts[0].path, files[0].path);
  assert.deepEqual([...fs.readFileSync(path.join(root, files[0].path))], [...original]);

  // Confirmed save replaces the file and keeps the old bytes recoverable.
  F.writeProject(file, p, files, { replaceAssets: true });
  assert.deepEqual([...fs.readFileSync(path.join(root, files[0].path))], [9, 9, 9, 9]);
  const kept = fs
    .readdirSync(path.join(root, '.project-backups'))
    .filter((name) => name.startsWith('assets-'));
  assert.equal(kept.length, 1);
  assert.deepEqual(
    [...fs.readFileSync(path.join(root, '.project-backups', kept[0], files[0].path))],
    [...original],
  );
});

test('desktop save flow asks before replacing and stays put when declined', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'room-confirm-')),
    file = path.join(root, 'project.json'),
    p = M.example(),
    seed = seeds();
  p.assets = seed.assets;
  const files = [...seed.files].map(([path, bytes]) => ({ path, bytes })),
    original = new Uint8Array(seed.files.get(files[0].path));
  F.writeProject(file, p, files);
  files[0].bytes = new Uint8Array([7, 7, 7, 7]);

  let asked = 0;
  const declined = await F.writeProjectWithConfirmation(file, p, files, () => {
    asked++;
    return false;
  });
  assert.equal(declined, null);
  assert.equal(asked, 1);
  assert.deepEqual([...fs.readFileSync(path.join(root, files[0].path))], [...original]);

  const accepted = await F.writeProjectWithConfirmation(file, p, files, (conflicts) => {
    asked++;
    assert.equal(conflicts[0].path, files[0].path);
    return true;
  });
  assert.ok(accepted && accepted.file === file);
  assert.equal(asked, 2);
  assert.deepEqual([...fs.readFileSync(path.join(root, files[0].path))], [7, 7, 7, 7]);

  // A clean save never asks.
  const again = await F.writeProjectWithConfirmation(file, p, files, () => {
    throw new Error('should not ask');
  });
  assert.ok(again);
});
