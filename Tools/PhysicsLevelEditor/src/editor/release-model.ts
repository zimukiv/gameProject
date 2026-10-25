import type {LevelDataV3,RoomId} from '../model/m1-contract.ts';
import type {Vec3} from '../model/level.ts';

export type PositionOverride={objectId:string;localPosition:Vec3};
export type RoomOverlay={overlayVersion:1;roomId:RoomId;sourceSceneSha256:string;
  levelId:string;positions:PositionOverride[]};
const exact=(value:object,keys:string[])=>Object.keys(value).sort().join('|')===keys.sort().join('|');
const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1e6;
const copy=<T>(v:T):T=>structuredClone(v);

export function validateOverlay(value:unknown,base:LevelDataV3,roomId:RoomId):RoomOverlay {
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid work copy');
  const o=value as Partial<RoomOverlay>;
  if(!exact(o,['overlayVersion','roomId','sourceSceneSha256','levelId','positions'])||
    o.overlayVersion!==1||o.roomId!==roomId||o.levelId!==base.levelId||
    o.sourceSceneSha256!==base.sourceScene.sha256||!Array.isArray(o.positions))
    throw Error('Work copy version or source Scene does not match this room');
  const ids=new Set<string>();
  for(const entry of o.positions){
    if(!entry||typeof entry!=='object'||!exact(entry,['objectId','localPosition'])||
      typeof entry.objectId!=='string'||ids.has(entry.objectId))throw Error('Duplicate or invalid work copy object ID');
    ids.add(entry.objectId);
    const object=base.objects.find(x=>x.id===entry.objectId);
    if(!object||object.ownership!=='A'||object.rectTransform!==null)
      throw Error(`Object ${entry.objectId} is not editable in this Beta`);
    const p=entry.localPosition;
    if(!p||typeof p!=='object'||!exact(p,['x','y','z'])||
      !finite(p.x)||!finite(p.y)||!finite(p.z))throw Error(`Invalid local position for ${entry.objectId}`);
  }
  return o as RoomOverlay;
}

export function applyOverlay(base:LevelDataV3,overlay:RoomOverlay):LevelDataV3 {
  validateOverlay(overlay,base,overlay.roomId);
  const level=copy(base),byId=new Map(level.objects.map(o=>[o.id,o]));
  for(const entry of overlay.positions)byId.get(entry.objectId)!.localPosition=copy(entry.localPosition);
  return level;
}

export function positionChanges(base:LevelDataV3,level:LevelDataV3):PositionOverride[] {
  if(base.objects.length!==level.objects.length||base.levelId!==level.levelId||
    base.roomId!==level.roomId)throw Error('Work copy changed the source object set');
  const candidate=copy(level);
  const changes:PositionOverride[]=[];
  for(let i=0;i<base.objects.length;i++){
    const before=base.objects[i],after=candidate.objects[i];
    if(before.id!==after.id)throw Error('Work copy changed stable object order or ID');
    if(JSON.stringify(before.localPosition)!==JSON.stringify(after.localPosition)){
      if(before.ownership!=='A'||before.rectTransform!==null)
        throw Error(`Object ${before.id} is read only`);
      changes.push({objectId:before.id,localPosition:copy(after.localPosition)});
      after.localPosition=copy(before.localPosition);
    }
  }
  if(JSON.stringify(candidate)!==JSON.stringify(base))
    throw Error('Work copy changed a read only source field');
  return changes;
}
