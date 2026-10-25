import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateV3} from '../src/model/validate-v3.ts';
import type {ComponentV3,LevelDataV3,SourceInventoryV1,ResourceManifestV1} from '../src/model/m1-contract.ts';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const read=async (p:string)=>JSON.parse(await readFile(resolve(root,p),'utf8'));
const source=await read('Levels/SourceMaps/Level1.source.json') as SourceInventoryV1;
const assets=await read('Levels/Resources/ResourceSources.json') as ResourceManifestV1;
const draft=await read('Levels/Drafts/M1.2/Level1.v3.draft.json') as LevelDataV3;
const candidate=await read('Levels/Drafts/M1.3B/Level1.v3.rebuild-candidate.json') as LevelDataV3;
const edited=await read('Levels/Drafts/M1.3B/Level1.v3.rebuild-edited.json') as LevelDataV3;
const report=await read('Levels/Drafts/M1.3B/Level1.coverage.json');

test('M1.3B-1 uGUI FontData preserves one audited legacy conflict and rejects invalid edits',()=>{
  const fontFor=(c:ComponentV3)=>(c.data!.fields as Record<string,unknown>)
    .m_FontData as Record<string,number>;
  const texts=candidate.objects.flatMap(o=>o.components.filter(c=>c.typeId==='unity.Text')
    .map(c=>({object:o,component:c,font:fontFor(c)})));
  assert.equal(texts.length,14);
  const conflicts=texts.filter(x=>x.font.m_MaxSize<x.font.m_FontSize);
  assert.equal(conflicts.length,1);
  assert.equal(conflicts[0].component.componentId,'187b1e5f-f498-5619-b47b-1f55bdb68668');
  assert.deepEqual([conflicts[0].font.m_FontSize,conflicts[0].font.m_MinSize,
    conflicts[0].font.m_MaxSize,conflicts[0].font.m_BestFit],[46,10,40,0]);
  const original=draft.objects.find(o=>o.id===conflicts[0].object.id)!.components
    .find(c=>c.componentId===conflicts[0].component.componentId)!;
  assert.equal((original.sourceSerialized!.fields.m_FontData as Record<string,number>).m_MaxSize,40);
  assert.deepEqual(validateV3(candidate,source,assets),candidate);
  const valid=structuredClone(candidate);
  const target=valid.objects.find(o=>o.id===conflicts[0].object.id)!.components
    .find(c=>c.componentId===conflicts[0].component.componentId)!;
  const font=fontFor(target);
  font.m_MaxSize=50;font.m_BestFit=1;
  assert.deepEqual(validateV3(valid,source,assets),valid);
  const smaller=structuredClone(candidate);
  const smallerPart=smaller.objects.find(o=>o.id===conflicts[0].object.id)!.components
    .find(c=>c.componentId===conflicts[0].component.componentId)!;
  fontFor(smallerPart).m_FontSize=38;
  assert.deepEqual(validateV3(smaller,source,assets),smaller);
  for(const edit of [
    (f:Record<string,number>)=>{f.m_FontSize=47;},
    (f:Record<string,number>)=>{f.m_MaxSize=-1;},
    (f:Record<string,number>)=>{f.m_MaxSize=301;},
    (f:Record<string,number>)=>{f.m_MinSize=47;},
    (f:Record<string,number>)=>{f.m_BestFit=2;},
  ]) {
    const invalid=structuredClone(candidate);
    const part=invalid.objects.find(o=>o.id===conflicts[0].object.id)!.components
      .find(c=>c.componentId===conflicts[0].component.componentId)!;
    edit(fontFor(part));
    assert.throws(()=>validateV3(invalid,source,assets),/uGUI FontData|m_MaxSize below m_FontSize/);
  }
});

