import {createHash, randomUUID} from 'node:crypto';

// Fixed namespace: changing it would change every source-derived ID.
export const SOURCE_ID_NAMESPACE='47c2845f-91ae-481b-ae07-60ce2033e632';
const scenePattern=/^[0-9a-f]{32}$/;
const filePattern=/^[0-9]+$/;
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uuidV5(name:string):string {
  const bytes=Buffer.from(SOURCE_ID_NAMESPACE.replaceAll('-',''),'hex');
  const digest=createHash('sha1').update(bytes).update(name,'utf8').digest();
  digest[6]=(digest[6]&0x0f)|0x50;
  digest[8]=(digest[8]&0x3f)|0x80;
  const hex=digest.subarray(0,16).toString('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export function sourceKey(sceneGuid:string,gameObjectFileId:string):string {
  if(!scenePattern.test(sceneGuid)||!filePattern.test(gameObjectFileId))
    throw new Error(`Invalid Unity source identity ${sceneGuid}/${gameObjectFileId}`);
  return `${sceneGuid}:${gameObjectFileId}`;
}
export function sourceObjectId(sceneGuid:string,gameObjectFileId:string,
  legacyId?:string):string {
  const key=sourceKey(sceneGuid,gameObjectFileId);
  if(legacyId!==undefined) {
    if(!uuidPattern.test(legacyId)) throw new Error(`Invalid legacy object ID ${legacyId}`);
    return legacyId;
  }
  return uuidV5(`object:${key}`);
}
export function sourceComponentId(sceneGuid:string,gameObjectFileId:string,
  componentFileId:string):string {
  const key=sourceKey(sceneGuid,gameObjectFileId);
  if(!filePattern.test(componentFileId)) throw new Error(`Invalid component fileID ${componentFileId}`);
  return uuidV5(`component:${key}:${componentFileId}`);
}
export function newEditorObjectId():string { return randomUUID(); }
export function newEditorComponentId():string { return randomUUID(); }
