import type {LevelDataV1,LevelObject,Vec2} from '../model/level.ts';
import type {ComponentV3,LevelDataV3,ObjectV3} from '../model/m1-contract.ts';
import {colliderWorldCorners,inversePoint,snap,transformPoint,worldMatrix,worldToScreen,
  type View} from './document.ts';
import {movableRoots} from './selection.ts';
import type {RoomOverlay} from './release-model.ts';

export type CanvasShape={objectId:string;name:string;kind:'box'|'circle'|'spritePlaceholder'|'marker';
  worldPoints:Vec2[];worldCenter:Vec2;color:string;isTrigger:boolean;editable:boolean};
const field=(component:ComponentV3,key:string):unknown=>{
  const data=component.data;
  const typed=data&&typeof data==='object'&&'fields'in data ? data.fields : data;
  if(typed&&typeof typed==='object'&&key in typed)return (typed as Record<string,unknown>)[key];
  return component.sourceSerialized?.fields[key];
};
const vec=(v:unknown):Vec2|null=>v&&typeof v==='object'&&
  typeof (v as Vec2).x==='number'&&Number.isFinite((v as Vec2).x)&&
  typeof (v as Vec2).y==='number'&&Number.isFinite((v as Vec2).y) ? v as Vec2:null;
const number=(v:unknown):number|null=>typeof v==='number'&&Number.isFinite(v)?v:null;
const component=(o:ObjectV3,type:string)=>o.components.find(c=>c.typeId===type);
const flat=(o:ObjectV3)=>Math.abs(o.localRotation.x)<1e-6&&Math.abs(o.localRotation.y)<1e-6;
const hex=(n:number)=>Math.round(Math.max(0,Math.min(1,n))*255).toString(16).padStart(2,'0');
function spriteColor(o:ObjectV3):string{
  const c=component(o,'unity.SpriteRenderer');
  const value=c&&field(c,'m_Color');
  if(!value||typeof value!=='object')return '#6fa6c7';
  const color=value as Record<string,unknown>;
  return ['r','g','b'].every(k=>number(color[k])!==null)
    ? `#${hex(color.r as number)}${hex(color.g as number)}${hex(color.b as number)}`:'#6fa6c7';
}
export function canvasEditable(level:LevelDataV3,o:ObjectV3):boolean{
  if(o.ownership!=='A'||o.rectTransform!==null)return false;
  const byId=new Map(level.objects.map(x=>[x.id,x]));
  let cursor:ObjectV3|undefined=o;const seen=new Set<string>();
  while(cursor){
    if(seen.has(cursor.id)||cursor.rectTransform||!flat(cursor))return false;
    seen.add(cursor.id);
    if(cursor.parentId&&!byId.has(cursor.parentId))return false;
    cursor=cursor.parentId?byId.get(cursor.parentId):undefined;
  }
  return true;
}
export function toPhase3CanvasLevel(level:LevelDataV3):LevelDataV1{
  const objects:LevelObject[]=level.objects.filter(o=>!o.rectTransform).map(o=>{
    const collider=component(o,'unity.BoxCollider2D');
    const size=collider&&vec(field(collider,'m_Size'));
    const offset=collider&&vec(field(collider,'m_Offset'));
    return {id:o.id,name:o.name,kind:'platform',parentId:o.parentId,active:o.active,
      layer:o.layer,localPosition:o.localPosition,
      localRotationZ:2*Math.atan2(o.localRotation.z,o.localRotation.w)*180/Math.PI,
      localScale:o.localScale,components:size&&offset?[{typeId:'physics.boxCollider2d',version:1,
        enabled:collider?.enabled??true,collider:{size,offset,isTrigger:field(collider!,'m_IsTrigger')===1}}]:[]};
  });
  return {formatVersion:1,levelId:level.levelId,coverage:'partial',
    sourceSceneGuid:level.sourceScene.guid,objects};
}
export function canvasShapes(level:LevelDataV3):CanvasShape[]{
  const facade=toPhase3CanvasLevel(level);
  const byId=new Map(level.objects.map(o=>[o.id,o]));
  const shapes:CanvasShape[]=[];
  for(const item of facade.objects){
    const o=byId.get(item.id)!;
    // Screen-space UI and cameras are listed in the hierarchy, not the world canvas.
    if(component(o,'unity.Camera'))continue;
    if(o.ownership==='C'&&!component(o,'unity.BoxCollider2D')&&
      !component(o,'unity.CircleCollider2D')&&!component(o,'unity.SpriteRenderer'))continue;
    if(!flat(o))continue;
    let matrix;
    try{matrix=worldMatrix(facade,item);}catch{continue;}
    const center={x:matrix.x,y:matrix.y};
    const box=item.components.find(c=>c.typeId==='physics.boxCollider2d')?.collider;
    const circle=component(o,'unity.CircleCollider2D');
    const circleRadius=circle&&number(field(circle,'m_Radius'));
    const circleOffset=circle&&vec(field(circle,'m_Offset'));
    let kind:CanvasShape['kind']='marker',points:Vec2[]=[];
    if(box&&box.size.x>0&&box.size.y>0){
      kind='box';points=colliderWorldCorners(facade,item);
    }else if(circleRadius!==null&&circleRadius!==undefined&&circleRadius>0&&circleOffset){
      kind='circle';points=Array.from({length:32},(_,i)=>{
        const angle=i*Math.PI*2/32;
        return transformPoint(matrix,{x:circleOffset.x+Math.cos(angle)*circleRadius,
          y:circleOffset.y+Math.sin(angle)*circleRadius});
      });
    }else if(component(o,'unity.SpriteRenderer'))kind='spritePlaceholder';
    shapes.push({objectId:o.id,name:o.name,kind,worldPoints:points,worldCenter:center,
      color:spriteColor(o),isTrigger:box?.isTrigger??(circle?field(circle,'m_IsTrigger')===1:false),
      editable:canvasEditable(level,o)});
  }
  return shapes;
}
export function shapeScreenBounds(shape:CanvasShape,view:View,width:number,height:number){
  const points=shape.worldPoints.length?shape.worldPoints.map(p=>worldToScreen(p,view,width,height)):
    [worldToScreen(shape.worldCenter,view,width,height)];
  return {minX:Math.min(...points.map(p=>p.x))-5,maxX:Math.max(...points.map(p=>p.x))+5,
    minY:Math.min(...points.map(p=>p.y))-5,maxY:Math.max(...points.map(p=>p.y))+5};
}
export function moveCanvasSelection(base:LevelDataV3,overlay:RoomOverlay,ids:string[],delta:Vec2,
  snapStep:number|null):RoomOverlay{
  if(!Number.isFinite(delta.x)||!Number.isFinite(delta.y))throw Error('Invalid drag offset');
  const byId=new Map(base.objects.map(o=>[o.id,o]));
  if(ids.length===0||ids.some(id=>!byId.has(id)||!canvasEditable(base,byId.get(id)!)))
    throw Error('Selection contains a read-only or unsupported object');
  const facade=toPhase3CanvasLevel(base),next=structuredClone(overlay);
  const roots=movableRoots(facade,ids).map(o=>o.id);
  if(snapStep!==null){const anchor=worldMatrix(facade,facade.objects.find(o=>o.id===roots[0])!);
    delta={x:snap(anchor.x+delta.x,snapStep)-anchor.x,y:snap(anchor.y+delta.y,snapStep)-anchor.y};}
  for(const id of roots){
    const o=byId.get(id)!;let offset=delta;
    if(o.parentId){const parent=facade.objects.find(x=>x.id===o.parentId);
      if(!parent)throw Error(`Missing canvas parent for ${id}`);
      const matrix=worldMatrix(facade,parent);
      const from=inversePoint(matrix,{x:0,y:0}),to=inversePoint(matrix,delta);
      offset={x:to.x-from.x,y:to.y-from.y};}
    const old=next.positions.find(p=>p.objectId===id);
    const start=old?.localPosition??o.localPosition;
    const value={...start,x:start.x+offset.x,y:start.y+offset.y};
    if(old)old.localPosition=value;else next.positions.push({objectId:id,localPosition:value});
  }
  return next;
}
