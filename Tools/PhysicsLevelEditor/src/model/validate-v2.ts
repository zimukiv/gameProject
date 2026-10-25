import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import schema from './level-v2.schema.json' with {type:'json'};
import type { LevelDataV1 } from './level.ts';
import type { AssetRef, LevelDataV2, LevelObjectV2, SceneObjectRef, SceneComponentRef, TransformRef } from './level-v2.ts';
import { migrateV1ToV2 } from './level-v2.ts';
import { validateLevel } from './validate.ts';
import { registryV2 } from './registry-v2.ts';

const ajv=new Ajv2020({allErrors:true,strict:false}); addFormats(ajv);
const check=ajv.compile(schema);
const fail=(message:string):never=>{throw new Error(message);};
const get=(value:unknown,path:string):unknown=>path.split('.').reduce<unknown>((v,k)=>
  v && typeof v==='object' ? (v as Record<string,unknown>)[k] : undefined,value);

export function validateV2(value:unknown):LevelDataV2 {
  if(!check(value)) fail('V2 JSON Schema: '+(check.errors??[]).map(e=>`${e.instancePath||'/'} ${e.message}`).join('; '));
  const level=value as LevelDataV2;
  const byId=new Map<string,LevelObjectV2>();
  const ruleIds=new Set<string>(),actionIds=new Set<string>();
  for(const object of level.objects) {
    if(byId.has(object.id)) fail(`重复对象 ID ${object.id}`);
    byId.set(object.id,object);
    if(object.localScale.x===0 || object.localScale.y===0) fail(`对象缩放不可为零 ${object.id}`);
    const types=new Set<string>(); let behaviours=0;
    for(const component of object.components) {
      const spec=registryV2[component.typeId];
      if(!spec || component.version!==spec.version || types.has(component.typeId))
        fail(`未知、版本不兼容或重复组件 ${object.id}/${component.typeId}`);
      types.add(component.typeId);
      if(spec.exclusiveGroup==='behaviour') behaviours++;
      const payloadKeys=Object.keys(component).filter(k=>!['typeId','version','enabled'].includes(k));
      if(spec.payload && (payloadKeys.length!==1 || payloadKeys[0]!==spec.payload))
        fail(`组件字段不匹配 ${object.id}/${component.typeId}`);
      if(!spec.payload && payloadKeys.length) fail(`组件不允许附加字段 ${object.id}/${component.typeId}`);
    }
    if(behaviours>1) fail(`同一对象不能组合多个主行为组件 ${object.id}`);
    if(types.has('core.marker') && types.size!==1) fail(`core.marker 必须独立成对象 ${object.id}`);
    if(types.has('physics.rigidbody2d') && !types.has('actor.enemy'))
      fail(`当前 Rigidbody2D 仅允许与 EnemyAI 组合 ${object.id}`);
    for(const component of object.components) {
      const spec=registryV2[component.typeId];
      for(const required of spec.requires) if(!types.has(required)) fail(`缺少依赖 ${object.id}/${component.typeId} -> ${required}`);
      if(spec.collider) {
        const collider=object.components.find(c=>c.typeId==='physics.boxCollider2d')?.collider;
        if(!collider || collider.isTrigger!==(spec.collider==='trigger')) fail(`Collider Trigger 要求不符 ${object.id}/${component.typeId}`);
      }
    }
    const box=object.components.find(c=>c.typeId==='physics.boxCollider2d')?.collider;
    if(box && (box.size.x<=0 || box.size.y<=0)) fail(`Collider 尺寸必须大于零 ${object.id}`);
    if(types.has('physics.platform') && object.layer!==8) fail(`普通平台必须在 Ground layer 8：${object.id}`);
    if(object.rules.length && !types.has('physics.boxCollider2d')) fail(`事件源需要 BoxCollider2D ${object.id}`);
    for(const rule of object.rules) {
      if(ruleIds.has(rule.id)) fail(`重复事件规则 ID ${rule.id}`); ruleIds.add(rule.id);
      if(rule.trigger==='buttonPressed' && !types.has('logic.triggerButton')) fail(`buttonPressed 需要 TriggerButton ${object.id}`);
      if(rule.condition.type==='objectActive' || rule.condition.type==='mechanismState') {
        if(!rule.condition.target) fail(`条件缺少目标 ${rule.id}`);
      }
      for(const action of rule.actions) {
        if(actionIds.has(action.id)) fail(`重复动作 ID ${action.id}`); actionIds.add(action.id);
        if(action.type==='delay') {
          if(action.target!==null || action.delaySeconds<=0) fail(`Delay 必须无目标且时长大于零 ${action.id}`);
        } else if(!action.target) fail(`动作缺少目标 ${action.id}`);
        if(action.type==='setParameter' && !([
          'physics.airVent/upwardForce','mechanism.vanishing/visibleDuration',
          'mechanism.railgun/acceleration'].includes(`${action.componentTypeId}/${action.parameterPath}`)))
          fail(`不支持的运行时参数 ${action.id}`);
      }
    }
  }
  const verifyRef=(raw:SceneObjectRef|SceneComponentRef|TransformRef, expected:string, context:string) => {
    const requiredKind=expected==='transform'?'transform':expected==='sceneObject'?'sceneObject':'sceneComponent';
    if(raw.kind!==requiredKind) fail(`引用种类不匹配 ${context}: 需要 ${requiredKind}`);
    const target=byId.get(raw.objectId);
    if(!target) fail(`缺失场景引用 ${context} -> ${raw.objectId}`);
    if(raw.kind==='sceneComponent') {
      if(raw.instanceId!==null) fail(`当前组件仅允许单实例，instanceId 必须为 null：${context}`);
      if(raw.componentTypeId!==expected) fail(`引用组件类型不匹配 ${context}: ${raw.componentTypeId}`);
      if(expected==='audio.source') fail(`尚不支持 AudioSource 场景引用 ${context}`);
      if(!target?.components.some(c=>c.typeId===expected)) fail(`目标缺少组件 ${context} -> ${raw.objectId}`);
    }
  };
  for(const object of level.objects) {
    let parent=object.parentId;
    const seen=new Set<string>([object.id]);
    while(parent) { if(seen.has(parent) || !byId.has(parent)) fail(`父级缺失或成环 ${object.id}`);
      seen.add(parent); parent=byId.get(parent)!.parentId; }
    for(const component of object.components) {
      const spec=registryV2[component.typeId];
      for(const ref of spec.objectRefs??[]) {
        const raw=get(component,ref.path);
        if(raw===null) continue;
        for(const item of Array.isArray(raw)?raw:[raw])
          verifyRef(item as SceneObjectRef|SceneComponentRef|TransformRef,ref.target,`${object.id}/${ref.path}`);
      }
      if(component.typeId==='mechanism.thermalController' && component.thermal) {
        const linked=component.thermal.linkedController;
        if(linked) {
          if(linked.objectId===object.id) fail(`控制器不能链接自身 ${object.id}`);
          const authority=byId.get(linked.objectId)?.components.find(c=>c.typeId==='mechanism.thermalController');
          if(authority?.thermal?.linkedController) fail(`链接目标必须是未链接的主控制器 ${object.id}`);
        }
        const iceIds=component.thermal.controlledIce.map(r=>r.objectId);
        if(new Set(iceIds).size!==iceIds.length) fail(`重复的 controlledIce 引用 ${object.id}`);
      }
      if(component.typeId==='mechanism.railgun' && component.railgun?.launchEndPoint) {
        const endpoint=component.railgun.launchEndPoint.objectId;
        if(endpoint===object.id || !byId.get(endpoint)?.components.some(c=>c.typeId==='core.marker'))
          fail(`电磁炮终点必须引用独立 Marker ${object.id}`);
      }
    }
    for(const rule of object.rules) {
      const condition=rule.condition;
      if(condition.target) verifyRef(condition.target,
        condition.type==='mechanismState'?condition.target.kind==='sceneComponent'?condition.target.componentTypeId:'invalid':'sceneObject',
        `条件 ${rule.id}`);
      for(const action of rule.actions) {
        if(!action.target) continue;
        const expected=action.type==='setObjectActive'?'sceneObject':action.componentTypeId;
        verifyRef(action.target,expected,`动作 ${action.id}`);
      }
    }
  }
  return level;
}

