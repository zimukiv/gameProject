import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { validateLevel } from '../src/model/validate.ts';
import { colliderWorldCorners, commit, current, duplicate, groupObjects, history, redo, reparentObject, resizeColliderFromWorld,
  serialized, setObject, undo, worldPose } from '../src/editor/document.ts';
import { batchSet, commonValue, isEffectivelyLocked, translateWorld } from '../src/editor/selection.ts';
import { LevelFiles } from '../src/editor/persistence.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const source = validateLevel(JSON.parse(await readFile(resolve(root,'Levels/Physics/Level1.phase1.json'),'utf8')));
const ids = source.objects.map(o => o.id);

test('P3.1: multi translation preserves relative positions and is one undo/redo step', () => {
  const before = source.objects.map(o => ({...o.localPosition}));
  let h = history(source);
  h = commit(h,translateWorld(current(h),ids.slice(0,2),{x:3,y:-2}));
  assert.equal(h.index,1);
  for (let i=0;i<2;i++) {
    assert.equal(current(h).objects[i].localPosition.x,before[i].x+3);
    assert.equal(current(h).objects[i].localPosition.y,before[i].y-2);
  }
  assert.deepEqual(current(h).objects[2].localPosition,before[2]);
  h=undo(h); assert.deepEqual(current(h).objects.map(o=>o.localPosition),before);
  h=redo(h); assert.equal(current(h).objects[0].localPosition.x,before[0].x+3);
});

test('P3.1: common fields show mixed and unavailable distinctly', () => {
  assert.deepEqual(commonValue(source,ids.slice(0,2),{scope:'object',path:'active'}),{state:'same',value:true});
  assert.equal(commonValue(source,ids.slice(0,2),{scope:'object',path:'layer'}).state,'mixed');
  assert.equal(commonValue(source,ids.slice(0,2),{scope:'component',typeId:'physics.airVent',path:'airVent.upwardForce'}).state,'unavailable');
});

test('P3.1: batch common fields are atomic and only selected objects change', () => {
  const changed = batchSet(source,ids.slice(0,2),{scope:'object',path:'active'},false);
  assert.deepEqual(changed.objects.map(o=>o.active),[false,false,true]);
  assert.deepEqual(source.objects.map(o=>o.active),[true,true,true]);
  const collider = {scope:'component',typeId:'physics.boxCollider2d',path:'collider.size.x'} as const;
  assert.throws(()=>batchSet(source,ids.slice(0,2),collider,-3),/Schema|collider/);
  assert.deepEqual(source.objects[0].components.find(c=>c.collider)!.collider!.size,{x:1,y:1});
  assert.throws(()=>batchSet(source,ids.slice(0,2),{scope:'component',typeId:'physics.airVent',path:'airVent.upwardForce'},2),/共同/);
});

test('P3.1: locked object blocks an entire batch', () => {
  assert.throws(()=>translateWorld(source,ids.slice(0,2),{x:1,y:0},[ids[1]]),/锁定/);
  assert.throws(()=>batchSet(source,ids.slice(0,2),{scope:'object',path:'active'},false,[ids[0]]),/锁定/);
  assert.equal(source.objects[0].active,true);
});

test('P3.1: moving a selected parent and child transforms descendants once', () => {
  const grouped = groupObjects(source,[ids[0],ids[1]]);
  const child = grouped.objects[1];
  const before = worldPose(grouped,child).position;
  const moved = translateWorld(grouped,[ids[0],ids[1]],{x:2,y:1});
  const after = worldPose(moved,moved.objects[1]).position;
  assert.equal(after.x,before.x+2); assert.equal(after.y,before.y+1);
  assert.deepEqual(moved.objects[1].localPosition,child.localPosition);
});

test('P3.2: rotated nonunit parent uses exact world-to-local movement', () => {
  const grouped=groupObjects(source,[ids[0],ids[1]]);
  const rotated=setObject(grouped,ids[0],o=>{o.localRotationZ=31;});
  const child=rotated.objects[1]; const before=worldPose(rotated,child).position;
  const moved=translateWorld(rotated,[child.id],{x:2.25,y:-1.5});
  const after=worldPose(moved,moved.objects[1]).position;
  assert.ok(Math.abs(after.x-before.x-2.25)<1e-9);
  assert.ok(Math.abs(after.y-before.y+1.5)<1e-9);
  assert.deepEqual(moved.objects[0],rotated.objects[0]);
});

test('P3.2: collider corner drag changes only collider size/offset under parent rotation', () => {
  const grouped=groupObjects(source,[ids[0],ids[1]]);
  const rotated=setObject(grouped,ids[0],o=>{o.localRotationZ=31;});
  const child=rotated.objects[1]; const corners=colliderWorldCorners(rotated,child);
  const moved=resizeColliderFromWorld(rotated,child.id,2,{x:corners[2].x+1,y:corners[2].y+2});
  const next=moved.objects[1]; const after=colliderWorldCorners(moved,next);
  assert.deepEqual(next.localScale,child.localScale);
  assert.deepEqual(next.localPosition,child.localPosition);
  assert.ok(Math.abs(after[0].x-corners[0].x)<1e-9);
  assert.ok(Math.abs(after[0].y-corners[0].y)<1e-9);
  assert.ok(Math.abs(after[2].x-corners[2].x-1)<1e-9);
  assert.ok(Math.abs(after[2].y-corners[2].y-2)<1e-9);
});

test('P3.3: safe reparent preserves world collider and blocks cycles', () => {
  const child=source.objects[0], parent=source.objects[1];
  const before=colliderWorldCorners(source,child);
  const changed=reparentObject(source,child.id,parent.id);
  assert.deepEqual(colliderWorldCorners(changed,changed.objects[0]),before);
  assert.equal(changed.objects[0].parentId,parent.id);
  assert.throws(()=>reparentObject(changed,parent.id,child.id),/循环/);
});

test('P3.3: shear-producing reparent is rejected without data change', () => {
  const parent=source.objects[1],child=source.objects[0];
  const rotated=setObject(source,parent.id,o=>{o.localRotationZ=30;});
  assert.throws(()=>reparentObject(rotated,child.id,parent.id),/剪切/);
  assert.equal(rotated.objects[0].parentId,null);
});

test('P3.3: parent lock also protects descendants', () => {
  const grouped=groupObjects(source,[ids[0],ids[1]]);
  assert.equal(isEffectivelyLocked(grouped,ids[1],[ids[0]]),true);
  assert.throws(()=>translateWorld(grouped,[ids[1]],{x:1,y:0},[ids[0]]),/锁定/);
});

test('P3.5: batch edit of real sample persists with stable IDs after reopen', async () => {
  const dir=await mkdtemp(resolve(tmpdir(),'physics-phase3-'));
  try {
    const moved=translateWorld(source,ids.slice(0,2),{x:1.25,y:-0.75});
    const changed=batchSet(moved,ids.slice(0,2),{scope:'object',path:'active'},false);
    const path=resolve(dir,'phase3-edited.json'); const files=new LevelFiles();
    await files.save(path,serialized(changed),null);
    const reopened=validateLevel(JSON.parse((await files.open(path)).text));
    assert.deepEqual(reopened,changed);
    assert.deepEqual(reopened.objects.map(o=>o.id),ids);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('P3.5: copying two objects gives unique IDs and keeps internal parent reference', () => {
  const grouped=groupObjects(source,[ids[0],ids[1]]);
  const copied=duplicate(grouped,[ids[0],ids[1]]);
  assert.equal(new Set(copied.level.objects.map(o=>o.id)).size,5);
  assert.equal(copied.level.objects[4].parentId,copied.level.objects[3].id);
});
