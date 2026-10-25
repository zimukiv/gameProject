import type {ComponentV3,LevelDataV3,ObjectV3,ResourceManifestV1,SourceInventoryV1} from './m1-contract.ts';
import {validateV3} from './validate-v3.ts';

// These are the seven audited Level1 source IDs, never names or hierarchy order.
export const THERMAL_M13A_IDS={
  controllerA:'0c53c967-c623-50f2-9d5d-98de4129232d',
  controllerB:'0c00697d-0470-5e5d-940b-b0645f0c858e',
  ice1:'670b32aa-3139-55f7-b655-ef0bebf7776c',
  ice2:'1263c26b-67be-5071-8ada-a79b35fdc71c',
  ice3:'e520f104-d5ae-5663-b6c5-3eea07634b76',
  wall:'9336ae16-b68e-5747-a5cd-113149e3870a',
  backdrop:'4a942db3-88db-5728-b2db-f49f66c969ee'
} as const;

const fail=(at:string,message:string):never=>{throw new Error(`${at}: ${message}`);};
const rec=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const num=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
function exact(value:unknown,keys:string[],at:string):Record<string,unknown> {
  if(!rec(value)||JSON.stringify(Object.keys(value).sort())!==JSON.stringify([...keys].sort()))
    return fail(at,`expected only ${keys.join(', ')}`);
  return value;
}
function vector(value:unknown,keys:string[],at:string):void {
  const data=exact(value,keys,at);
  if(keys.some(k=>!num(data[k]))) fail(at,'vector has a non-finite or missing coordinate');
}
function boolean(v:unknown,at:string):void {if(typeof v!=='boolean') fail(at,'expected boolean');}
function number(v:unknown,at:string,min?:number):void {
  if(!num(v)||min!==undefined&&v<min) fail(at,'invalid number');
}
function componentRef(value:unknown,typeId:string,byId:Map<string,ObjectV3>,levelId:string,at:string):void {
  const ref=exact(value,['kind','levelId','objectId','componentId','componentTypeId'],at);
  if(ref.kind!=='component'||ref.levelId!==levelId||ref.componentTypeId!==typeId||
    typeof ref.objectId!=='string'||typeof ref.componentId!=='string'||
    !byId.get(ref.objectId)?.components.some(c=>c.componentId===ref.componentId&&c.typeId===typeId))
    fail(at,`missing or wrong ${typeId} component target`);
}
function assetRef(value:unknown,type:string,assets:ResourceManifestV1,at:string):void {
  const ref=exact(value,['kind','assetId'],at);
  const asset=assets.resources.find(a=>a.assetId===ref.assetId);
  if(ref.kind!=='asset'||!asset||asset.assetType!==type) fail(at,`missing ${type} asset`);
}
const kinds=(object:ObjectV3)=>object.components.map(c=>c.typeId);
const base=['unity.Transform','unity.SpriteRenderer','unity.BoxCollider2D','unity.BaseBlock'];
function fields(c:ComponentV3):Record<string,unknown> {
  if(c.dataStatus!=='m13aMapped'||c.version!==1||!rec(c.data))
    return fail(c.componentId,'component has no supported typed M1.3A data');
  return c.data;
}