export function openVersionedLevel(value:unknown):LevelDataV1|LevelDataV2 {
  if(!value || typeof value!=='object') fail('关卡必须是对象');
  const version=(value as {formatVersion?:unknown}).formatVersion;
  if(version===1) return validateLevel(value);
  if(version===2) return validateV2(value);
  return fail(`不支持的关卡版本 ${String(version)}`);
}
export function migrateValidatedV1(value:unknown):LevelDataV2 {
  return validateV2(migrateV1ToV2(validateLevel(value)));
}

// P4.1 can validate reference shape and scene targets. Asset existence/type requires
// a Unity AssetDatabase-backed resolver in P4.2; absence of one is reported, never assumed valid.
export function unresolvedAssets(level:LevelDataV2,
  resolver?: (ref:AssetRef, expectedType:'Sprite'|'AudioClip'|'GameObject')=>boolean):string[] {
  const unresolved:string[]=[];
  for(const object of level.objects) for(const component of object.components) {
    for(const asset of registryV2[component.typeId].assetRefs) {
      const raw=get(component,asset.path);
      if(raw===null || raw===undefined) continue;
      const ref:AssetRef=asset.assetType==='Sprite'
        ? {kind:'asset',assetGuid:(raw as {assetGuid:string}).assetGuid,localFileId:(raw as {localFileId:string}).localFileId}
        : raw as AssetRef;
      if(!resolver || !resolver(ref,asset.assetType))
        unresolved.push(`${object.id}/${component.typeId}/${asset.path} (${asset.assetType})`);
    }
  }
  return unresolved;
}
