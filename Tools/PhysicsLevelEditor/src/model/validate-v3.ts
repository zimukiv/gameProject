import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {createHash} from 'node:crypto';
import manifestSchema from './project-manifest-v1.schema.json' with {type:'json'};
import inventorySchema from './source-inventory-v1.schema.json' with {type:'json'};
import resourceSchema from './resource-manifest-v1.schema.json' with {type:'json'};
import levelSchema from './level-v3.schema.json' with {type:'json'};
import {registryV2, type FieldSpec} from './registry-v2.ts';
import {observedBaseBlockPartners,registeredV3Type} from './registry-v3.ts';
import {sourceComponentId,sourceObjectId} from './identity-v3.ts';
import {openVersionedLevel} from './validate-v2.ts';
import type {KnownLevel,LevelDataV3,ObjectV3,ProjectManifestV1,RefV3,
  ResourceManifestV1,RoomId,SourceInventoryV1,UnitySourceDocumentV3,SourceReference} from './m1-contract.ts';

const ajv=new Ajv2020({allErrors:true,strict:false});addFormats(ajv);
const schemas={manifest:ajv.compile(manifestSchema),inventory:ajv.compile(inventorySchema),
  resources:ajv.compile(resourceSchema),level:ajv.compile(levelSchema)};
const fail=(message:string):never=>{throw new Error(message);};
function shape(name:keyof typeof schemas,value:unknown):void {
  const check=schemas[name];
  if(!check(value)) fail(`${name} schema: `+(check.errors??[]).map(e=>`${e.instancePath||'/'} ${e.message}`).join('; '));
}
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const counts:Record<RoomId,{objects:number;components:number;calls:number;owners:Record<'A'|'B'|'C'|'D',number>}>= {
  room1:{objects:71,components:254,calls:5,owners:{A:33,B:3,C:30,D:5}},
  room2:{objects:64,components:221,calls:5,owners:{A:28,B:4,C:30,D:2}},
  room3:{objects:72,components:254,calls:11,owners:{A:34,B:6,C:30,D:2}}
};
function portable(path:string):boolean {
  return !/^(?:[a-z]:|\/|\\)/i.test(path) && !path.split(/[\\/]/).includes('..') && !path.includes('\\');
}
export function validateProjectManifest(value:unknown):ProjectManifestV1 {
  shape('manifest',value);const manifest=value as ProjectManifestV1;
  if(manifest.rooms.length!==3) fail('ProjectManifest must list exactly three rooms');
  const expected:[RoomId,string,string][]=[
    ['room1','Level1.unity','物理'],['room2','Level2.unity','高数'],['room3','Level3.unity','水课']];
  for(let i=0;i<3;i++) {
    const room=manifest.rooms[i], [id,scene,name]=expected[i];
    if(room.roomId!==id || room.displayName!==name || !room.sourceScene.path.endsWith('/'+scene) ||
      room.levelId!==`unity:${room.sourceScene.guid}`) fail(`ProjectManifest room ${i} identity mismatch`);
    if(room.migrationState==='sourceOnly' && room.levelDataPath!==null)
      fail(`${id}: sourceOnly room cannot claim a V3 level file`);
    if(room.migrationState!=='sourceOnly' && !room.levelDataPath)
      fail(`${id}: migrated room requires a level file`);
    if(!portable(room.sourceMapPath) || room.levelDataPath && !portable(room.levelDataPath))
      fail(`${id}: non-portable project path`);
    const expectedCount=counts[id];
    if(room.sourceObjectCount!==expectedCount.objects || room.sourceComponentCount!==expectedCount.components ||
      room.sourceEventCount!==expectedCount.calls) fail(`${id}: source counts differ from M0.1 baseline`);
  }
  if(!portable(manifest.resourceManifestPath)) fail('Non-portable resource manifest path');
  return manifest;
}

export function validateResourceManifest(value:unknown):ResourceManifestV1 {
  shape('resources',value);const manifest=value as ResourceManifestV1;
  const seen=new Set<string>();
  for(const asset of manifest.resources) {
    if(asset.assetId!==`unity:${asset.unityGuid}:${asset.localFileId}` || seen.has(asset.assetId))
      fail(`Duplicate or mismatched asset ID ${asset.assetId}`);
    seen.add(asset.assetId);
    if(asset.packagePath!==null && !portable(asset.packagePath)) fail(`Non-portable asset path ${asset.assetId}`);
    if(asset.sourceKind==='projectAsset' && (!asset.sourcePath || !asset.sourceSha256))
      fail(`Project asset lacks source provenance ${asset.assetId}`);
    if(asset.sourceKind!=='projectAsset' && asset.packagePath!==null)
      fail(`Source-only dependency cannot claim packaged bytes ${asset.assetId}`);
    if(new Set(asset.usedByRooms).size!==asset.usedByRooms.length) fail(`Duplicate room in ${asset.assetId}`);
  }
  return manifest;
}