export function validateThermalM13A(value:unknown,source:SourceInventoryV1,
  assets:ResourceManifestV1):LevelDataV3 {
  const level=validateV3(value,source,assets);
  if(level.roomId!=='room1'||level.coverage!=='partial'||level.objects.length!==7||
    level.events.length!==0) fail('level','expected an isolated seven-object Level1 partial test');
  const expected=new Set(Object.values(THERMAL_M13A_IDS));
  const byId=new Map(level.objects.map(o=>[o.id,o]));
  if(byId.size!==7||[...expected].some(id=>!byId.has(id)))
    fail('level.objects','audited seven source object IDs differ');
  for(const o of level.objects) {
    const at=`${o.id}`;
    const role=o.id===THERMAL_M13A_IDS.backdrop?'backdrop':
      o.id===THERMAL_M13A_IDS.controllerA||o.id===THERMAL_M13A_IDS.controllerB?'controller':'ice';
    const required=role==='backdrop'?base.slice(0,2):
      [...base,role==='controller'?'unity.ThermalControllerBlock':'unity.IceBlock'];
    if(JSON.stringify(kinds(o))!==JSON.stringify(required))
      fail(at,`unsupported component composition, expected ${required.join(', ')}`);
    if(o.parentId!==null||o.rectTransform!==null) fail(at,'M1.3A accepts only root world objects');
    for(const c of o.components) {
      const data=fields(c),p=`${at}/${c.componentId}`;
      if(c.typeId==='unity.Transform'||c.typeId==='unity.BaseBlock') {
        exact(data,[],p);
      } else if(c.typeId==='unity.SpriteRenderer') {
        exact(data,['sprite','material','color','sortingLayerId','sortingOrder','drawMode','size','flipX','flipY'],p);
        assetRef(data.sprite,'Sprite',assets,p+'/sprite');
        assetRef(data.material,'UnityBuiltin',assets,p+'/material');
        vector(data.color,['r','g','b','a'],p+'/color');vector(data.size,['x','y'],p+'/size');
        number(data.sortingLayerId,p+'/sortingLayerId');number(data.sortingOrder,p+'/sortingOrder');
        number(data.drawMode,p+'/drawMode');boolean(data.flipX,p+'/flipX');boolean(data.flipY,p+'/flipY');
      } else if(c.typeId==='unity.BoxCollider2D') {
        exact(data,['size','offset','isTrigger','density','edgeRadius','material'],p);
        vector(data.size,['x','y'],p+'/size');vector(data.offset,['x','y'],p+'/offset');
        if((data.size as {x:number;y:number}).x<=0||(data.size as {x:number;y:number}).y<=0)
          fail(p+'/size','Collider dimensions must be positive');
        boolean(data.isTrigger,p+'/isTrigger');number(data.density,p+'/density',0);
        number(data.edgeRadius,p+'/edgeRadius',0);
        if(data.material!==null) fail(p+'/material','non-null physics material is not mapped');
      } else if(c.typeId==='unity.IceBlock') {
        exact(data,['isInteractable','isMelted','solidColor','meltedColor'],p);
        boolean(data.isInteractable,p+'/isInteractable');boolean(data.isMelted,p+'/isMelted');
        vector(data.solidColor,['r','g','b','a'],p+'/solidColor');
        vector(data.meltedColor,['r','g','b','a'],p+'/meltedColor');
      } else if(c.typeId==='unity.ThermalControllerBlock') {
        exact(data,['isInteractable','currentState','terminalName','interactionRadius',
          'controlRadius','coldFilterColor','hotFilterColor','linkedController',
          'controlledIce','roomFilterOverlay'],p);
        boolean(data.isInteractable,p+'/isInteractable');
        if(data.currentState!==0&&data.currentState!==1) fail(p+'/currentState','invalid temperature');
        if(typeof data.terminalName!=='string') fail(p+'/terminalName','expected text');
        number(data.interactionRadius,p+'/interactionRadius',0);
        number(data.controlRadius,p+'/controlRadius',0);
        vector(data.coldFilterColor,['r','g','b','a'],p+'/coldFilterColor');
        vector(data.hotFilterColor,['r','g','b','a'],p+'/hotFilterColor');
        if(data.linkedController!==null)
          componentRef(data.linkedController,'unity.ThermalControllerBlock',byId,level.levelId,p+'/linkedController');
        const iceRefs=data.controlledIce;
        if(!Array.isArray(iceRefs)||iceRefs.length!==4)
          return fail(p+'/controlledIce','expected four ordered IceBlock references');
        for(const [index,ref] of iceRefs.entries())
          componentRef(ref,'unity.IceBlock',byId,level.levelId,`${p}/controlledIce[${index}]`);
        const targets=(iceRefs as {componentId:string}[]).map(r=>r.componentId);
        if(new Set(targets).size!==4) fail(p+'/controlledIce','duplicate IceBlock reference');
        componentRef(data.roomFilterOverlay,'unity.SpriteRenderer',byId,level.levelId,p+'/roomFilterOverlay');
        if((data.roomFilterOverlay as {objectId:string}).objectId!==THERMAL_M13A_IDS.backdrop)
          fail(p+'/roomFilterOverlay','expected audited Temperature backdrop');
      }
    }
  }
  const a=byId.get(THERMAL_M13A_IDS.controllerA)!,b=byId.get(THERMAL_M13A_IDS.controllerB)!;
  const aData=a.components.at(-1)!.data!,bData=b.components.at(-1)!.data!;
  if(aData.linkedController!==null ||
    (bData.linkedController as {objectId:string})?.objectId!==a.id)
    fail('linkedController','expected A to be the source authority and B to link to A');
  return level;
}
