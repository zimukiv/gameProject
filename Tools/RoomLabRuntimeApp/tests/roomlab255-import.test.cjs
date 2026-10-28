'use strict';
// Stage-1 repair: ZIP container integrity and cross-implementation import.
// The runtime ships the editor's fflate 0.8.2 build; the reviewer's cross-check packs with the
// read-only editor `room-editor/src/project/archive.cjs` and imports with the runtime.
const test = require('node:test'),
  assert = require('node:assert/strict'),
  crypto = require('node:crypto'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const M = require('../src/project/model.cjs'),
  Archive = require('../src/project/archive.cjs'),
  Import = require('../src/runtime/project-import.cjs'),
  { Engine } = require('../src/runtime/engine.cjs');
const editorRoot = path.resolve(__dirname, '../../../../room-editor'),
  editorArchivePath = path.join(editorRoot, 'src/project/archive.cjs'),
  fixturePath = path.join(__dirname, 'fixtures/export-255-project.json');
let workDir;
const tempDir = () => workDir || (workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roomlab255-import-')));
const fixture = () => JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const write = (name, bytes) => {
  const file = path.join(tempDir(), name);
  fs.writeFileSync(file, bytes);
  return file;
};
// Rewrites only the declared sizes in the local header and the central directory, so the test
// can claim a size the payload never produces without changing the actual archive layout.
function declaredSizes(zipBytes, sizes) {
  const b = Buffer.from(zipBytes),
    wanted = new Map(Object.entries(sizes));
  for (let at = 0; at + 30 <= b.length; at++) {
    if (b.readUInt32LE(at) !== 0x04034b50) continue;
    const nameLen = b.readUInt16LE(at + 26),
      name = b.toString('utf8', at + 30, at + 30 + nameLen);
    if (!wanted.has(name)) continue;
    const patch = wanted.get(name);
    if (patch.compressed != null) b.writeUInt32LE(patch.compressed, at + 18);
    if (patch.size != null) b.writeUInt32LE(patch.size, at + 22);
  }
  for (let at = 0; at + 46 <= b.length; at++) {
    if (b.readUInt32LE(at) !== 0x02014b50) continue;
    const nameLen = b.readUInt16LE(at + 28),
      extraLen = b.readUInt16LE(at + 30),
      commentLen = b.readUInt16LE(at + 32),
      name = b.toString('utf8', at + 46, at + 46 + nameLen);
    if (wanted.has(name)) {
      const patch = wanted.get(name);
      if (patch.compressed != null) b.writeUInt32LE(patch.compressed, at + 20);
      if (patch.size != null) b.writeUInt32LE(patch.size, at + 24);
    }
    at += 46 + nameLen + extraLen + commentLen - 1;
  }
  return b;
}
test('the real editor archive packs a 2.5.5 ZIP that the runtime imports and runs', () => {
  assert.ok(fs.existsSync(editorArchivePath), 'read-only editor archive must exist for the cross-implementation check');
  const EditorArchive = require(editorArchivePath),
    editorFflate = require.resolve('fflate', { paths: [path.dirname(editorArchivePath)] });
  assert.ok(editorFflate.startsWith(editorRoot), 'editor archive must use its own 0.8.2 dependency, not this project');
  assert.ok(!editorFflate.includes('gameProject-roomlab255'), 'editor archive must not resolve anything from this workspace');
  const source = fixture(),
    zip = EditorArchive.pack(source, new Map()),
    file = write('editor-255.zip', zip),
    original = fs.readFileSync(file),
    loaded = Import.loadProjectFile(file);
  assert.equal(loaded.source.kind, 'zip');
  assert.equal(loaded.project.courses.length, source.courses.length);
  assert.equal(
    loaded.project.courses[0].rooms.length,
    source.courses[0].rooms.length
  );
  assert.ok(new Engine(loaded.project).room, 'imported project must build a usable engine');
  loaded.close();
  assert.deepEqual(fs.readFileSync(file), original, 'import must never rewrite the source archive');
});
test('corrupt, truncated and CRC-damaged ZIPs are rejected instead of accepted', () => {
  const zip = Buffer.from(Archive.pack(M.example(), new Map()));
  assert.ok(Archive.unpack(zip).project.courses.length);
  assert.throws(() => Archive.unpack(zip.subarray(0, Math.floor(zip.length * 0.6))), /项目包/);
  const flipped = Buffer.from(zip);
  flipped[Math.floor(flipped.length / 2)] ^= 0xff;
  assert.throws(() => Archive.unpack(flipped), /项目包/);
  assert.throws(() => Archive.unpack(Buffer.from('not a zip at all')), /项目包/);
  const empty = Buffer.alloc(22);
  empty.writeUInt32LE(0x06054b50, 0);
  assert.throws(() => Archive.unpack(empty), /项目包/);
});
test('a declared size above the per-entry cap is refused before inflating', () => {
  const zip = Buffer.from(Archive.pack(M.example(), new Map())),
    lying = declaredSizes(zip, { 'project.json': { size: 34 * 1024 * 1024 } });
  assert.throws(() => Archive.unpack(lying), /容量超过限制/);
});
test('a declared total above the archive cap is refused before inflating the last entry', () => {
  const F = require('../vendor/fflate/browser.cjs'),
    entries = {};
  for (let i = 0; i < 6; i++) entries['assets/f' + i] = F.strToU8('x'.repeat(1024));
  entries['project.json'] = F.strToU8(JSON.stringify(M.example()));
  const sizes = {};
  for (let i = 0; i < 6; i++) sizes['assets/f' + i] = { size: 25 * 1024 * 1024 };
  assert.throws(() => Archive.unpack(declaredSizes(F.zipSync(entries, { level: 0 }), sizes)), /容量超过限制/);
});
test('a declared size larger or smaller than the real payload is refused', () => {
  const zip = Buffer.from(Archive.pack(M.example(), new Map())),
    real = Archive.unpack(zip).project;
  assert.ok(real.courses.length);
  const bigger = declaredSizes(zip, { 'project.json': { size: 1024 * 1024 } });
  assert.throws(() => Archive.unpack(bigger), /项目包/);
  const smaller = declaredSizes(zip, { 'project.json': { size: 16 } });
  assert.throws(() => Archive.unpack(smaller), /项目包/);
});
test('the runtime has no hand-written ZIP reader and pins fflate 0.8.2 by hash', () => {
  assert.equal(fs.existsSync(path.join(__dirname, '../src/project/zip.cjs')), false, 'src/project/zip.cjs must stay deleted');
  const archiveSource = fs.readFileSync(path.join(__dirname, '../src/project/archive.cjs'), 'utf8');
  assert.ok(archiveSource.includes("require('../../vendor/fflate/browser.cjs')"), 'archive.cjs must load the vendored fflate build');
  assert.ok(!/require\('fflate'\)/.test(archiveSource), 'archive.cjs must not resolve a machine-wide fflate');
  const vendor = path.join(__dirname, '../vendor/fflate'),
    hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(vendor, 'browser.cjs'))).digest('hex').toUpperCase();
  assert.equal(hash, '736D35B0D9319FDA3C36630512ED669E4B68C2EBD141C317A3BF72A3FAC35259');
  assert.ok(fs.existsSync(path.join(vendor, 'LICENSE')), 'the vendored MIT licence must ship too');
  assert.match(fs.readFileSync(path.join(vendor, 'README.md'), 'utf8'), /fflate`? ?\|? ?0\.8\.2/);
});
