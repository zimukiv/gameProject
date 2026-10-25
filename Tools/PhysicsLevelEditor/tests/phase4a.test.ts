import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrateValidatedV1, validateV2 } from '../src/model/validate-v2.ts';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const old=JSON.parse(await readFile(resolve(root,'Levels/Physics/Level1.phase1.json'),'utf8'));
const fixture=JSON.parse(await readFile(resolve(root,'Levels/Physics/Level1.phase4a.json'),'utf8'));
const clone=<T>(value:T):T=>structuredClone(value);

test('P4.2A fixture extends the real V1 migration without changing its three objects',()=>{
  const migrated=migrateValidatedV1(old);
  validateV2(fixture);
  assert.equal(fixture.formatVersion,2);
  assert.equal(fixture.coverage,'partial');
  assert.equal(fixture.sourceSceneGuid,migrated.sourceSceneGuid);
  assert.deepEqual(fixture.objects.slice(0,3),migrated.objects);
  assert.equal(fixture.objects.length,5);
  const ice=fixture.objects.find((o:{name:string})=>o.name==='Phase 4A ice');
  assert.equal(ice.parentId,migrated.objects.find(o=>o.components.some(c=>c.typeId==='physics.platform'))?.id);
  assert.equal(ice.components.find((c:{typeId:string})=>c.typeId==='mechanism.ice').ice.isMelted,false);
  const vanish=fixture.objects.find((o:{name:string})=>o.name==='Phase 4A vanishing');
  assert.deepEqual(vanish.components.find((c:{typeId:string})=>c.typeId==='mechanism.vanishing').vanishing,
    {mode:'PeriodicBlink',visibleDuration:2,invisibleDuration:1.5,stepVanishDelay:0.8,respawnDelay:3,
      visibleColor:{r:1,g:1,b:1,a:1},vanishColor:{r:1,g:1,b:1,a:0.1},showGuide:true,
      warningDuration:0.6,optionalCollectible:null});
});

test('P4.2A fixture has unique IDs and rejects unsupported or missing references',()=>{
  const ids=fixture.objects.map((o:{id:string})=>o.id);
  assert.equal(new Set(ids).size,5);
  const missing=clone(fixture);
  missing.objects[3].parentId='11111111-1111-4111-8111-111111111111';
  assert.throws(()=>validateV2(missing),/父级缺失/);
  const duplicate=clone(fixture);
  duplicate.objects[4].id=duplicate.objects[3].id;
  assert.throws(()=>validateV2(duplicate),/重复对象 ID/);
  const unknown=clone(fixture);
  unknown.objects[0].components[2].version=2;
  assert.throws(()=>validateV2(unknown),/version|版本/);
});
