import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import type {LevelDataV3} from '../src/model/m1-contract.ts';
import {canvasShapes,moveCanvasSelection} from '../src/editor/v3-canvas.ts';
import {applyOverlay,type RoomOverlay} from '../src/editor/release-model.ts';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../../Levels/Drafts/M1.2');
const load=async(n:number):Promise<LevelDataV3>=>JSON.parse(await readFile(resolve(root,`Level${n}.v3.draft.json`),'utf8'));
const bounds=(points:{x:number;y:number}[])=>({width:Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x)),
  height:Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y))});

test('V3 source ground, ice wall and platforms reuse Phase 3 world collider geometry',async()=>{
  for(const n of [1,2,3]){
    const level=await load(n),shapes=canvasShapes(level);
    const ground=shapes.find(s=>s.name==='Start ground');
    assert.equal(ground?.kind,'box');
    assert.deepEqual(bounds(ground!.worldPoints),{width:14,height:1});
    const platform=shapes.find(s=>s.name==='Timed platform');
    assert.equal(platform?.kind,'box');
    assert.ok(Math.abs(bounds(platform!.worldPoints).width-2)<1e-9);
    assert.ok(Math.abs(bounds(platform!.worldPoints).height-0.4)<1e-9);
    assert.ok(shapes.filter(s=>s.kind==='box').length>=28);
    assert.ok(!shapes.some(s=>level.objects.find(o=>o.id===s.objectId)?.rectTransform));
    assert.ok(!shapes.some(s=>s.name==='Main Camera'));
  }
  const ice=canvasShapes(await load(1)).find(s=>s.name==='Ice wall');
  assert.equal(ice?.kind,'box');
  assert.ok(Math.abs(bounds(ice!.worldPoints).width-0.9)<1e-9);
  assert.ok(Math.abs(bounds(ice!.worldPoints).height-4)<1e-9);
});

test('a supported V3 drag edits only work-copy positions and keeps geometry with world coordinates',async()=>{
  const base=await load(1),ground=base.objects.find(o=>o.name==='Start ground')!;
  const overlay:RoomOverlay={overlayVersion:1,roomId:'room1',sourceSceneSha256:base.sourceScene.sha256,
    levelId:base.levelId,positions:[]};
  const next=moveCanvasSelection(base,overlay,[ground.id],{x:1.25,y:-0.5},null);
  assert.deepEqual(overlay.positions,[]);
  const moved=applyOverlay(base,next),shape=canvasShapes(moved).find(s=>s.objectId===ground.id)!;
  assert.equal(shape.kind,'box');
  assert.ok(Math.abs(shape.worldPoints[0].x-(-10.75))<1e-9);
  assert.ok(Math.abs(shape.worldPoints[0].y-(-4.5))<1e-9);
  assert.deepEqual(base.objects.find(o=>o.id===ground.id)!.localPosition,{x:-5,y:-3.5,z:0});
});

test('V3 multi-drag is atomic; read-only objects reject the entire edit',async()=>{
  const base=await load(1),a=base.objects.find(o=>o.name==='Start ground')!,
    b=base.objects.find(o=>o.name==='Ice wall')!;
  const overlay:RoomOverlay={overlayVersion:1,roomId:'room1',sourceSceneSha256:base.sourceScene.sha256,
    levelId:base.levelId,positions:[]};
  const next=moveCanvasSelection(base,overlay,[a.id,b.id],{x:2,y:3},null);
  assert.equal(next.positions.length,2);
  assert.equal(next.positions[0].localPosition.x-a.localPosition.x,2);
  assert.equal(next.positions[1].localPosition.x-b.localPosition.x,2);
  const ui=base.objects.find(o=>o.rectTransform)!;
  assert.throws(()=>moveCanvasSelection(base,overlay,[a.id,ui.id],{x:1,y:0},null),/read-only/);
  assert.deepEqual(overlay.positions,[]);
});

test('selected parent and child move once using the Phase 3 movable-root rule',async()=>{
  const source=await load(1),base=structuredClone(source);
  const parent=base.objects.find(o=>o.name==='Start ground')!;
  const child=base.objects.find(o=>o.name==='Ice wall')!;
  child.parentId=parent.id;
  const overlay:RoomOverlay={overlayVersion:1,roomId:'room1',sourceSceneSha256:base.sourceScene.sha256,
    levelId:base.levelId,positions:[]};
  const before=canvasShapes(base).find(s=>s.objectId===child.id)!.worldPoints[0];
  const next=moveCanvasSelection(base,overlay,[parent.id,child.id],{x:2,y:-1},null);
  assert.deepEqual(next.positions.map(x=>x.objectId),[parent.id]);
  const after=canvasShapes(applyOverlay(base,next)).find(s=>s.objectId===child.id)!.worldPoints[0];
  assert.ok(Math.abs(after.x-before.x-2)<1e-9);
  assert.ok(Math.abs(after.y-before.y+1)<1e-9);
});

test('CircleCollider2D adapter uses radius/offset and nonuniform scale without changing source',async()=>{
  const base=await load(1),copy=structuredClone(base),object=copy.objects.find(o=>o.name==='Start ground')!;
  const collider=object.components.find(c=>c.typeId==='unity.BoxCollider2D')!;
  collider.typeId='unity.CircleCollider2D';
  collider.sourceSerialized!.fields={m_Radius:2,m_Offset:{x:1,y:0},m_IsTrigger:1};
  object.localScale={x:2,y:1,z:1};
  const shape=canvasShapes(copy).find(s=>s.objectId===object.id)!;
  assert.equal(shape.kind,'circle');assert.equal(shape.worldPoints.length,32);
  assert.ok(Math.abs(bounds(shape.worldPoints).width-8)<1e-9);
  assert.ok(Math.abs(bounds(shape.worldPoints).height-4)<1e-9);
  assert.equal(shape.isTrigger,true);
  assert.equal(base.objects.find(o=>o.id===object.id)!.components.find(c=>c.typeId==='unity.BoxCollider2D')?.typeId,
    'unity.BoxCollider2D');
});
