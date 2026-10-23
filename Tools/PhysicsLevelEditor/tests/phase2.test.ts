import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateLevel } from '../src/model/validate.ts';
import { commit, current, dirty, duplicate, groupObjects, history, markSaved, redo, serialized,
  setComponent, setObject, undo, worldToScreen, screenToWorld, colliderCorners, colliderWorldCorners } from '../src/editor/document.ts';
import { LevelFiles } from '../src/editor/persistence.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const sourcePath = resolve(root, 'Levels/Physics/Level1.phase1.json');
const source = () => validateLevel(JSON.parse(requireFile));
const requireFile = await readFile(sourcePath, 'utf8');

test('Phase 1 sample has three real objects and saves edited force and platform position', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'physics-editor-'));
  try {
    const files = new LevelFiles();
    const opened = await files.open(sourcePath);
    const level = validateLevel(JSON.parse(opened.text));
    assert.deepEqual(level.objects.map(o => o.kind).sort(), ['airVent','platform','token']);
    const vent = level.objects.find(o => o.kind === 'airVent')!;
    const platform = level.objects.find(o => o.kind === 'platform')!;
    const beforeSize = structuredClone(platform.components.find(c => c.collider)!.collider!.size);
    const next = setComponent(level, vent.id, 'physics.airVent', c => { c.airVent!.upwardForce = 23.5; });
    const moved = setObject(next, platform.id, o => { o.localPosition.x += 2.5; });
    const path = join(dir, 'edited.json');
    await files.save(path, serialized(moved), null);
    const reopened = validateLevel(JSON.parse((await files.open(path)).text));
    assert.equal(reopened.objects.find(o => o.id === vent.id)!.components.find(c => c.airVent)!.airVent!.upwardForce, 23.5);
    assert.equal(reopened.objects.find(o => o.id === platform.id)!.localPosition.x, platform.localPosition.x + 2.5);
    assert.deepEqual(reopened.objects.find(o => o.id === platform.id)!.components.find(c => c.collider)!.collider!.size, beforeSize);
    assert.equal(reopened.coverage, 'partial');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('external file conflict is rejected without changing disk', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'physics-editor-'));
  try {
    const path = join(dir, 'level.json');
    await writeFile(path, requireFile);
    const files = new LevelFiles(); const opened = await files.open(path);
    await writeFile(path, requireFile + '\n');
    await assert.rejects(files.save(path, opened.text, opened.fingerprint), /外部|变化/);
    assert.equal(await readFile(path,'utf8'), requireFile + '\n');
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('save-as refuses to replace an unknown existing file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'physics-editor-'));
  try {
    const path = join(dir,'existing.json');
    await writeFile(path,requireFile);
    const files = new LevelFiles();
    await assert.rejects(files.save(path,requireFile,null),/已存在/);
    assert.equal(await readFile(path,'utf8'),requireFile);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('undo, redo, dirty baseline, and redo branch', () => {
  const level = source(); const id = level.objects[0].id;
  let h = history(level);
  h = commit(h, setObject(current(h),id,o => { o.name = 'first edit'; }));
  assert.equal(dirty(h),true);
  h = markSaved(h); assert.equal(dirty(h),false);
  h = commit(h, setObject(current(h),id,o => { o.name = 'second edit'; }));
  h = undo(h); assert.equal(current(h).objects[0].name,'first edit'); assert.equal(dirty(h),false);
  h = redo(h); assert.equal(current(h).objects[0].name,'second edit');
  h = undo(h);
  h = commit(h, setObject(current(h),id,o => { o.name = 'new branch'; }));
  assert.equal(redo(h).index,h.index);
});

test('duplicate changes IDs and remaps copied parent links', () => {
  const level = source(); const first = level.objects[0], second = level.objects[1];
  const grouped = setObject(level, second.id, o => { o.parentId = first.id; });
  const result = duplicate(grouped,[first.id,second.id]);
  const copies = result.level.objects.slice(3);
  assert.notEqual(copies[0].id, first.id);
  assert.equal(copies[1].parentId, copies[0].id);
  assert.equal(new Set(result.level.objects.map(o => o.id)).size,5);
});

test('coordinate conversion and collider geometry keep scale separate', () => {
  const o = source().objects.find(o => o.kind === 'platform')!;
  const v = { zoom: 32, pan: { x: 17, y: -9 } };
  const s = worldToScreen(o.localPosition,v,800,600);
  assert.deepEqual(screenToWorld(s,v,800,600), { x: o.localPosition.x, y: o.localPosition.y });
  const corners = colliderCorners(o);
  assert.equal(Math.abs(corners[1].x-corners[0].x),14);
  assert.equal(o.components.find(c => c.collider)!.collider!.size.x,1);
});

test('grouping preserves world collider bounds for unrotated roots', () => {
  const level = source(); const parent = level.objects.find(o => o.kind === 'platform')!;
  const child = level.objects.find(o => o.kind === 'airVent')!;
  const before = colliderWorldCorners(level,child);
  const grouped = groupObjects(level,[parent.id,child.id]);
  const after = colliderWorldCorners(grouped,grouped.objects.find(o => o.id === child.id)!);
  assert.deepEqual(after,before);
  assert.equal(grouped.objects.find(o => o.id === child.id)!.parentId,parent.id);
});
