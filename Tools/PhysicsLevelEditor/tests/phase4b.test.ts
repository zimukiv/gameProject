import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateV2 } from '../src/model/validate-v2.ts';
import { registryV2 } from '../src/model/registry-v2.ts';
import { LevelFiles } from '../src/editor/persistence.ts';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const a=JSON.parse(await readFile(resolve(root,'Levels/Physics/Level1.phase4a.json'),'utf8'));
const b=JSON.parse(await readFile(resolve(root,'Levels/Physics/Level1.phase4b.json'),'utf8'));
const clone=<T>(value:T):T=>structuredClone(value);
const part=(level:any,type:string)=>level.objects.flatMap((o:any)=>o.components).find((c:any)=>c.typeId===type);

test('P4.2B fixture preserves P4.2A objects and registers Inspector fields',()=>{
  validateV2(b);
  assert.deepEqual(b.objects.slice(0,5),a.objects);
  assert.equal(b.objects.length,9);
  const thermal=registryV2['mechanism.thermalController'];
  const rail=registryV2['mechanism.railgun'];
  for(const path of ['thermal.currentState','thermal.terminalName','thermal.interactionRadius',
    'thermal.controlRadius','thermal.linkedController','thermal.controlledIce',
    'thermal.coldFilterColor','thermal.hotFilterColor'])
    assert.ok(thermal.fields.some(f=>f.path===path),path);
  for(const path of ['railgun.acceleration','railgun.launchExitSpeed',
    'railgun.launchDirection','railgun.launchEndPoint'])
    assert.ok(rail.fields.some(f=>f.path===path),path);
  assert.equal(part(b,'mechanism.thermalController').thermal.currentState,'Cold');
  assert.equal(part(b,'mechanism.railgun').railgun.launchEndPoint.kind,'transform');
});

test('P4.2B typed scene references reject missing or wrong targets',()=>{
  const missing=clone(b);
  part(missing,'mechanism.thermalController').thermal.controlledIce[0].objectId=
    '11111111-1111-4111-8111-111111111111';
  assert.throws(()=>validateV2(missing),/缺失场景引用/);
  const wrong=clone(b);
  part(wrong,'mechanism.thermalController').thermal.controlledIce[0].componentTypeId='item.token';
  assert.throws(()=>validateV2(wrong),/引用组件类型不匹配/);
  const endpoint=clone(b);
  part(endpoint,'mechanism.railgun').railgun.launchEndPoint.objectId=
    '11111111-1111-4111-8111-111111111111';
  assert.throws(()=>validateV2(endpoint),/缺失场景引用/);
  const duplicate=clone(b);
  duplicate.objects[8].id=duplicate.objects[7].id;
  assert.throws(()=>validateV2(duplicate),/重复对象 ID/);
});

test('P4.2B optional thermal null remains null while forward IDs survive serialization',()=>{
  const level=clone(b);
  const thermal=level.objects.filter((o:any)=>o.components.some((c:any)=>c.typeId==='mechanism.thermalController'));
  assert.equal(thermal.length,2);
  assert.equal(thermal[0].components.find((c:any)=>c.typeId==='mechanism.thermalController').thermal.linkedController,null);
  const reopened=validateV2(JSON.parse(JSON.stringify(level)));
  const controllers=reopened.objects.filter(o=>o.components.some(c=>c.typeId==='mechanism.thermalController'));
  const root=controllers[0].components.find(c=>c.typeId==='mechanism.thermalController')!.thermal!;
  const linked=controllers[1].components.find(c=>c.typeId==='mechanism.thermalController')!.thermal!;
  assert.equal(root.linkedController,null);
  assert.equal(root.controlledIce[0].objectId,
    reopened.objects.find(o=>o.components.some(c=>c.typeId==='mechanism.ice'))!.id);
  assert.equal(linked.linkedController?.objectId,controllers[0].id);
  assert.equal(reopened.objects.find(o=>o.components.some(c=>c.typeId==='mechanism.railgun'))!
    .components.find(c=>c.typeId==='mechanism.railgun')!.railgun!.launchEndPoint?.objectId,
    reopened.objects.find(o=>o.components.some(c=>c.typeId==='core.marker'))!.id);
});

test('P4.2B V2 file API persists editable thermal and railgun fields without dropping references',async()=>{
  const dir=await mkdtemp(resolve(tmpdir(),'phase4b-'));
  try {
    const path=resolve(dir,'roundtrip.json');
    await writeFile(path,JSON.stringify(b));
    const files=new LevelFiles();
    const opened=await files.open(path);
    const next=clone(JSON.parse(opened.text));
    part(next,'mechanism.thermalController').thermal.interactionRadius=2.5;
    part(next,'mechanism.railgun').railgun.acceleration=37;
    await files.save(path,JSON.stringify(next,null,2),opened.fingerprint);
    const again=await files.open(path);
    const loaded=validateV2(JSON.parse(again.text));
    assert.equal(part(loaded,'mechanism.thermalController').thermal.interactionRadius,2.5);
    assert.equal(part(loaded,'mechanism.railgun').railgun.acceleration,37);
    assert.deepEqual(part(loaded,'mechanism.thermalController').thermal.controlledIce,
      part(b,'mechanism.thermalController').thermal.controlledIce);
    assert.deepEqual(part(loaded,'mechanism.railgun').railgun.launchEndPoint,
      part(b,'mechanism.railgun').railgun.launchEndPoint);
  } finally {await rm(dir,{recursive:true,force:true});}
});