test('M1.3B-1 candidate is derived from all audited Level1 objects and components',()=>{
  const result=spawnSync('python',['Tools/PhysicsLevelEditor/tools/prepare-m13b-level1.py'],
    {cwd:root,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  assert.equal(candidate.objects.length,71);
  assert.equal(candidate.objects.flatMap(o=>o.components).length,254);
  assert.equal(report.referenceCount,597);
  assert.equal(report.normalizedBlankStringCount,93);
  assert.equal(report.normalizedBlankStrings.length,93);
  assert.deepEqual(candidate.objects.map(o=>o.id),draft.objects.map(o=>o.id));
  assert.deepEqual(candidate.objects.flatMap(o=>o.components.map(c=>c.componentId)),
    draft.objects.flatMap(o=>o.components.map(c=>c.componentId)));
  assert.equal(report.unityRebuild,'NOT_RUN');
  assert.equal(report.sceneConfig,'sourceOnly');
  assert.deepEqual(candidate.sceneConfig,draft.sceneConfig);
  assert.deepEqual(candidate.sourceCalls,draft.sourceCalls);
  assert.deepEqual(candidate.resourceIds,draft.resourceIds);
});

test('M1.3B-1 native field candidates and typed references preserve source backup',()=>{
  assert.deepEqual(validateV3(candidate,source,assets),candidate);
  assert.deepEqual(JSON.parse(JSON.stringify(candidate)),candidate);
  let normalized=0;
  const paths=new Map<string,string[]>();
  for(const entry of report.normalizedBlankStrings as {componentId:string;fieldPath:string}[]) {
    const list=paths.get(entry.componentId)??[];list.push(entry.fieldPath);paths.set(entry.componentId,list);
  }
  for(let i=0;i<candidate.objects.length;i++) {
    const before=draft.objects[i],after=candidate.objects[i];
    assert.deepEqual(after.sourceSerialized,before.sourceSerialized);
    assert.deepEqual(after.sourceReferences,before.sourceReferences);
    for(let j=0;j<after.components.length;j++) {
      const a=after.components[j],b=before.components[j];
      assert.equal(a.dataStatus,'m13bCandidate');
      assert.deepEqual(a.sourceSerialized,b.sourceSerialized);
      assert.deepEqual(a.sourceReferences,b.sourceReferences);
      const sourceFields=b.sourceSerialized!.fields;
      const expectedFields=structuredClone(sourceFields);
      for(const path of paths.get(a.componentId)??[]) {
        const segments=path.match(/[^.\[\]]+|\[\d+\]/g)!;
        let cursor:unknown=expectedFields;
        for(const segment of segments.slice(0,-1)) cursor=Array.isArray(cursor)?
          cursor[Number(segment.slice(1,-1))]:(cursor as Record<string,unknown>)[segment];
        const last=segments.at(-1)!;
        assert.equal((cursor as Record<string,unknown>)[last],null);
        (cursor as Record<string,unknown>)[last]='';normalized++;
      }
      assert.deepEqual(a.data?.fields,expectedFields);
      assert.deepEqual((a.data?.references as unknown[]).length,b.sourceReferences?.length);
    }
  }
  assert.equal(normalized,93);
});

test('M1.3B-1 blank MonoBehaviour m_Name is a string, while unrelated null remains invalid',()=>{
  const id='b78a5a8e-8912-5f08-b6f8-0518cce510a9';
  const sourceComponent=draft.objects.flatMap(o=>o.components).find(c=>c.componentId===id)!;
  const restored=candidate.objects.flatMap(o=>o.components).find(c=>c.componentId===id)!;
  assert.equal(sourceComponent.sourceFileId,'43121465');
  assert.equal(sourceComponent.typeId,'unity.UIFontBootstrap');
  assert.equal(sourceComponent.sourceSerialized!.fields.m_Name,null);
  assert.match(sourceComponent.sourceSerialized!.rawYaml,/^  m_Name:[ \t]*\r?$/m);
  assert.equal((restored.data!.fields as Record<string,unknown>).m_Name,'');
  const wrongName=structuredClone(candidate);
  (wrongName.objects.flatMap(o=>o.components).find(c=>c.componentId===id)!.data!.fields as
    Record<string,unknown>).m_Name=null;
  assert.throws(()=>validateV3(wrongName,source,assets),/invalid M1.3B structured candidate field type/);
  const unrelatedNull=structuredClone(candidate);
  const thermal=unrelatedNull.objects.flatMap(o=>o.components).find(c=>
    c.typeId==='unity.ThermalControllerBlock')!;
  (thermal.data!.fields as Record<string,unknown>).terminalName=null;
  assert.throws(()=>validateV3(unrelatedNull,source,assets),/invalid M1.3B structured candidate field type/);
});

test('M1.3B-1 all blank event argument strings preserve UI call semantics',()=>{
  const entries=report.normalizedBlankStrings as {componentId:string;fieldPath:string}[];
  assert.equal(entries.filter(e=>e.fieldPath==='.m_Name').length,83);
  assert.equal(entries.filter(e=>e.fieldPath.endsWith('.m_ObjectArgumentAssemblyTypeName')).length,5);
  assert.equal(entries.filter(e=>e.fieldPath.endsWith('.m_StringArgument')).length,5);
  assert.deepEqual(candidate.sourceCalls,draft.sourceCalls);
  for(const entry of entries.filter(e=>e.fieldPath.includes('.m_PersistentCalls.'))) {
    const part=candidate.objects.flatMap(o=>o.components).find(c=>c.componentId===entry.componentId)!;
    const raw=part.sourceSerialized!.rawYaml;
    const leaf=entry.fieldPath.split('.').at(-1)!;
    assert.match(raw,new RegExp(`^ {10}${leaf}:[ \\t]*$`,'m'));
    const calls=(part.data!.fields as Record<string,any>).m_OnClick?.m_PersistentCalls?.m_Calls??
      (part.data!.fields as Record<string,any>).m_OnValueChanged.m_PersistentCalls.m_Calls;
    const originals=(part.sourceSerialized!.fields as Record<string,any>).m_OnClick?.m_PersistentCalls?.m_Calls??
      (part.sourceSerialized!.fields as Record<string,any>).m_OnValueChanged.m_PersistentCalls.m_Calls;
    assert.equal(calls.length,originals.length);
    for(let i=0;i<calls.length;i++) for(const key of ['m_Target','m_TargetAssemblyTypeName','m_MethodName',
      'm_Mode','m_CallState','m_IntArgument','m_FloatArgument','m_BoolArgument','m_ObjectArgument'])
      assert.deepEqual(key in calls[i]?calls[i][key]:calls[i].m_Arguments[key],
        key in originals[i]?originals[i][key]:originals[i].m_Arguments[key]);
  }
  const changed=structuredClone(candidate);
  const part=changed.objects.flatMap(o=>o.components).find(c=>c.componentId===
    '8c0c24b2-773b-54d5-a739-b01475f551c8')!;
  const args=((part.data!.fields as Record<string,any>).m_OnClick.m_PersistentCalls.m_Calls[0].m_Arguments);
  args.m_StringArgument='User edit';
  assert.deepEqual(validateV3(changed,source,assets),changed);
  assert.equal(args.m_StringArgument,'User edit');
  const invalid=structuredClone(changed);
  const invalidArgs=(invalid.objects.flatMap(o=>o.components).find(c=>c.componentId===part.componentId)!
    .data!.fields as Record<string,any>).m_OnClick.m_PersistentCalls.m_Calls[0].m_Arguments;
  invalidArgs.m_StringArgument=null;
  assert.throws(()=>validateV3(invalid,source,assets),/invalid M1.3B structured candidate field type/);
  invalidArgs.m_StringArgument=42;
  assert.throws(()=>validateV3(invalid,source,assets),/invalid M1.3B structured candidate field type/);
});

test('M1.3B-1 explicit YAML null and uncontracted null cannot be normalized',()=>{
  const program=`import copy,json,runpy\nfrom pathlib import Path\nm=runpy.run_path('Tools/PhysicsLevelEditor/tools/prepare-m13b-level1.py')\ns=json.loads(Path('Levels/Drafts/M1.2/Level1.v3.draft.json').read_text(encoding='utf8'))\nc=next(c for o in s['objects'] for c in o['components'] if c['componentId']=='8c0c24b2-773b-54d5-a739-b01475f551c8')\nfor token in ('null','~'):\n x=copy.deepcopy(c);x['sourceSerialized']['rawYaml']=x['sourceSerialized']['rawYaml'].replace('m_StringArgument:', 'm_StringArgument: '+token)\n try:m['normalize_blank_string_scalars'](x,copy.deepcopy(x['sourceSerialized']['fields']))\n except ValueError:pass\n else:raise AssertionError('explicit YAML null accepted')\nx=copy.deepcopy(c);x['sourceSerialized']['fields']['m_OnClick']['m_PersistentCalls']['m_Calls'][0]['m_Arguments']['m_IntArgument']=None\ntry:m['normalize_blank_string_scalars'](x,copy.deepcopy(x['sourceSerialized']['fields']))\nexcept ValueError:pass\nelse:raise AssertionError('non-string null accepted')\nprint('STRICT_BLANK_SCALAR_REJECTION_PASS')`;
  const result=spawnSync('python',['-c',program],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/STRICT_BLANK_SCALAR_REJECTION_PASS/);
});

test('M1.3B-1 Camera Rect accepts valid viewport edits and rejects lossy values',()=>{
  const id='afffa288-277c-5d25-b83b-ac020868a6d7';
  const fields=(level:LevelDataV3)=>level.objects.flatMap(o=>o.components)
    .find(c=>c.componentId===id)!.data!.fields as Record<string,any>;
  assert.deepEqual(fields(candidate).m_NormalizedViewPortRect,
    {serializedVersion:2,x:0,y:0,width:1,height:1});
  const editedRect=structuredClone(candidate);
  fields(editedRect).m_NormalizedViewPortRect=
    {serializedVersion:2,x:0.25,y:0.25,width:0.5,height:0.5};
  assert.deepEqual(validateV3(editedRect,source,assets),editedRect);
  const boundary=structuredClone(candidate);
  fields(boundary).m_NormalizedViewPortRect=
    {serializedVersion:2,x:1,y:1,width:0,height:0};
  assert.deepEqual(validateV3(boundary,source,assets),boundary);
  for(const rect of [
    {serializedVersion:2,x:0,y:0,width:1},
    {serializedVersion:2,x:'0',y:0,width:1,height:1},
    {serializedVersion:3,x:0,y:0,width:1,height:1},
    {serializedVersion:2,x:0,y:0,width:-1,height:1},
    {serializedVersion:2,x:0.5,y:0,width:0.6,height:1},
    {serializedVersion:2,x:0,y:0,width:1,height:1,unknown:0},
  ]) {
    const invalid=structuredClone(candidate);
    fields(invalid).m_NormalizedViewPortRect=rect;
    assert.throws(()=>validateV3(invalid,source,assets),/Rect|field type/);
  }
  assert.deepEqual(fields(editedRect).m_NormalizedViewPortRect,
    {serializedVersion:2,x:0.25,y:0.25,width:0.5,height:0.5});
  assert.deepEqual(fields(candidate).m_NormalizedViewPortRect,
    {serializedVersion:2,x:0,y:0,width:1,height:1});
});

test('M1.3B-1 root HUD Canvas keeps source values and rejects edits to engine-driven fields',()=>{
  const id='8052fc0e-4012-5fba-8138-937c85f7b242';
  const root=candidate.objects.find(o=>o.id===id)!;
  const rect=root.components.find(c=>c.typeId==='unity.RectTransform')!;
  const canvas=root.components.find(c=>c.typeId==='unity.Canvas')!;
  const scaler=root.components.find(c=>c.typeId==='unity.CanvasScaler')!;
  assert.equal(root.parentId,null);
  assert.deepEqual(root.localPosition,rect.sourceSerialized!.fields.m_LocalPosition);
  assert.deepEqual(root.localScale,rect.sourceSerialized!.fields.m_LocalScale);
  assert.deepEqual(root.rectTransform!.anchoredPosition,rect.sourceSerialized!.fields.m_AnchoredPosition);
  assert.deepEqual(root.rectTransform!.sizeDelta,rect.sourceSerialized!.fields.m_SizeDelta);
  assert.deepEqual(root.rectTransform!.pivot,rect.sourceSerialized!.fields.m_Pivot);
  assert.equal(canvas.sourceSerialized!.fields.m_RenderMode,0);
  assert.equal((canvas.data!.fields as Record<string,unknown>).m_RenderMode,0);
  assert.equal(scaler.sourceSerialized!.fields.m_UiScaleMode,1);
  assert.deepEqual((scaler.data!.fields as Record<string,unknown>).m_ReferenceResolution,{x:1280,y:720});
  assert.equal((scaler.data!.fields as Record<string,unknown>).m_MatchWidthOrHeight,0.5);
  assert.deepEqual(root.sourceSerialized,draft.objects.find(o=>o.id===id)!.sourceSerialized);
  const edits:[string,(o:typeof root)=>void][]=[
    ['localPosition',o=>{o.localPosition.x=1;}],
    ['localScale',o=>{o.localScale.x=1;}],
    ['rectTransform.anchoredPosition',o=>{o.rectTransform!.anchoredPosition.x=1;}],
    ['rectTransform.sizeDelta',o=>{o.rectTransform!.sizeDelta.x=1;}],
    ['rectTransform.pivot',o=>{o.rectTransform!.pivot.x=0.5;}],
    ['rectTransform.offsetMin',o=>{o.rectTransform!.offsetMin!.x=1;}],
    ['CanvasScaler.m_ReferenceResolution',o=>{
      (o.components.find(c=>c.typeId==='unity.CanvasScaler')!.data!.fields as Record<string,any>)
        .m_ReferenceResolution.x=1920;
    }],
  ];
  for(const [name,apply] of edits) {
    const changed=structuredClone(candidate);
    apply(changed.objects.find(o=>o.id===id)!);
    assert.throws(()=>validateV3(changed,source,assets),
      /engine-driven root Canvas field edit is unsupported|root Canvas layout configuration edit is unsupported|derived root Canvas field edit is unsupported/,
      name);
  }
  const ordinary=structuredClone(candidate);
  const child=ordinary.objects.find(o=>o.parentId===id&&o.rectTransform)!;
  assert.ok(child);
  child.rectTransform!.anchoredPosition.x+=4;
  assert.deepEqual(validateV3(ordinary,source,assets),ordinary);
});

test('M1.3B-1 child UI position source inventory remains distinct from anchored layout',()=>{
  const byId=new Map(candidate.objects.map(o=>[o.id,o]));
  const ordinary=candidate.objects.filter(o=>o.rectTransform&&o.parentId&&
    byId.get(o.parentId)?.rectTransform&&!o.components.some(c=>c.typeId==='unity.Canvas'));
  assert.equal(ordinary.length,24);
  const atRisk=ordinary.filter(o=>o.localPosition.x===0&&o.localPosition.y===0&&
    (o.rectTransform!.anchoredPosition.x!==0||o.rectTransform!.anchoredPosition.y!==0));
  assert.equal(atRisk.length,15);
  for(const originalUi of atRisk) {
    const moved=structuredClone(candidate);
    const ui=moved.objects.find(o=>o.id===originalUi.id)!;
    ui.rectTransform!.anchoredPosition.x+=7;
    assert.deepEqual(validateV3(moved,source,assets),moved,
      `${originalUi.id}: anchored edit must remain valid`);
    const invalid=structuredClone(candidate);
    invalid.objects.find(o=>o.id===originalUi.id)!.localPosition.x+=7;
    assert.throws(()=>validateV3(invalid,source,assets),
      /ordinary child UI XY is derived from anchoredPosition/,
      `${originalUi.id}: conflicting source local XY edit must be refused`);
  }
  const child=candidate.objects.find(o=>o.id==='3acaa307-7c5f-5b8d-b2e9-afa364f106cb')!;
  const original=draft.objects.find(o=>o.id===child.id)!;
  assert.equal(child.sourceFileId,'180290158');
  assert.equal(child.components.find(c=>c.typeId==='unity.RectTransform')!.sourceFileId,'180290159');
  assert.deepEqual(child.localPosition,{x:0,y:0,z:0});
  assert.deepEqual(child.rectTransform!.anchoredPosition,{x:380,y:310});
  assert.deepEqual(child.localPosition,original.localPosition);
  assert.deepEqual(child.rectTransform,original.rectTransform);
  const parent=byId.get(child.parentId!)!;
  for(const o of [child,parent]) assert.ok(o.components.every(c=>
    !['unity.HorizontalLayoutGroup','unity.VerticalLayoutGroup','unity.GridLayoutGroup',
      'unity.ContentSizeFitter','unity.AspectRatioFitter'].includes(c.typeId)));
  const editedChild=structuredClone(candidate);
  editedChild.objects.find(o=>o.id===child.id)!.rectTransform!.anchoredPosition.x=400;
  assert.deepEqual(validateV3(editedChild,source,assets),editedChild);
  assert.deepEqual(editedChild.objects.find(o=>o.id===child.id)!.localPosition,{x:0,y:0,z:0});
});

test('M1.3B-1 edited field remains independent of source backup; unsafe references fail',()=>{
  const edited=structuredClone(candidate);
  const ice=edited.objects.find(o=>o.name==='Ice step 2')!;
  const collider=ice.components.find(c=>c.typeId==='unity.BoxCollider2D')!;
  (collider.data!.fields as Record<string,unknown>).m_Size={x:1,y:1.25};
  assert.deepEqual(validateV3(edited,source,assets),edited);
  assert.deepEqual(collider.sourceSerialized?.fields.m_Size,{x:1,y:1});
  const broken=structuredClone(candidate);
  const thermal=broken.objects.find(o=>o.name==='Thermal controller B')!.components.find(
    c=>c.typeId==='unity.ThermalControllerBlock')!;
  const refs=thermal.data!.references as {fieldPath:string;target:unknown}[];
  refs.find(r=>r.fieldPath==='.linkedController')!.target={kind:'component',levelId:broken.levelId,
    objectId:'00000000-0000-4000-8000-000000000000',componentId:'00000000-0000-4000-8000-000000000001',
    componentTypeId:'unity.ThermalControllerBlock'};
  assert.throws(()=>validateV3(broken,source,assets),/missing object target/);
  const unknown=structuredClone(candidate);
  (unknown.objects[0].components[0].data!.fields as Record<string,unknown>).unexpected=1;
  assert.throws(()=>validateV3(unknown,source,assets),/invalid M1.3B structured candidate/);
  const structural=structuredClone(candidate);
  const transform=structural.objects[0].components.find(c=>c.typeId==='unity.RectTransform')!;
  (transform.data!.fields as Record<string,unknown>).m_LocalPosition={x:10,y:0,z:0};
  assert.throws(()=>validateV3(structural,source,assets),/Transform authority/);
  const oldFileId=structuredClone(candidate);
  const linked=oldFileId.objects.find(o=>o.name==='Thermal controller B')!.components.find(
    c=>c.typeId==='unity.ThermalControllerBlock')!;
  (linked.data!.fields as Record<string,unknown>).linkedController={fileID:'999999'};
  assert.throws(()=>validateV3(oldFileId,source,assets),/native fileID cannot override typed reference/);
});

test('M1.3B-1 edited fixture changes only structured platform position and vent force',()=>{
  assert.deepEqual(validateV3(edited,source,assets),edited);
  assert.deepEqual(edited.objects.map(o=>o.id),candidate.objects.map(o=>o.id));
  const start=edited.objects.find(o=>o.id==='46c11342-6027-593d-87d5-ff1d6cb512b2')!;
  const originalStart=candidate.objects.find(o=>o.id===start.id)!;
  assert.equal(originalStart.localPosition.x,-5);
  assert.equal(start.localPosition.x,-4.5);
  const vent=edited.objects.find(o=>o.id==='fa949e9b-1ebb-54c1-b252-8ae8a737e2b3')!;
  const originalVent=candidate.objects.find(o=>o.id===vent.id)!;
  const field=(o:typeof vent)=>o.components.find(c=>c.typeId==='unity.AirVentBlock')!.data!.fields as Record<string,unknown>;
  assert.equal(field(originalVent).upwardForce,19);
  assert.equal(field(vent).upwardForce,20);
  assert.deepEqual(start.sourceSerialized,originalStart.sourceSerialized);
  assert.deepEqual(vent.components.map(c=>c.sourceSerialized),originalVent.components.map(c=>c.sourceSerialized));
  assert.deepEqual(vent.components.map(c=>c.data?.references),originalVent.components.map(c=>c.data?.references));
});
