import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateProjectManifest,validateResourceManifest,validateSourceInventories,
  validateV3} from '../src/model/validate-v3.ts';
import type {LevelDataV3} from '../src/model/m1-contract.ts';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const read=async (p:string)=>JSON.parse(await readFile(resolve(root,p),'utf8'));
const clone=<T>(v:T):T=>structuredClone(v);
const sha=(data:Buffer|string)=>createHash('sha256').update(data).digest('hex');
const manifest=validateProjectManifest(await read('Levels/ProjectManifest.json'));
const assets=validateResourceManifest(await read('Levels/Resources/ResourceSources.json'));
const sidecar=await read('Levels/Physics/Level1.ids.json');
const legacy=new Map<string,string>(sidecar.entries.map((e:{globalObjectId:string;objectId:string})=>
  [e.globalObjectId.split('-')[3],e.objectId]));
const sources=validateSourceInventories(manifest,await Promise.all(manifest.rooms.map(r=>
  read(`Levels/${r.sourceMapPath}`))),assets,legacy);
const drafts:LevelDataV3[]=await Promise.all([1,2,3].map(n=>read(`Levels/Drafts/M1.2/Level${n}.v3.draft.json`)));
const report=await read('Levels/Drafts/M1.2/export-report.json');

test('M1.2 source exporter deterministically reproduces existing drafts without writing',()=>{
  const result=spawnSync('python',['Tools/PhysicsLevelEditor/tools/export-v3-drafts.py'],
    {cwd:root,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
});

test('M1.2 every source document, component, hierarchy and original byte survives',async()=>{
  assert.deepEqual(drafts.map(x=>x.objects.length),[71,64,72]);
  assert.deepEqual(drafts.map(x=>x.objects.flatMap(o=>o.components).length),[254,221,254]);
  assert.deepEqual(drafts.map(x=>x.sourceCalls?.length),[5,5,11]);
  assert.deepEqual(drafts.map(x=>x.events.length),[0,0,6]);
  assert.deepEqual(report.rooms.map((r:{sceneDocuments:number})=>r.sceneDocuments),[5,5,5]);
  for(let i=0;i<3;i++) {
    const source=await readFile(resolve(root,manifest.rooms[i].sourceScene.path));
    assert.equal(sha(source),drafts[i].sourceScene.sha256);
    assert.equal(drafts[i].coverage,'exportedUnverified');
    assert.deepEqual(validateV3(drafts[i],sources[i],assets),drafts[i]);
    const all=[...drafts[i].objects.flatMap(o=>[o.sourceSerialized!,
      ...o.components.map(c=>c.sourceSerialized!)]),...drafts[i].sceneConfig.sourceDocuments!];
    const reconstructed=drafts[i].sceneConfig.sourceHeader!+
      all.sort((a,b)=>a.sourceOrder-b.sourceOrder).map(d=>d.rawYaml).join('');
    assert.equal(Buffer.from(reconstructed,'utf8').compare(source),0);
    assert.equal(report.rooms[i].unexplainedOmissions,0);
    assert.deepEqual(report.rooms[i].sourceDifferencePaths,[]);
    assert.equal(report.rooms[i].sourceBytesReassembledExactly,true);
  }
  assert.deepEqual(manifest.rooms.map(r=>[r.migrationState,r.levelDataPath]),
    [['sourceOnly',null],['sourceOnly',null],['sourceOnly',null]]);
});

test('M1.2 scene references, assets and UnityEvents retain stable targets and order',()=>{
  for(let i=0;i<3;i++) {
    const draft=drafts[i],source=sources[i];
    assert.deepEqual(draft.objects.map(o=>o.id),source.objects.map(o=>o.objectId));
    for(const [j,o] of draft.objects.entries()) {
      assert.deepEqual(o.components.map(c=>c.componentId),source.objects[j].components.map(c=>c.componentId));
      assert.ok(o.siblingIndex!==undefined);
      for(const [k,c] of o.components.entries())
        assert.deepEqual(c.sourceReferences,source.objects[j].components[k].references);
    }
    assert.deepEqual(draft.sourceCalls,source.persistentCalls);
    assert.deepEqual(draft.events.map(e=>e.sourcePersistentCallId),
      source.persistentCalls.filter(c=>c.classification==='levelDesign').map(c=>c.eventId));
    for(const ref of draft.objects.flatMap(o=>o.components.flatMap(c=>c.sourceReferences??[])))
      if(ref.kind==='asset') assert.ok(assets.resources.some(a=>a.assetId===ref.assetId));
  }
  for(const [fileId,objectId] of legacy)
    assert.equal(drafts[0].objects.find(o=>o.sourceFileId===fileId)?.id,objectId);
  assert.ok(drafts[2].sourceCalls?.some(c=>c.methodName==='NextLevel' &&
    c.reviewFlag==='nameMethodMismatch'));
});

test('M1.2 core physical, visual and UI source fields remain distinct',()=>{
  for(const draft of drafts) {
    const components=draft.objects.flatMap(o=>o.components);
    const one=(type:string)=>components.find(c=>c.typeId===`unity.${type}`)?.sourceSerialized?.fields;
    const sprite=one('SpriteRenderer'),collider=one('BoxCollider2D'),body=one('Rigidbody2D');
    const camera=one('Camera'),rect=one('RectTransform');
    assert.ok(sprite && collider && body && camera && rect);
    for(const field of ['m_Sprite','m_Materials','m_Color','m_SortingLayerID','m_SortingOrder','m_Size'])
      assert.ok(Object.hasOwn(sprite,field),field);
    for(const field of ['m_Size','m_Offset','m_IsTrigger','m_Material','m_IncludeLayers'])
      assert.ok(Object.hasOwn(collider,field),field);
    for(const field of ['m_BodyType','m_GravityScale','m_LinearDamping','m_Constraints'])
      assert.ok(Object.hasOwn(body,field),field);
    assert.ok(Object.hasOwn(camera,'orthographic size'));
    for(const field of ['m_AnchorMin','m_AnchorMax','m_AnchoredPosition','m_SizeDelta','m_Pivot'])
      assert.ok(Object.hasOwn(rect,field),field);
    assert.ok(draft.objects.some(o=>o.rectTransform?.offsetMin && o.rectTransform.offsetMax));
    assert.ok(components.some(c=>c.typeId==='unity.Canvas'));
  }
});

test('M1.2 JSON reload preserves semantics; damaged provenance and references fail closed',()=>{
  const base=drafts[2];
  assert.deepEqual(validateV3(JSON.parse(JSON.stringify(base)),sources[2],assets),base);
  const missingObject=clone(base);missingObject.objects.pop();
  assert.throws(()=>validateV3(missingObject,sources[2],assets),/every source GameObject/);
  const missingComponent=clone(base);missingComponent.objects[0].components.pop();
  assert.throws(()=>validateV3(missingComponent,sources[2],assets),/component count missing/);
  const changedRaw=clone(base);changedRaw.objects[0].sourceSerialized!.rawYaml+='\n';
  assert.throws(()=>validateV3(changedRaw,sources[2],assets),/SHA-256 mismatch/);
  const changedRef=clone(base);
  const component=changedRef.objects.flatMap(o=>o.components).find(c=>c.sourceReferences?.length);
  assert.ok(component);component.sourceReferences!.pop();
  assert.throws(()=>validateV3(changedRef,sources[2],assets),/references differ/);
  const missingCall=clone(base);missingCall.sourceCalls!.pop();
  assert.throws(()=>validateV3(missingCall,sources[2],assets),/UnityEvent calls/);
  const missingAsset=clone(base);missingAsset.resourceIds.pop();
  assert.throws(()=>validateV3(missingAsset,sources[2],assets),/resource dependency list differs/);
  const falseReady=clone(base);falseReady.coverage='full';
  assert.throws(()=>validateV3(falseReady,sources[2],assets),/full coverage requires/);
  assert.throws(()=>validateV3(base),/requires source inventory/);
});