export function validateSourceInventories(manifest:ProjectManifestV1,values:unknown[],
  resources:ResourceManifestV1,legacyLevel1:Map<string,string>):SourceInventoryV1[] {
  if(values.length!==3) fail('Exactly three source inventories required');
  if(legacyLevel1.size!==3) fail('Level1 legacy sidecar must contain the three existing IDs');
  const allIds=new Set<string>(),allComponentIds=new Set<string>();
  const validated:SourceInventoryV1[]=[];
  for(let i=0;i<3;i++) {
    shape('inventory',values[i]);const inv=values[i] as SourceInventoryV1;
    const room=manifest.rooms[i],count=counts[room.roomId];
    if(inv.roomId!==room.roomId || !same(inv.sourceScene,room.sourceScene))
      fail(`${room.roomId}: source scene identity mismatch`);
    if(inv.objects.length!==count.objects || inv.persistentCalls.length!==count.calls)
      fail(`${room.roomId}: incomplete source object or event inventory`);
    const byId=new Map(inv.objects.map(o=>[o.objectId,o]));
    const byComponent=new Map(inv.objects.flatMap(o=>o.components.map(c=>[c.componentId,{object:o,component:c}] as const)));
    const fileIds=new Set<string>(),componentFileIds=new Set<string>();
    const owners={A:0,B:0,C:0,D:0};let componentCount=0;
    for(const o of inv.objects) {
      owners[o.ownership]++;
      if(fileIds.has(o.sourceFileId)||allIds.has(o.objectId)) fail(`${room.roomId}: duplicate object source or ID ${o.sourceFileId}`);
      fileIds.add(o.sourceFileId);allIds.add(o.objectId);
      if(o.objectId!==sourceObjectId(inv.sourceScene.guid,o.sourceFileId,
        room.roomId==='room1'?legacyLevel1.get(o.sourceFileId):undefined))
        fail(`${room.roomId}: source object ID changed ${o.sourceFileId}`);
      const kind={A:'levelObject',B:'referenceMarker',C:'runnerBinding',D:'sceneConfigVisual'}[o.ownership];
      if(o.responsibility.kind!==kind || !o.responsibility.configPath.includes(o.objectId) ||
        (o.ownership==='C' && !o.responsibility.templateSlot))
        fail(`${room.roomId}/${o.objectId}: missing restoration responsibility`);
      if(o.parentObjectId!==null && !byId.has(o.parentObjectId))
        fail(`${room.roomId}/${o.objectId}: missing parent`);
      componentCount+=o.components.length;
      for(const c of o.components) {
        if(componentFileIds.has(c.sourceFileId)||allComponentIds.has(c.componentId))
          fail(`${room.roomId}: duplicate component source or ID ${c.sourceFileId}`);
        componentFileIds.add(c.sourceFileId);allComponentIds.add(c.componentId);
        if(c.componentId!==sourceComponentId(inv.sourceScene.guid,o.sourceFileId,c.sourceFileId) ||
          c.restoration!==kind || c.readiness!==o.responsibility.readiness)
          fail(`${room.roomId}/${o.objectId}: component provenance mismatch ${c.sourceFileId}`);
        for(const ref of c.references) {
          if(ref.kind==='object' && (!byId.has(ref.objectId) || byId.get(ref.objectId)?.sourceFileId!==ref.sourceFileId))
            fail(`${room.roomId}/${o.objectId}/${c.componentId}${ref.fieldPath}: missing object target`);
          if(ref.kind==='component' && (byComponent.get(ref.componentId)?.object.objectId!==ref.objectId ||
            byComponent.get(ref.componentId)?.component.sourceFileId!==ref.sourceFileId))
            fail(`${room.roomId}/${o.objectId}/${c.componentId}${ref.fieldPath}: wrong component target`);
          if(ref.kind==='asset' && !resources.resources.some(a=>a.assetId===ref.assetId &&
            a.usedByRooms.includes(room.roomId)))
            fail(`${room.roomId}/${o.objectId}/${c.componentId}${ref.fieldPath}: missing asset`);
        }
      }
    }
    if(componentCount!==count.components || !same(owners,count.owners))
      fail(`${room.roomId}: 729-component ownership baseline incomplete`);
    if(room.roomId==='room1') for(const [fileId,id] of legacyLevel1)
      if(inv.objects.find(o=>o.sourceFileId===fileId)?.objectId!==id)
        fail(`Level1 legacy object ID missing or changed ${fileId}`);
    for(const o of inv.objects) {
      const visited=new Set<string>();let current=o;
      while(current.parentObjectId) {
        if(!byId.has(current.parentObjectId)||visited.has(current.parentObjectId))
          fail(`${room.roomId}/${o.objectId}: cyclic hierarchy`);
        visited.add(current.parentObjectId);current=byId.get(current.parentObjectId)!;
      }
    }
    const callKeys=new Set<string>(),eventIds=new Set<string>();
    for(const call of inv.persistentCalls) {
      const source=byComponent.get(call.sourceComponentId),target=byComponent.get(call.targetComponentId);
      const key=`${call.sourceComponentId}:${call.fieldPath}:${call.callIndex}`;
      if(callKeys.has(key)||eventIds.has(call.eventId)) fail(`${room.roomId}: duplicate UnityEvent call ${key}`);
      callKeys.add(key);eventIds.add(call.eventId);
      if(!source || !target) return fail(`${room.roomId}: UnityEvent endpoint missing ${key}`);
      if(source.object.objectId!==call.sourceObjectId || target.object.objectId!==call.targetObjectId ||
        source.component.sourceFileId!==call.sourceComponentFileId ||
        target.component.sourceFileId!==call.targetComponentFileId ||
        target.component.unityType!==call.targetUnityType ||
        call.persistentCall.m_Target===undefined ||
        (call.persistentCall.m_Target as {fileID?:string}).fileID!==call.targetComponentFileId ||
        call.persistentCall.m_MethodName!==call.methodName ||
        call.persistentCall.m_Mode!==call.mode || call.persistentCall.m_CallState!==call.callState ||
        !same(call.persistentCall.m_Arguments,call.arguments))
        fail(`${room.roomId}: UnityEvent call lost source or payload ${key}`);
      const expectedClass=source.component.unityType==='Button'||source.component.unityType==='Slider'?'runnerUi':'levelDesign';
      if(call.classification!==expectedClass) fail(`${room.roomId}: UnityEvent ownership mismatch ${key}`);
    }
    validated.push(inv);
  }
  if(allIds.size!==207 || allComponentIds.size!==729 ||
    validated.flatMap(v=>v.persistentCalls).length!==21)
    fail('M0.1 inventory totals mismatch');
  return validated;
}

