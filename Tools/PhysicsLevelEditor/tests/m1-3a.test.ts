import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {THERMAL_M13A_IDS,validateThermalM13A} from '../src/model/thermal-m13a.ts';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const read=async (p:string)=>JSON.parse(await readFile(resolve(root,p),'utf8'));
const source=await read('Levels/SourceMaps/Level1.source.json');
const assets=await read('Levels/Resources/ResourceSources.json');
const baseline=await read('Levels/Drafts/M1.3A/thermal-baseline.v3.test.json');
const edited=await read('Levels/Drafts/M1.3A/thermal-edited.v3.test.json');
const report=await read('Levels/Drafts/M1.3A/field-coverage.json');
const clone=<T>(v:T):T=>structuredClone(v);
const object=(level:typeof baseline,id:string)=>level.objects.find((o:{id:string})=>o.id===id);

test('M1.3A fixtures regenerate exactly from the real Level1 V3 draft',()=>{
  const command=spawnSync('python',['Tools/PhysicsLevelEditor/tools/prepare-m13a-thermal.py'],
    {cwd:root,encoding:'utf8'});
  assert.equal(command.status,0,command.stderr);
  assert.equal(baseline.objects.length,7);
  assert.equal(baseline.objects.flatMap((o:{components:unknown[]})=>o.components).length,32);
  assert.deepEqual(new Set(baseline.objects.map((o:{id:string})=>o.id)),new Set(Object.values(THERMAL_M13A_IDS)));
  assert.equal(report.sourceFieldCoverage.length,39); // 32 components + seven GameObjects.
  assert.ok(report.sourceFieldCoverage.some((r:{preservedOnlyTopLevelFields:string[]})=>
    r.preservedOnlyTopLevelFields.length>0));
});

test('M1.3A typed data is valid and source YAML remains immutable backup',()=>{
  const a=validateThermalM13A(baseline,source,assets);
  const b=validateThermalM13A(edited,source,assets);
  assert.deepEqual(JSON.parse(JSON.stringify(b)),b);
  const before=object(a,THERMAL_M13A_IDS.ice2),after=object(b,THERMAL_M13A_IDS.ice2);
  assert.ok(before && after);
  assert.equal(before.localPosition.x,0);
  assert.equal(after.localPosition.x,.75);
  assert.equal(before.components.find((c:{typeId:string})=>c.typeId==='unity.BoxCollider2D')?.data?.size.y,1);
  assert.equal(after.components.find((c:{typeId:string})=>c.typeId==='unity.BoxCollider2D')?.data?.size.y,1.25);
  assert.deepEqual(before.sourceSerialized,after.sourceSerialized);
  assert.deepEqual(before.components.map((c:{sourceSerialized:unknown})=>c.sourceSerialized),
    after.components.map((c:{sourceSerialized:unknown})=>c.sourceSerialized));
  assert.deepEqual(before.components.map((c:{sourceReferences:unknown})=>c.sourceReferences),
    after.components.map((c:{sourceReferences:unknown})=>c.sourceReferences));
  for(const obj of a.objects) if(obj.id!==THERMAL_M13A_IDS.ice2)
    assert.deepEqual(obj,object(b,obj.id));
});

test('M1.3A typed references target exact component IDs and preserve ice order',()=>{
  const a=object(edited,THERMAL_M13A_IDS.controllerA)!;
  const b=object(edited,THERMAL_M13A_IDS.controllerB)!;
  const ca=a.components.find((c:{typeId:string})=>c.typeId==='unity.ThermalControllerBlock')!;
  const cb=b.components.find((c:{typeId:string})=>c.typeId==='unity.ThermalControllerBlock')!;
  assert.equal(ca.data.linkedController,null);
  assert.equal(cb.data.linkedController.objectId,a.id);
  assert.equal(cb.data.linkedController.componentId,ca.componentId);
  assert.deepEqual(ca.data.controlledIce.map((r:{objectId:string})=>r.objectId),
    [THERMAL_M13A_IDS.ice1,THERMAL_M13A_IDS.ice2,THERMAL_M13A_IDS.ice3,THERMAL_M13A_IDS.wall]);
  assert.deepEqual(cb.data.controlledIce,ca.data.controlledIce);
  assert.equal(ca.data.roomFilterOverlay.objectId,THERMAL_M13A_IDS.backdrop);
});

test('M1.3A rejects unsupported fields and broken typed references without fallback to old YAML',()=>{
  const badField=clone(edited);
  const ice=object(badField,THERMAL_M13A_IDS.ice2)!;
  ice.components.find((c:{typeId:string})=>c.typeId==='unity.IceBlock')!.data.unknownField=42;
  assert.throws(()=>validateThermalM13A(badField,source,assets),/expected only/);
  const missing=clone(edited);
  const thermal=object(missing,THERMAL_M13A_IDS.controllerB)!.components.find(
    (c:{typeId:string})=>c.typeId==='unity.ThermalControllerBlock')!;
  thermal.data.linkedController.componentId='00000000-0000-4000-8000-000000000000';
  assert.throws(()=>validateThermalM13A(missing,source,assets),/component target/);
  const badAsset=clone(edited);
  object(badAsset,THERMAL_M13A_IDS.backdrop)!.components.find(
    (c:{typeId:string})=>c.typeId==='unity.SpriteRenderer')!.data.sprite.assetId='unity:missing:1';
  assert.throws(()=>validateThermalM13A(badAsset,source,assets),/Sprite asset/);
  const changedBackup=clone(edited);
  object(changedBackup,THERMAL_M13A_IDS.ice2)!.sourceSerialized.rawYaml+='altered';
  assert.throws(()=>validateThermalM13A(changedBackup,source,assets),/SHA-256 mismatch/);
});
