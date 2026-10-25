import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LevelDataV2, LevelObjectV2, EventRule } from '../src/model/level-v2.ts';
import { migrateValidatedV1, openVersionedLevel, unresolvedAssets, validateV2 } from '../src/model/validate-v2.ts';
import { registryV2 } from '../src/model/registry-v2.ts';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const sourcePath=resolve(root,'Levels/Physics/Level1.phase1.json');
const sourceText=await readFile(sourcePath,'utf8');
const source=JSON.parse(sourceText);
const migrate=()=>migrateValidatedV1(source);
const clone=<T>(value:T):T=>structuredClone(value);
const markerId='11111111-1111-4111-8111-111111111111';
const ruleId='22222222-2222-4222-8222-222222222222';
const actionId='33333333-3333-4333-8333-333333333333';
const marker=():LevelObjectV2=>({id:markerId,name:'Rail end',parentId:null,active:true,layer:0,
  localPosition:{x:30,y:4,z:0},localRotationZ:0,localScale:{x:1,y:1,z:1},
  components:[{typeId:'core.marker',version:1,enabled:true}],rules:[]});

test('P4.1 real V1 sample migrates explicitly without changing source identity or fields', async () => {
  const migrated=migrate();
  assert.equal(migrated.formatVersion,2);
  assert.equal(migrated.coverage,'partial');
  assert.equal(migrated.sourceSceneGuid,source.sourceSceneGuid);
  assert.equal(migrated.levelId,source.levelId);
  assert.deepEqual(migrated.objects.map(o=>o.id),source.objects.map((o:{id:string})=>o.id));
  for(let i=0;i<source.objects.length;i++) {
    const before=source.objects[i],after=migrated.objects[i];
    for(const field of ['name','parentId','active','layer','localPosition','localRotationZ','localScale','components'])
      assert.deepEqual(after[field as keyof typeof after],before[field]);
    assert.deepEqual(after.rules,[]);
  }
  assert.equal(JSON.parse(await readFile(sourcePath,'utf8')).formatVersion,1);
  assert.equal(await readFile(sourcePath,'utf8'),sourceText);
  assert.equal(openVersionedLevel(source),source);
  assert.equal(openVersionedLevel(migrated),migrated);
});

test('P4.1 registry describes every component and distinguishes V2 adapter status', () => {
  for(const [id,spec] of Object.entries(registryV2)) {
    assert.equal(spec.typeId,id);
    assert.equal(spec.version,1);
    assert.ok(spec.unity);
    assert.ok(Array.isArray(spec.fields));
    assert.equal(spec.allowMultiple,false);
    assert.ok(['base','primary','marker'].includes(spec.combination));
    assert.ok(['none','local','manager'].includes(spec.runtimeState));
    assert.ok(spec.checkpoint);
    assert.ok(Array.isArray(spec.assetRefs));
    for(const field of spec.fields) assert.ok(field.path && field.type && 'defaultValue' in field);
  }
  assert.equal(registryV2['mechanism.ice'].status,'modelOnly');
  assert.equal(registryV2['physics.airVent'].status,'v1AdapterOnly');
  assert.equal(Object.values(registryV2).some(s=>s.status==='v2AdapterReady'),false);
});

test('P4.1 legal registered combination and forward Transform reference pass', () => {
  const level=migrate();
  const vent=level.objects.find(o=>o.components.some(c=>c.typeId==='physics.airVent'))!;
  const behaviour=vent.components.find(c=>c.typeId==='physics.airVent')!;
  behaviour.typeId='mechanism.railgun'; delete behaviour.airVent;
  behaviour.railgun={launchEndPoint:{kind:'transform',objectId:markerId},acceleration:30,
    launchExitSpeed:32,launchDirection:{x:1,y:0}};
  level.objects.push(marker());
  assert.equal(validateV2(level).objects.length,4);
});