function fieldValue(data:Record<string,unknown>,spec:FieldSpec):unknown {
  const key=spec.path.split('.').slice(1).join('.');
  return data[key];
}
function finite(value:unknown):value is number{return typeof value==='number'&&Number.isFinite(value);}
function record(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
function sameFieldShape(a:unknown,b:unknown):boolean {
  if(Array.isArray(a)||Array.isArray(b)) return Array.isArray(a)&&Array.isArray(b)&&
    a.length===b.length&&a.every((x,i)=>sameFieldShape(x,b[i]));
  if(record(a)||record(b)) return record(a)&&record(b)&&
    same(Object.keys(a).sort(),Object.keys(b).sort())&&
    Object.keys(a).every(k=>sameFieldShape(a[k],b[k]));
  return typeof a===typeof b;
}
function nativeFieldAt(fields:Record<string,unknown>,path:string):unknown {
  let value:unknown=fields;
  for(const match of path.matchAll(/([^.[\]]+)|\[(\d+)\]/g)) {
    const key=match[1]??Number(match[2]);
    if((typeof key==='number'&&!Array.isArray(value))||
      (typeof key==='string'&&!record(value))) return undefined;
    value=(value as Record<string,unknown>)[key];
  }
  return value;
}
const nativeStructuralKeys=new Set(['m_ObjectHideFlags','m_CorrespondingSourceObject',
  'm_PrefabInstance','m_PrefabAsset','m_GameObject','m_Script','m_Enabled',
  'm_EditorClassIdentifier','m_EditorHideFlags','serializedVersion']);
const eventStringPath=/^\.m_On(?:Click|ValueChanged)\.m_PersistentCalls\.m_Calls\[\d+\]\.m_Arguments\.(?:m_ObjectArgumentAssemblyTypeName|m_StringArgument)$/;
function normalizedBlankStringFields(doc:UnitySourceDocumentV3,typeId:string,at:string):Record<string,unknown> {
  const fields=structuredClone(doc.fields);
  const visit=(value:unknown,path:string,parent?:Record<string,unknown>|unknown[],key?:string|number):void=>{
    if(value===null) {
      const allowed=doc.classId===114 && (path==='.m_Name'||
        ['unity.Button','unity.Slider'].includes(typeId)&&eventStringPath.test(path));
      if(!allowed) fail(`${at}${path}: null has no confirmed Unity string contract`);
      const name=path.slice(path.lastIndexOf('.')+1);
      const indent=path==='.m_Name'?'  ':'          ';
      const lines=doc.rawYaml.split(/\r?\n/).filter(line=>
        line.startsWith(indent+name+':') && line.slice((indent+name+':').length).trim()==='');
      if(lines.length!==1) fail(`${at}${path}: null lacks a unique blank YAML scalar`);
      (parent as Record<string|number,unknown>)[key!]='';
    } else if(Array.isArray(value)) value.forEach((child,i)=>visit(child,`${path}[${i}]`,value,i));
    else if(record(value)) for(const [childKey,child] of Object.entries(value))
      visit(child,`${path}.${childKey}`,value,childKey);
  };
  visit(fields,'');
  return fields;
}
function validateCameraViewport(fields:Record<string,unknown>,at:string):void {
  const rect=fields.m_NormalizedViewPortRect;
  const path=`${at}.m_NormalizedViewPortRect`;
  if(!record(rect)) fail(`${path}: invalid Unity Rect structure or version`);
  const rectFields=rect as Record<string,unknown>;
  if(!same(Object.keys(rectFields).sort(),
    ['serializedVersion','x','y','width','height'].sort())||rectFields.serializedVersion!==2)
    fail(`${path}: invalid Unity Rect structure or version`);
  const values=['x','y','width','height'].map(key=>rectFields[key]);
  if(!values.every(finite)) fail(`${path}: expected finite numeric Rect coordinates`);
  const [x,y,width,height]=values as number[];
  if(x<0||y<0||width<0||height<0||x>1||y>1||
    x+width>1+1e-7||y+height>1+1e-7)
    fail(`${path}: normalized Camera viewport must fit within [0,1]`);
}
const level1HudId='8052fc0e-4012-5fba-8138-937c85f7b242';
const level1LegacyFontId='187b1e5f-f498-5619-b47b-1f55bdb68668';
function validateLevel1FontContract(fields:Record<string,unknown>,sourceFields:Record<string,unknown>):void {
  const at=`${level1LegacyFontId}.m_FontData`;
  const current=fields.m_FontData,source=sourceFields.m_FontData;
  if(!record(current)||!record(source)) fail(`${at}: expected FontData`);
  const font=current as Record<string,unknown>,original=source as Record<string,unknown>;
  const size=font.m_FontSize,min=font.m_MinSize,max=font.m_MaxSize,bestFit=font.m_BestFit;
  if(![size,min,max,bestFit].every(Number.isInteger)||
    (size as number)<0||(size as number)>300||(min as number)<0||
    (min as number)>(size as number)||(max as number)<0||(max as number)>300||
    ![0,1].includes(bestFit as number)) fail(`${at}: invalid uGUI FontData value`);
  const keys=['m_FontSize','m_MinSize','m_MaxSize','m_BestFit'];
  const legacy=(max as number)<(size as number)&&keys.every(key=>same(font[key],original[key]))&&
    size===46&&min===10&&max===40&&bestFit===0;
  if((max as number)<(size as number)&&!legacy)
    fail(`${at}: m_MaxSize below m_FontSize; edit both fields to a valid uGUI range`);
}
function validateLevel1HudDrivenFields(o:ObjectV3):void {
  if(o.id!==level1HudId) return;
  const component=(type:string)=>o.components.find(c=>c.typeId===type);
  const rect=component('unity.RectTransform'),canvas=component('unity.Canvas');
  const scaler=component('unity.CanvasScaler');
  if(o.parentId!==null||o.ownership!=='C'||!o.rectTransform||!rect?.sourceSerialized||
    !canvas?.sourceSerialized||!scaler?.sourceSerialized||
    canvas.sourceSerialized.fields.m_RenderMode!==0||
    scaler.sourceSerialized.fields.m_UiScaleMode!==1)
    fail(`${o.id}: root Screen Space Overlay Canvas source contract changed`);
  const raw=rect!.sourceSerialized!.fields;
  const layout=o.rectTransform!;
  for(const [path,actual,original] of [
    ['localPosition',o.localPosition,raw.m_LocalPosition],
    ['localScale',o.localScale,raw.m_LocalScale],
    ['rectTransform.anchoredPosition',layout.anchoredPosition,raw.m_AnchoredPosition],
    ['rectTransform.sizeDelta',layout.sizeDelta,raw.m_SizeDelta],
    ['rectTransform.pivot',layout.pivot,raw.m_Pivot],
  ] as const) if(!same(actual,original))
    fail(`${o.id}.${path}: engine-driven root Canvas field edit is unsupported`);
  const anchored=raw.m_AnchoredPosition as {x:number;y:number};
  const size=raw.m_SizeDelta as {x:number;y:number};
  const pivot=raw.m_Pivot as {x:number;y:number};
  for(const [key,original] of [
    ['offsetMin',{x:anchored.x-size.x*pivot.x,y:anchored.y-size.y*pivot.y}],
    ['offsetMax',{x:anchored.x+size.x*(1-pivot.x),y:anchored.y+size.y*(1-pivot.y)}],
  ] as const) if(!same(layout[key],original))
    fail(`${o.id}.rectTransform.${key}: derived root Canvas field edit is unsupported`);
  for(const [part,keys] of [[canvas,['m_RenderMode']],
    [scaler,['m_UiScaleMode','m_ReferenceResolution','m_MatchWidthOrHeight']]] as const) {
    const component=part!;
    const fields=component.data?.fields as Record<string,unknown>|undefined;
    for(const key of keys) if(!fields||!same(fields[key],component.sourceSerialized!.fields[key]))
      fail(`${o.id}/${component.componentId}.${key}: root Canvas layout configuration edit is unsupported`);
  }
}
const sha256=(value:string)=>createHash('sha256').update(value,'utf8').digest('hex');
function rawDocument(doc:UnitySourceDocumentV3,at:string,expectedSha?:string):void {
  if(sha256(doc.rawYaml)!==doc.sha256 || expectedSha && doc.sha256!==expectedSha)
    fail(`${at}: Unity source document SHA-256 mismatch`);
  if(!doc.rawYaml.startsWith(`--- !u!${doc.classId} &${doc.sourceFileId}`))
    fail(`${at}: Unity source document header mismatch`);
}
function checkSourceReference(ref:SourceReference,at:string,objects:Map<string,ObjectV3>,
  components:Map<string,string>,sceneDocuments:Set<string>,assets:ResourceManifestV1):void {
  if(ref.kind==='null') return;
  if(ref.kind==='asset') {
    if(!assets.resources.some(a=>a.assetId===ref.assetId && a.unityGuid===ref.unityGuid &&
      a.localFileId===ref.localFileId)) fail(`${at}: source asset missing or wrong GUID/localFileId`);
  } else if(ref.kind==='sceneSetting') {
    if(!sceneDocuments.has(ref.sourceFileId)) fail(`${at}: missing scene setting ${ref.sourceFileId}`);
  } else {
    const object=objects.get(ref.objectId);
    if(!object || object.sourceFileId!==ref.sourceFileId && ref.kind==='object')
      fail(`${at}: source object reference mismatch`);
    if(ref.kind==='component' && (components.get(ref.componentId)!==ref.objectId ||
      !object?.components.some(c=>c.componentId===ref.componentId && c.sourceFileId===ref.sourceFileId)))
      fail(`${at}: source component reference mismatch`);
  }
}
export function validateV3(value:unknown,source?:SourceInventoryV1,assets?:ResourceManifestV1):LevelDataV3 {
  shape('level',value);const level=value as LevelDataV3;
  if(level.coverage==='exportedUnverified' && (!source || !assets))
    fail('V3 exported draft requires source inventory and resource manifest for validation');
  if(level.sceneConfig.sourceSceneSha256!==level.sourceScene.sha256)
    fail('V3 scene configuration source hash mismatch');
  if(source && (level.roomId!==source.roomId || !same(level.sourceScene,source.sourceScene)))
    fail('V3 source scene mismatch');
  const byId=new Map<string,ObjectV3>(),componentIds=new Set<string>(),eventIds=new Set<string>();
  for(const o of level.objects) {
    if(byId.has(o.id)) fail(`Duplicate V3 object ID ${o.id}`);byId.set(o.id,o);
     const origin=source?.objects.find(s=>s.objectId===o.id);
     if(source && o.sourceFileId!==null && (!origin || origin.sourceFileId!==o.sourceFileId ||
       origin.ownership!==o.ownership || !same(origin.responsibility,o.responsibility)))
       fail(`${o.id}: V3 object source identity or ownership mismatch`);
     if(source && o.sourceFileId===null && origin)
       fail(`${o.id}: source object cannot lose its fileID`);
     if(o.sourceSerialized) rawDocument(o.sourceSerialized,`${o.id}/GameObject`,origin?.sourceGameObjectSha256);
    const q=o.localRotation,length=Math.hypot(q.x,q.y,q.z,q.w);
    if(!Number.isFinite(length)||Math.abs(length-1)>0.0001) fail(`${o.id}: rotation quaternion is not normalized`);
    if(!o.rectTransform && (o.localScale.x===0||o.localScale.y===0||o.localScale.z===0))
      fail(`${o.id}: zero scale`);
    if(o.rectTransform && o.ownership==='A') fail(`${o.id}: UI RectTransform cannot be a plain world object`);
    if(o.ownership==='C'&&!o.responsibility.templateSlot) fail(`${o.id}: runner slot missing`);
    const seenTypes=new Set<string>(),behaviours:string[]=[];
    for(const c of o.components) {
      if(componentIds.has(c.componentId)) fail(`Duplicate V3 component ID ${c.componentId}`);
      componentIds.add(c.componentId);seenTypes.add(c.typeId);
       if(source && c.sourceFileId!==null && (!origin || !origin.components.some(s=>
         s.componentId===c.componentId && s.sourceFileId===c.sourceFileId &&
         s.sourceDocumentSha256===c.sourceDocumentSha256)))
         fail(`${o.id}/${c.componentId}: V3 component source provenance mismatch`);
       if(c.sourceSerialized) rawDocument(c.sourceSerialized,`${o.id}/${c.componentId}`,c.sourceDocumentSha256??undefined);
      if(c.dataStatus==='sourceOnly') {
         if(c.data!==null||!c.sourceDocumentSha256||o.sourceFileId===null||c.sourceFileId===null)
          fail(`${o.id}/${c.componentId}: source-only component lacks source provenance`);
        continue;
      }
       if(c.dataStatus==='m13aMapped') {
         if(!['unity.Transform','unity.SpriteRenderer','unity.BoxCollider2D','unity.BaseBlock',
           'unity.IceBlock','unity.ThermalControllerBlock'].includes(c.typeId) ||
           c.version!==1 || !record(c.data) || !c.sourceSerialized)
           fail(`${o.id}/${c.componentId}: unsupported M1.3A mapped component`);
         continue;
       }
       if(c.dataStatus==='m13bCandidate') {
         const data=c.data;
         if(level.roomId!=='room1'||!source||!assets||c.version!==1||
           !record(data)||!record(data.fields)||!Array.isArray(data.references)||
           !c.sourceSerialized||!c.sourceReferences)
           fail(`${o.id}/${c.componentId}: invalid M1.3B structured candidate or missing provenance`);
         const candidate=data as {fields:Record<string,unknown>;references:{fieldPath:string;target:RefV3|null}[]};
         const sourceRefs=c.sourceReferences!;
         const rawFields=c.sourceSerialized!.fields;
         const expectedFields=normalizedBlankStringFields(c.sourceSerialized!,c.typeId,
           `${o.id}/${c.componentId}`);
         if(!sameFieldShape(candidate.fields,expectedFields))
           fail(`${o.id}/${c.componentId}: invalid M1.3B structured candidate field type`);
         if(c.componentId===level1LegacyFontId)
           validateLevel1FontContract(candidate.fields,rawFields);
         if(c.typeId==='unity.Camera')
           validateCameraViewport(candidate.fields,`${o.id}/${c.componentId}`);
         if(!same(Object.keys(candidate).sort(),['fields','references']))
           fail(`${o.id}/${c.componentId}: unknown M1.3B candidate data field`);
         if(['unity.Transform','unity.RectTransform'].includes(c.typeId) &&
           !same(candidate.fields,rawFields))
           fail(`${o.id}/${c.componentId}: Transform authority is ObjectV3, not native field backup`);
         for(const key of nativeStructuralKeys) if(key in rawFields &&
           !same(candidate.fields[key],rawFields[key]))
           fail(`${o.id}/${c.componentId}: ${key} is structural provenance, not editable data`);
         const original=origin?.components.find(x=>x.componentId===c.componentId);
         if(!original||!same(sourceRefs,original.references)||
           candidate.references.length!==sourceRefs.length)
           fail(`${o.id}/${c.componentId}: M1.3B source reference coverage changed`);
         for(let i=0;i<sourceRefs.length;i++) {
           const before=sourceRefs[i],entry=candidate.references[i];
           if(!record(entry)||!same(Object.keys(entry).sort(),['fieldPath','target'])||
             entry.fieldPath!==before.fieldPath||
             before.kind==='null' && entry.target!==null||
             before.kind!=='null' && (!record(entry.target)||entry.target.kind!==before.kind))
             fail(`${o.id}/${c.componentId}: M1.3B reference shape mismatch at ${before.fieldPath}`);
           if(entry.target) {
             const keys=({object:['kind','levelId','objectId'],
               component:['kind','levelId','objectId','componentId','componentTypeId'],
               asset:['kind','assetId'],transform:['kind','levelId','objectId'],
               runtimeService:['kind','serviceId']} as Record<string,string[]>)[entry.target.kind];
             if(!keys||!same(Object.keys(entry.target).sort(),[...keys].sort()))
               fail(`${o.id}/${c.componentId}: unknown M1.3B reference field at ${before.fieldPath}`);
           }
           if(!same(nativeFieldAt(candidate.fields,before.fieldPath),
             nativeFieldAt(rawFields,before.fieldPath)))
             fail(`${o.id}/${c.componentId}: ${before.fieldPath} native fileID cannot override typed reference`);
         }
         continue;
       }
       const spec=registryV2[c.typeId],data=c.data;
       if(!registeredV3Type(c.typeId)||!spec||c.version!==spec.version||!record(data))
         return fail(`${o.id}/${c.componentId}: unknown registered component or version`);
      const keys=spec.fields.map(f=>f.path.split('.').slice(1).join('.'));
       if(!same(Object.keys(data).sort(),keys.sort())) fail(`${o.id}/${c.typeId}: unknown or missing field`);
      for(const f of spec.fields) {
         const v=fieldValue(data,f),at=`${o.id}/${c.typeId}/${f.path}`;
        if(v===null && ['sceneObjectRef','sceneComponentRef','transformRef','assetRef'].includes(f.type)
          && f.defaultValue===null && f.path!=='railgun.launchEndPoint') continue;
        if(f.type==='number'||f.type==='integer') {
          if(!finite(v)||(f.type==='integer'&&!Number.isInteger(v))||
            f.minimum!==undefined&&v<f.minimum||f.maximum!==undefined&&v>f.maximum) fail(`${at}: invalid number`);
        } else if(f.type==='boolean' && typeof v!=='boolean') fail(`${at}: expected boolean`);
        else if((f.type==='text'||f.type==='enum') && (typeof v!=='string'||f.choices&&!f.choices.includes(v)))
          fail(`${at}: invalid text or enum`);
        else if(['vec2','vec3','color'].includes(f.type)) {
          const keys=f.type==='vec2'?['x','y']:f.type==='vec3'?['x','y','z']:['r','g','b','a'];
          if(!record(v)||!same(Object.keys(v).sort(),keys.sort())||keys.some(k=>!finite(v[k])))
            fail(`${at}: invalid vector or color`);
        } else if(f.type==='refArray') {
          if(!Array.isArray(v)||v.some(x=>!record(x) ||
            (f.targetType==='transform'?x.kind!=='transform':x.kind!=='component')))
            fail(`${at}: invalid typed reference array`);
        } else if(['sceneObjectRef','sceneComponentRef','transformRef','assetRef'].includes(f.type)) {
          const kind=({sceneObjectRef:'object',sceneComponentRef:'component',transformRef:'transform',assetRef:'asset'} as Record<string,string>)[f.type];
          if(!record(v)||v.kind!==kind) fail(`${at}: required ${kind} reference missing or wrong kind`);
        }
      }
      if(spec.exclusiveGroup==='behaviour') behaviours.push(c.typeId);
    }
    if(level.roomId==='room1' && o.components.some(c=>c.dataStatus==='m13bCandidate'))
      validateLevel1HudDrivenFields(o);
    if(level.roomId==='room1' && o.components.some(c=>c.dataStatus==='m13bCandidate') &&
      o.parentId!==null && o.rectTransform &&
      level.objects.find(parent=>parent.id===o.parentId)?.rectTransform &&
      !o.components.some(c=>c.typeId==='unity.Canvas')) {
      const original=o.components.find(c=>c.typeId==='unity.RectTransform')?.sourceSerialized?.fields
        .m_LocalPosition as {x:number;y:number;z:number}|undefined;
      if(!original || o.localPosition.x!==original.x || o.localPosition.y!==original.y)
        fail(`${o.id}.localPosition: ordinary child UI XY is derived from anchoredPosition; edit rectTransform.anchoredPosition instead`);
      const parent=level.objects.find(p=>p.id===o.parentId)!;
      const layoutTypes=['LayoutGroup','Fitter'];
      if([...o.components,...parent.components].some(c=>layoutTypes.some(type=>c.typeId.includes(type))))
        fail(`${o.id}: layout-driven child UI requires a separate adapter`);
    }
    if(behaviours.length>1 && !(behaviours.length===2 && behaviours.includes('physics.platform') &&
      behaviours.some(t=>observedBaseBlockPartners.has(t))))
      fail(`${o.id}: unsupported co-located behaviour combination`);
    for(const c of o.components) if(c.dataStatus==='registered') {
      const spec=registryV2[c.typeId];
      for(const required of spec.requires) if(!seenTypes.has(required))
        fail(`${o.id}/${c.typeId}: missing component dependency ${required}`);
    }
  }
  const validateRef=(ref:RefV3,at:string,expected?:string):void=>{
    if(ref.kind==='asset') {
      const asset=assets?.resources.find(a=>a.assetId===ref.assetId);
      if(assets&&!asset) fail(`${at}: missing asset ${ref.assetId}`);
      if(asset&&expected&&asset.assetType!==expected)
        fail(`${at}: asset type mismatch, expected ${expected}`);
      return;
    }
    if(ref.kind==='runtimeService') {
      if(!['saveManager','scoreManager','levelManager','settingsManager','gameManager'].includes(ref.serviceId))
        fail(`${at}: unsupported runtime service ${ref.serviceId}`);
      return;
    }
    if(ref.levelId!==level.levelId) fail(`${at}: cross-room reference`);
    const target=byId.get(ref.objectId);
     if(!target) return fail(`${at}: missing object target ${ref.objectId}`);
     if(ref.kind==='transform' && !target.components.some(c=>
       ['core.transform','core.rectTransform','unity.Transform','unity.RectTransform'].includes(c.typeId)))
      fail(`${at}: target lacks Transform`);
    if(ref.kind==='component' && !target.components.some(c=>c.componentId===ref.componentId &&
      c.typeId===ref.componentTypeId && (!expected||c.typeId===expected)))
      fail(`${at}: target component type or ID mismatch`);
  };
  for(const o of level.objects) {
    if(o.parentId!==null && !byId.has(o.parentId)) fail(`${o.id}: missing parent`);
    const seen=new Set<string>();let cursor=o;
    while(cursor.parentId) {
      if(seen.has(cursor.parentId)) fail(`${o.id}: cyclic hierarchy`);
      seen.add(cursor.parentId);cursor=byId.get(cursor.parentId)!;
    }
    for(const c of o.components) if(c.dataStatus==='registered'&&c.data) {
      for(const f of registryV2[c.typeId].fields) {
        const v=fieldValue(c.data,f),at=`${o.id}/${c.componentId}/${f.path}`;
        if(v===null) continue;
         if(f.type==='refArray') {
          for(const [i,ref] of (v as RefV3[]).entries()) validateRef(ref,`${at}[${i}]`,f.targetType);
        } else if(['sceneObjectRef','sceneComponentRef','transformRef','assetRef'].includes(f.type))
          validateRef(v as RefV3,at,f.targetType);
      }
    }
    for(const c of o.components) if(c.dataStatus==='m13bCandidate'&&c.data) {
      const data=c.data as {references:{fieldPath:string;target:RefV3|null}[]};
      for(let i=0;i<data.references.length;i++) {
        const entry=data.references[i],original=c.sourceReferences![i];
        if(!entry.target) continue;
        const expected=original.kind==='component'?
          byId.get(original.objectId)?.components.find(x=>x.componentId===original.componentId)?.typeId:
          original.kind==='asset'?assets?.resources.find(x=>x.assetId===original.assetId)?.assetType:undefined;
        validateRef(entry.target,`${o.id}/${c.componentId}${entry.fieldPath}`,expected);
      }
    }
  }
  for(const event of level.events) {
    if(eventIds.has(event.id)) fail(`Duplicate V3 event ID ${event.id}`);eventIds.add(event.id);
    if(event.sourcePersistentCallId && source && !source.persistentCalls.some(c=>c.eventId===event.sourcePersistentCallId))
      fail(`${event.id}: unknown source UnityEvent`);
    if(event.trigger.source) validateRef(event.trigger.source,`${event.id}/trigger`);
    for(const condition of event.conditions) if(condition.target) validateRef(condition.target,`${event.id}/condition`);
    const actions=new Set<string>();
    for(const action of event.orderedActions) {
      if(actions.has(action.id)) fail(`${event.id}: duplicate action ID`);actions.add(action.id);
      if(action.target) validateRef(action.target,`${event.id}/${action.id}`);
      if(action.delaySeconds!==null && (!finite(action.delaySeconds)||action.delaySeconds<0))
        fail(`${event.id}/${action.id}: invalid delay`);
    }
  }
  if(new Set(level.resourceIds).size!==level.resourceIds.length) fail('Duplicate V3 resource ID');
  if(assets) for(const id of level.resourceIds) if(!assets.resources.some(a=>a.assetId===id))
    fail(`Missing V3 resource ${id}`);
  if(level.coverage==='exportedUnverified' && source && assets) {
    if(level.objects.length!==source.objects.length || source.objects.some(o=>!byId.has(o.objectId)))
      fail('V3 exported draft does not contain every source GameObject');
    const allDocs:UnitySourceDocumentV3[]=[];
    const componentOwners=new Map<string,string>();
    const sceneDocs=level.sceneConfig.sourceDocuments,sceneRefs=level.sceneConfig.sourceReferences;
    if(!level.sceneConfig.sourceHeader || !sceneDocs || !sceneRefs ||
      !level.sourceCalls || !same(level.sourceCalls,source.persistentCalls))
      return fail('V3 exported draft missing scene settings or original UnityEvent calls');
    for(const o of level.objects) {
      const origin=source.objects.find(s=>s.objectId===o.id)!;
      const goDoc=o.sourceSerialized;
      if(!goDoc || o.siblingIndex===undefined || !o.sourceReferences ||
        o.components.length!==origin.components.length)
        return fail(`${o.id}: exported GameObject fields or component count missing`);
      rawDocument(goDoc,`${o.id}/GameObject`,origin.sourceGameObjectSha256);
      if(goDoc.sourceFileId!==o.sourceFileId || goDoc.classId!==1 ||
        goDoc.unityType!=='GameObject' ||
        goDoc.fields.m_Name!==o.name ||
        Boolean(goDoc.fields.m_IsActive)!==o.active ||
        goDoc.fields.m_Layer!==o.layer ||
        goDoc.fields.m_TagString!==o.tag)
        fail(`${o.id}: exported GameObject identity/config differs from source fields`);
      allDocs.push(goDoc);
      for(const c of o.components) {
        const original=origin.components.find(s=>s.componentId===c.componentId);
        if(!original || !c.sourceSerialized || !c.sourceReferences ||
          !same(c.sourceReferences,original.references) || c.typeId!==`unity.${original.unityType}` ||
          c.sourceSerialized.classId!==original.classId ||
          c.sourceSerialized.sourceFileId!==c.sourceFileId || c.dataStatus!=='sourceOnly')
          return fail(`${o.id}/${c.componentId}: exported component provenance or references differ`);
        rawDocument(c.sourceSerialized,`${o.id}/${c.componentId}`,original.sourceDocumentSha256);
        componentOwners.set(c.componentId,o.id);allDocs.push(c.sourceSerialized);
      }
      const transform=o.components.find(c=>c.typeId==='unity.Transform'||c.typeId==='unity.RectTransform');
      const tf=transform?.sourceSerialized?.fields;
      if(!tf) return fail(`${o.id}: missing exported Transform fields`);
      if(!same(tf.m_LocalPosition,o.localPosition) || !same(tf.m_LocalRotation,o.localRotation) ||
        !same(tf.m_LocalScale,o.localScale)) fail(`${o.id}: exported Transform fields differ`);
      if(o.rectTransform) {
        const rect=o.rectTransform;
        if(!same(tf.m_AnchorMin,rect.anchorMin)||!same(tf.m_AnchorMax,rect.anchorMax)||
          !same(tf.m_AnchoredPosition,rect.anchoredPosition)||!same(tf.m_SizeDelta,rect.sizeDelta)||
          !same(tf.m_Pivot,rect.pivot)) fail(`${o.id}: exported RectTransform fields differ`);
      }
    }
    if(sceneDocs.length!==5 || sceneDocs.some(d=>d.fields.m_GameObject!==undefined))
      fail('V3 exported scene settings documents are incomplete');
    for(const d of sceneDocs) {rawDocument(d,`sceneConfig/${d.sourceFileId}`);allDocs.push(d);}
    const docIds=new Set(allDocs.map(d=>d.sourceFileId));
    const docOrders=new Set(allDocs.map(d=>d.sourceOrder));
    if(docIds.size!==allDocs.length || docOrders.size!==allDocs.length ||
      allDocs.some(d=>d.sourceOrder<0 || d.sourceOrder>=allDocs.length))
      fail('V3 exported source document IDs/order are incomplete');
    const complete=level.sceneConfig.sourceHeader+
      allDocs.sort((a,b)=>a.sourceOrder-b.sourceOrder).map(d=>d.rawYaml).join('');
    if(sha256(complete)!==level.sourceScene.sha256)
      fail('V3 exported YAML reassembly differs from original Scene SHA-256');
    const settingIds=new Set(sceneDocs.map(d=>d.sourceFileId));
    const refs=[...sceneRefs,...level.objects.flatMap(o=>
      [...(o.sourceReferences??[]),...o.components.flatMap(c=>c.sourceReferences??[])])];
    for(const ref of refs) checkSourceReference(ref,ref.fieldPath,byId,componentOwners,settingIds,assets);
    const used=[...new Set(refs.filter(r=>r.kind==='asset').map(r=>r.assetId))].sort();
    if(!same(used,[...level.resourceIds].sort())) fail('V3 exported resource dependency list differs');
    const designCalls=source.persistentCalls.filter(c=>c.classification==='levelDesign');
    if(level.events.length!==designCalls.length || designCalls.some(c=>
      !level.events.some(e=>e.id===c.eventId && e.sourcePersistentCallId===c.eventId)))
      fail('V3 exported gameplay UnityEvent sources missing');
  }
   if(level.coverage==='full')
     fail('V3 full coverage requires verified scene settings and restoration adapters, unavailable in M1.1');
  return level;
}

export function openLevelWithoutMigration(value:unknown):KnownLevel {
  if(value&&typeof value==='object'&&(value as {formatVersion?:unknown}).formatVersion===3)
    return validateV3(value);
  return openVersionedLevel(value);
}
