import {mkdir,readFile,writeFile,rename,copyFile,stat,unlink} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {validateProjectManifest,validateV3} from '../model/validate-v3.ts';
import type {LevelDataV3,ProjectManifestV1,ResourceManifestV1,RoomId,
  SourceInventoryV1} from '../model/m1-contract.ts';
import {applyOverlay,validateOverlay} from './release-model.ts';
import type {RoomOverlay} from './release-model.ts';
export {applyOverlay,validateOverlay,positionChanges} from './release-model.ts';
export type {RoomOverlay,PositionOverride} from './release-model.ts';
export type OpenRoom={manifest:ProjectManifestV1;base:LevelDataV3;level:LevelDataV3;overlay:RoomOverlay;
  fingerprint:string|null;workPath:string};

const drafts:Record<RoomId,string>={room1:'Level1.v3.draft.json',
  room2:'Level2.v3.draft.json',room3:'Level3.v3.draft.json'};
const sha=(text:string)=>createHash('sha256').update(text).digest('hex');
export class ReleaseProject {
  private readonly bundleRoot:string;
  private readonly userRoot:string;
  constructor(bundleRoot:string,userRoot:string){this.bundleRoot=bundleRoot;this.userRoot=userRoot;}
  private async source(roomId:RoomId){
    const manifest=validateProjectManifest(JSON.parse(await readFile(join(this.bundleRoot,'ProjectManifest.json'),'utf8')));
    const room=manifest.rooms.find(x=>x.roomId===roomId);
    if(!room)throw Error(`Unknown room ${roomId}`);
    const inventory=JSON.parse(await readFile(join(this.bundleRoot,'SourceMaps',`Level${roomId.slice(-1)}.source.json`),'utf8')) as SourceInventoryV1;
    const resources=JSON.parse(await readFile(join(this.bundleRoot,'Resources','ResourceSources.json'),'utf8')) as ResourceManifestV1;
    const base=validateV3(JSON.parse(await readFile(join(this.bundleRoot,'Drafts','M1.2',drafts[roomId]),'utf8')),
      inventory,resources);
    if(base.sourceScene.sha256!==room.sourceScene.sha256||base.objects.length!==room.sourceObjectCount)
      throw Error(`Bundled ${roomId} does not match ProjectManifest`);
    return {manifest,base};
  }
  async overview():Promise<ProjectManifestV1>{
    const manifest=validateProjectManifest(JSON.parse(await readFile(join(this.bundleRoot,'ProjectManifest.json'),'utf8')));
    return manifest;
  }
  private workPath(roomId:RoomId){return join(this.userRoot,`${roomId}.overlay.json`);}
  async open(roomId:RoomId):Promise<OpenRoom>{
    const {manifest,base}=await this.source(roomId),workPath=this.workPath(roomId);
    let overlay:RoomOverlay={overlayVersion:1,roomId,sourceSceneSha256:base.sourceScene.sha256,
      levelId:base.levelId,positions:[]};
    let fingerprint:string|null=null;
    try{const raw=await readFile(workPath,'utf8');overlay=validateOverlay(JSON.parse(raw),base,roomId);fingerprint=sha(raw);}
    catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    return {manifest,base,level:applyOverlay(base,overlay),overlay,fingerprint,workPath};
  }
  async save(roomId:RoomId,overlay:RoomOverlay,expected:string|null):Promise<OpenRoom>{
    const {base}=await this.source(roomId);
    validateOverlay(overlay,base,roomId);
    const path=this.workPath(roomId);
    await mkdir(this.userRoot,{recursive:true});
    let old:string|null=null;
    try{old=await readFile(path,'utf8');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    if((old===null?null:sha(old))!==expected)throw Error('Work copy changed outside the editor; reopen before saving');
    const text=JSON.stringify(overlay,null,2)+'\n',temp=join(this.userRoot,`.${roomId}-${randomUUID()}.tmp`);
    try{
      await writeFile(temp,text,{flag:'wx'});
      let latest:string|null=null;
      try{latest=await readFile(path,'utf8');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
      if((latest===null?null:sha(latest))!==expected)throw Error('Work copy changed during save');
      if(old!==null){
        const backup=join(this.userRoot,`${roomId}.${Date.now()}-${randomUUID()}.backup.json`);
        await copyFile(path,backup);
        await rename(temp,path);
      }else{
        try{await stat(path);throw Error('Work copy appeared during save');}
        catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
        await rename(temp,path);
      }
    }finally{await unlink(temp).catch(()=>{});}
    return this.open(roomId);
  }
}