test('P4.1 invalid combinations, versions, dependencies and fields fail closed', () => {
  const bad=clone(migrate());
  const platform=bad.objects.find(o=>o.components.some(c=>c.typeId==='physics.platform'))!;
  platform.components.push({typeId:'mechanism.ice',version:1,enabled:true,
    ice:{isMelted:false,solidColor:{r:1,g:1,b:1,a:1},meltedColor:{r:1,g:1,b:1,a:0}}});
  assert.throws(()=>validateV2(bad),/多个主行为/);
  platform.components=platform.components.filter(c=>c.typeId!=='physics.boxCollider2d' && c.typeId!=='physics.platform');
  assert.throws(()=>validateV2(bad),/缺少依赖/);
  const unknown=clone(migrate()); unknown.objects[0].components[0].typeId='unknown.component';
  assert.throws(()=>validateV2(unknown),/未知/);
  const version=clone(migrate()); version.objects[0].components[0].version=7;
  assert.throws(()=>validateV2(version),/version|版本/);
  const extra=clone(migrate()) as LevelDataV2 & {secret?:number}; extra.secret=1;
  assert.throws(()=>validateV2(extra),/additional properties/);
  const extraPayload=clone(migrate()) as unknown as {objects:{components:Record<string,unknown>[]}[]};
  extraPayload.objects[0].components[0].unsupportedValue=4;
  assert.throws(()=>validateV2(extraPayload),/additional properties/);
  const markerCombo=clone(migrate()); markerCombo.objects[0].components.push({typeId:'core.marker',version:1,enabled:true});
  assert.throws(()=>validateV2(markerCombo),/marker 必须独立/);
  const enemyNoBody=clone(migrate());
  const behaviour=enemyNoBody.objects[0].components[2]; behaviour.typeId='actor.enemy'; delete behaviour.token;
  behaviour.enemy={isHunting:false,baseChaseSpeed:5.5,currentSpeed:5.5,difficultyMultiplier:1,
    skillType:'BurstDash',skillTriggerDistance:5,skillCooldown:6,burstSpeed:16,burstDuration:0.35,
    teleportNodes:[],maxAllowedPlayerLagDistance:30};
  assert.throws(()=>validateV2(enemyNoBody),/physics.rigidbody2d/);
});

test('P4.1 typed references reject missing targets and wrong component types', () => {
  const level=migrate(); const vent=level.objects.find(o=>o.components.some(c=>c.typeId==='physics.airVent'))!;
  const c=vent.components.find(c=>c.typeId==='physics.airVent')!;
  c.typeId='mechanism.railgun'; delete c.airVent;
  c.railgun={launchEndPoint:{kind:'transform',objectId:markerId},acceleration:30,launchExitSpeed:32,launchDirection:{x:1,y:0}};
  assert.throws(()=>validateV2(level),/缺失场景引用/);
  level.objects.push(marker());
  c.railgun.launchEndPoint={kind:'sceneObject',objectId:markerId} as never;
  assert.throws(()=>validateV2(level),/must be equal to constant|must match exactly one schema/);
  c.railgun.launchEndPoint={kind:'transform',objectId:markerId};
  const thermal=clone(level); const tc=thermal.objects[0].components[2];
  tc.typeId='mechanism.thermalController'; delete tc.token;
  tc.thermal={currentState:'Hot',linkedController:null,controlledIce:[{kind:'sceneComponent',objectId:markerId,componentTypeId:'mechanism.ice',instanceId:null}],terminalName:'A',interactionRadius:1.8,controlRadius:20,roomFilterOverlay:null,coldFilterColor:{r:0,g:0,b:1,a:1},hotFilterColor:{r:1,g:0,b:0,a:1}};
  assert.throws(()=>validateV2(thermal),/目标缺少组件/);
});

test('P4.1 asset reference shape is strict and existence remains explicitly unresolved', () => {
  const level=migrate();
  assert.equal(unresolvedAssets(level).length,3);
  assert.deepEqual(unresolvedAssets(level,(ref,type)=>type==='Sprite' && ref.assetGuid.length===32),[]);
  const bad=clone(level);
  bad.objects[0].components[0].sprite!.assetGuid='missing';
  assert.throws(()=>validateV2(bad),/assetGuid/);
});

test('P4.1 event design carries stable IDs, typed target and no runtime timer state', () => {
  const level=migrate();
  const rule:EventRule={id:ruleId,enabled:true,trigger:'playerEnter',repeat:'ignoreWhileRunning',
    condition:{type:'always',target:null,expectedBool:false,expectedState:''},
    actions:[{id:actionId,type:'delay',target:null,componentTypeId:'',parameterPath:'',boolValue:false,
      numberValue:0,stateValue:'',delaySeconds:5}]};
  level.objects[0].rules.push(rule);
  assert.equal(validateV2(level).objects[0].rules[0].id,ruleId);
  const extra=clone(level) as unknown as {objects:{rules:Record<string,unknown>[]}[]};
  extra.objects[0].rules[0].remainingSeconds=1;
  assert.throws(()=>validateV2(extra),/additional properties/);
});

test('P4.1 V2 save and reload preserves semantics without touching V1', async () => {
  const dir=await mkdtemp(resolve(tmpdir(),'physics-v2-'));
  try {
    const path=resolve(dir,'level-v2.json'); const value=migrate();
    await writeFile(path,JSON.stringify(value,null,2)+'\n');
    assert.deepEqual(validateV2(JSON.parse(await readFile(path,'utf8'))),value);
    assert.equal(await readFile(sourcePath,'utf8'),sourceText);
  } finally {await rm(dir,{recursive:true,force:true});}
});
