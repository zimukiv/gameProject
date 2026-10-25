import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {ReleaseProject,validateOverlay} from '../src/editor/release-project.ts';

const levels=resolve(dirname(fileURLToPath(import.meta.url)),'../../../Levels');
const digest=(s:string)=>createHash('sha256').update(s).digest('hex');

test('release workbench opens all 207 source objects without editing original V3 drafts',async()=>{
  const temp=await mkdtemp(join(tmpdir(),'physics-release-'));
  assert.ok(resolve(temp).startsWith(resolve(tmpdir())));
  try{
    const project=new ReleaseProject(levels,join(temp,'中文工作副本'));
    const manifest=await project.overview();
    assert.deepEqual(manifest.rooms.map(x=>x.sourceObjectCount),[71,64,72]);
    let objects=0,components=0;
    for(const room of manifest.rooms){
      const opened=await project.open(room.roomId);
      assert.equal(opened.fingerprint,null);
      assert.equal(opened.level.objects.length,room.sourceObjectCount);
      assert.equal(opened.level.objects.flatMap(x=>x.components).length,room.sourceComponentCount);
      objects+=opened.level.objects.length;
      components+=opened.level.objects.flatMap(x=>x.components).length;
    }
    assert.equal(objects,207);assert.equal(components,729);
  }finally{await rm(temp,{recursive:true,force:true});}
});

test('release work copy persists a supported position, preserves unsupported fields and makes backups',async()=>{
  const temp=await mkdtemp(join(tmpdir(),'physics-release-'));
  assert.ok(resolve(temp).startsWith(resolve(tmpdir())));
  const source=resolve(levels,'Drafts/M1.2/Level1.v3.draft.json');
  const before=digest(await readFile(source,'utf8'));
  try{
    const project=new ReleaseProject(levels,join(temp,'中文工作副本'));
    const opened=await project.open('room1');
    const object=opened.base.objects.find(x=>x.ownership==='A'&&!x.rectTransform)!;
    const overlay={...opened.overlay,positions:[{objectId:object.id,
      localPosition:{...object.localPosition,x:object.localPosition.x+2}}]};
    const saved=await project.save('room1',overlay,null);
    assert.equal(saved.level.objects.find(x=>x.id===object.id)!.localPosition.x,object.localPosition.x+2);
    assert.deepEqual(saved.level.objects.find(x=>x.id===object.id)!.components,object.components);
    const reopened=await project.open('room1');
    assert.equal(reopened.level.objects.find(x=>x.id===object.id)!.localPosition.x,object.localPosition.x+2);
    await assert.rejects(project.save('room1',overlay,null),/changed outside/);
    const next={...overlay,positions:[{...overlay.positions[0],localPosition:{...object.localPosition,x:object.localPosition.x+3}}]};
    await project.save('room1',next,reopened.fingerprint);
    assert.equal((await readdir(join(temp,'中文工作副本'))).filter(x=>x.endsWith('.backup.json')).length,1);
    assert.throws(()=>validateOverlay({...overlay,positions:[{objectId:'unknown',localPosition:object.localPosition}]},
      opened.base,'room1'),/not editable/);
    const ui=opened.base.objects.find(x=>x.rectTransform)!;
    assert.throws(()=>validateOverlay({...overlay,positions:[{objectId:ui.id,localPosition:ui.localPosition}]},
      opened.base,'room1'),/not editable/);
    assert.throws(()=>validateOverlay({...overlay,positions:[{objectId:object.id,
      localPosition:{x:Infinity,y:0,z:0}}]},opened.base,'room1'),/Invalid local position/);
  }finally{assert.equal(digest(await readFile(source,'utf8')),before);
    await rm(temp,{recursive:true,force:true});}
});
