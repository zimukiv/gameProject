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
  F.writeProject(
    file,
    p,
    [...seed.files].map(([path, bytes]) => ({ path, bytes })),
  );
  const read = F.readProject(file);
  assert.deepEqual(read.project, p);
  assert.equal(read.files.length, 9);
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
