import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {newEditorObjectId,sourceComponentId,sourceObjectId} from '../src/model/identity-v3.ts';
import {openLevelWithoutMigration,validateProjectManifest,validateResourceManifest,
  validateSourceInventories,validateV3} from '../src/model/validate-v3.ts';
import type {LevelDataV3,SourceInventoryV1} from '../src/model/m1-contract.ts';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const read=async (path:string)=>JSON.parse(await readFile(resolve(root,path),'utf8'));
const clone=<T>(value:T):T=>structuredClone(value);
const legacy=await read('Levels/Physics/Level1.ids.json');
const oldIds=new Map<string,string>(legacy.entries.map((entry:{globalObjectId:string;objectId:string})=>
  [entry.globalObjectId.split('-')[3],entry.objectId]));
const manifest=validateProjectManifest(await read('Levels/ProjectManifest.json'));
const resources=validateResourceManifest(await read('Levels/Resources/ResourceSources.json'));
const inventories=validateSourceInventories(manifest,await Promise.all(manifest.rooms.map(room=>
  read(`Levels/${room.sourceMapPath}`))),resources,oldIds);
const level1=inventories[0];
const sceneHash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');

test('M1.1 source scene baseline, ownership and component provenance cover 207/729/21',async()=>{
  const expected=[[71,254,5,[33,3,30,5]],[64,221,5,[28,4,30,2]],[72,254,11,[34,6,30,2]]];
  for(const [i,room] of manifest.rooms.entries()) {
    const inv=inventories[i];
    const scene=await readFile(resolve(root,room.sourceScene.path));
    assert.equal(sceneHash(scene),room.sourceScene.sha256);
    const yaml=scene.toString('utf8');
    const headers=[...yaml.matchAll(/^--- !u!(\d+) &(\d+)\r?$/gm)];
    const docs=headers.map((h,j)=>({classId:h[1],fileId:h[2],body:yaml.slice(h.index,
      j+1<headers.length?headers[j+1].index:yaml.length)}));
    const goIds=new Set(docs.filter(d=>d.classId==='1').map(d=>d.fileId));
    const componentIds=new Set(docs.filter(d=>d.classId!=='1' &&
      /\bm_GameObject:\s*\{fileID:\s*[1-9]/.test(d.body)).map(d=>d.fileId));
    assert.deepEqual(new Set(inv.objects.map(o=>o.sourceFileId)),goIds);
    assert.deepEqual(new Set(inv.objects.flatMap(o=>o.components.map(c=>c.sourceFileId))),componentIds);
    const counts=[inv.objects.length,inv.objects.flatMap(o=>o.components).length,inv.persistentCalls.length,
      ['A','B','C','D'].map(k=>inv.objects.filter(o=>o.ownership===k).length)];
    assert.deepEqual(counts,expected[i]);
    assert.equal(room.migrationState,'sourceOnly');
    assert.equal(room.levelDataPath,null);
    for(const o of inv.objects) {
      assert.match(o.sourceGameObjectSha256,/^[a-f0-9]{64}$/);
      assert.ok(o.responsibility.configPath.includes(o.objectId));
      if(o.ownership==='C') assert.ok(o.responsibility.templateSlot);
      for(const c of o.components) {
        assert.equal(c.componentId,sourceComponentId(inv.sourceScene.guid,o.sourceFileId,c.sourceFileId));
        assert.match(c.sourceDocumentSha256,/^[a-f0-9]{64}$/);
        assert.equal(c.restoration,o.responsibility.kind);
      }
    }
  }
  assert.equal(inventories.flatMap(i=>i.objects).length,207);
  assert.equal(inventories.flatMap(i=>i.objects.flatMap(o=>o.components)).length,729);
  assert.equal(inventories.flatMap(i=>i.persistentCalls).length,21);
});

test('M1.1 stable source identities retain three V1 IDs and reject duplicates',()=>{
  for(const [fileId,id] of oldIds) {
    assert.equal(level1.objects.find(o=>o.sourceFileId===fileId)?.objectId,id);
    assert.equal(sourceObjectId(level1.sourceScene.guid,fileId,id),id);
    assert.notEqual(sourceObjectId(inventories[1].sourceScene.guid,fileId),id);
  }
  assert.equal(sourceObjectId(level1.sourceScene.guid,'43121461'),
    sourceObjectId(level1.sourceScene.guid,'43121461'));
  assert.notEqual(newEditorObjectId(),newEditorObjectId());
  const renamed=clone(inventories);
  renamed[0].objects[0].nameAtSource='Renamed without changing identity';
  assert.doesNotThrow(()=>validateSourceInventories(manifest,renamed,resources,oldIds));
  const duplicate=clone(inventories);
  duplicate[0].objects[1].objectId=duplicate[0].objects[0].objectId;
  assert.throws(()=>validateSourceInventories(manifest,duplicate,resources,oldIds),/duplicate object/);
  const duplicateComponent=clone(inventories);
  duplicateComponent[0].objects[0].components[1].componentId=duplicateComponent[0].objects[0].components[0].componentId;
  assert.throws(()=>validateSourceInventories(manifest,duplicateComponent,resources,oldIds),/duplicate component/);
});

test('M1.1 source references preserve null, order, forward targets and reject loss',()=>{
  const refs=inventories.flatMap(i=>i.objects.flatMap(o=>o.components.flatMap(c=>c.references)));
  assert.ok(refs.some(r=>r.kind==='null'));
  assert.ok(refs.some(r=>r.kind==='component'));
  assert.ok(refs.some(r=>r.kind==='asset'));
  const bad=clone(inventories);
  const ref=bad[0].objects.flatMap(o=>o.components.flatMap(c=>c.references)).find(r=>r.kind==='component');
  assert.ok(ref && ref.kind==='component');
  ref.componentId=newEditorObjectId();
  assert.throws(()=>validateSourceInventories(manifest,bad,resources,oldIds),/wrong component target/);
  const missing=clone(inventories);
  const required=missing[0].objects.flatMap(o=>o.components.flatMap(c=>c.references))
    .find(r=>r.kind==='component');
  assert.ok(required);
  Object.assign(required,{kind:'null'});
  assert.throws(()=>validateSourceInventories(manifest,missing,resources,oldIds),/schema/);
  const reordered=clone(inventories);
  reordered[0].objects[0].components[0].references.reverse();
  assert.notDeepEqual(reordered[0].objects[0].components[0].references,
    inventories[0].objects[0].components[0].references);
  assert.doesNotThrow(()=>validateSourceInventories(manifest,reordered,resources,oldIds));
});

test('M1.1 all 21 UnityEvent calls retain order, invocation payload and review marker',()=>{
  const calls=inventories.flatMap(i=>i.persistentCalls);
  assert.equal(calls.filter(c=>c.classification==='runnerUi').length,15);
  assert.equal(calls.filter(c=>c.classification==='levelDesign').length,6);
  for(const c of calls) {
    assert.equal(c.persistentCall.m_MethodName,c.methodName);
    assert.equal(c.persistentCall.m_Mode,c.mode);
    assert.equal(c.persistentCall.m_CallState,c.callState);
    assert.deepEqual(c.persistentCall.m_Arguments,c.arguments);
    assert.equal((c.persistentCall.m_Target as {fileID:string}).fileID,c.targetComponentFileId);
  }
  assert.ok(inventories[2].persistentCalls.some(c=>c.methodName==='NextLevel' &&
    c.reviewFlag==='nameMethodMismatch'));
  const damaged=clone(inventories);
  damaged[0].persistentCalls[0].arguments.m_IntArgument='999';
  assert.throws(()=>validateSourceInventories(manifest,damaged,resources,oldIds),/lost source or payload/);
});

test('M1.1 resource source paths, content hashes and Unity GUIDs remain traceable',async()=>{
  assert.ok(resources.resources.length>0);
  for(const asset of resources.resources) {
    assert.equal(typeof asset.localFileId,'string');
    assert.equal(asset.readiness,'sourceOnly');
    if(!asset.sourcePath || !asset.sourceSha256) continue;
    const bytes=await readFile(resolve(root,asset.sourcePath));
    assert.equal(sceneHash(bytes),asset.sourceSha256,asset.sourcePath);
    if(asset.sourcePath.startsWith('Assets/')) {
      const meta=await readFile(resolve(root,asset.sourcePath+'.meta'),'utf8');
      assert.match(meta,new RegExp(`^guid: ${asset.unityGuid}$`,'m'));
    }
  }
});

function fixture():LevelDataV3 {
  const chosen=level1.objects.filter(o=>o.ownership==='A').slice(0,3);
  return {formatVersion:3,levelId:manifest.rooms[0].levelId,roomId:'room1',coverage:'partial',
    sourceScene:clone(level1.sourceScene),sceneConfig:{dataStatus:'sourceOnly',
      sourceSceneSha256:level1.sourceScene.sha256,data:null},
    resourceIds:[],events:[],objects:chosen.map(o=>({
      id:o.objectId,sourceFileId:o.sourceFileId,ownership:o.ownership,name:o.nameAtSource,
      parentId:null,active:true,layer:0,tag:'Untagged',localPosition:{x:0,y:0,z:0},
      localRotation:{x:0,y:0,z:0,w:1},localScale:{x:1,y:1,z:1},rectTransform:null,
      responsibility:clone(o.responsibility),components:o.components.map(c=>({
        componentId:c.componentId,sourceFileId:c.sourceFileId,
        typeId:c.unityType==='Transform'?'core.transform':`source.${c.unityType}`,
        version:1,enabled:true,
        dataStatus:'sourceOnly',data:null,sourceDocumentSha256:c.sourceDocumentSha256}))}))};
}

test('M1.1 V3 typed forward references, null, array order and JSON reload',()=>{
  const v=fixture(),[a,b,c]=v.objects;
  const component=b.components[0];
  v.events=[{id:newEditorObjectId(),sourcePersistentCallId:null,
    trigger:{typeId:'manual',source:{kind:'object',levelId:v.levelId,objectId:c.id}},
    conditions:[{typeId:'always',target:null,expected:null}],
    orderedActions:[{id:newEditorObjectId(),typeId:'first',target:{kind:'component',levelId:v.levelId,
      objectId:b.id,componentId:component.componentId,componentTypeId:component.typeId},delaySeconds:1,parameters:{}},
      {id:newEditorObjectId(),typeId:'second',target:{kind:'transform',levelId:v.levelId,objectId:a.id},
        delaySeconds:0,parameters:{}}]}];
  assert.deepEqual(validateV3(JSON.parse(JSON.stringify(v)),level1,resources),v);
  assert.deepEqual(v.events[0].orderedActions.map(x=>x.typeId),['first','second']);
  const bad=clone(v);bad.events[0].orderedActions[0].target={kind:'component',levelId:v.levelId,
    objectId:b.id,componentId:component.componentId,componentTypeId:'wrong.type'};
  assert.throws(()=>validateV3(bad,level1,resources),/component type or ID mismatch/);
  const cross=clone(v);cross.events[0].trigger.source={kind:'object',levelId:manifest.rooms[1].levelId,objectId:c.id};
  assert.throws(()=>validateV3(cross,level1,resources),/cross-room reference/);
  const missing=clone(v);missing.events[0].trigger.source={kind:'object',levelId:v.levelId,objectId:newEditorObjectId()};
  assert.throws(()=>validateV3(missing,level1,resources),/missing object target/);
  const wrongKind=clone(v);wrongKind.events[0].orderedActions[0].target={kind:'object',
    levelId:v.levelId,objectId:b.id};
  assert.doesNotThrow(()=>validateV3(wrongKind,level1,resources)); // Generic event targets may be objects.
  const unknown=clone(v) as LevelDataV3 & {unexpected?:boolean};unknown.unexpected=true;
  assert.throws(()=>validateV3(unknown),/additional properties/);
  const duplicate=clone(v);duplicate.objects[1].id=duplicate.objects[0].id;
  assert.throws(()=>validateV3(duplicate),/Duplicate V3 object/);
  const version=clone(v);version.formatVersion=2 as 3;
  assert.throws(()=>validateV3(version),/schema/);
  const falseFull=clone(v);falseFull.coverage='full';
  assert.throws(()=>validateV3(falseFull),/verified scene settings and restoration adapters/);
  const wrongSource=clone(v);wrongSource.sceneConfig.sourceSceneSha256='0'.repeat(64);
  assert.throws(()=>validateV3(wrongSource),/source hash mismatch/);
  const wrongComponentOrigin=clone(v);wrongComponentOrigin.objects[0].components[0].sourceFileId='999999';
  assert.throws(()=>validateV3(wrongComponentOrigin,level1,resources),/source provenance mismatch/);
});

test('M1.1 manifest rejects false complete claim; V1/V2 remain explicit and untouched',async()=>{
  const falseClaim=clone(manifest);falseClaim.rooms[0].levelDataPath='Physics/Level1.v3.json';
  assert.throws(()=>validateProjectManifest(falseClaim),/sourceOnly room/);
  const v1=await read('Levels/Physics/Level1.phase1.json');
  const v2=await read('Levels/Physics/Level1.phase4b.json');
  assert.equal(openLevelWithoutMigration(v1).formatVersion,1);
  assert.equal(openLevelWithoutMigration(v2).formatVersion,2);
  assert.deepEqual(openLevelWithoutMigration(v1),v1);
  assert.deepEqual(openLevelWithoutMigration(v2),v2);
});
