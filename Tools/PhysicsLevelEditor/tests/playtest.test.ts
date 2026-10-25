import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ReleaseProject} from '../src/editor/release-project.ts';
import {PlaytestService} from '../src/editor/playtest.ts';

const levels=resolve(dirname(fileURLToPath(import.meta.url)),'../../../Levels');
test('two saved Start ground positions produce distinct validated Unity session inputs',async()=>{
  const temp=await mkdtemp(join(tmpdir(),'ple-playtest-'));
  assert.ok(resolve(temp).startsWith(resolve(tmpdir())));
  try{
    const project=new ReleaseProject(levels,join(temp,'工作副本'));
    const first=await project.open('room1');
    const ground=first.base.objects.find(o=>o.name==='Start ground')!;
    assert.equal(ground.ownership,'A');
    const runner=join(temp,'game-runner');
    await mkdir(join(runner,'PhysicsLevelPlaytest_Data'),{recursive:true});
    await writeFile(join(runner,'PhysicsLevelPlaytest.exe'),'test fixture only');
    await writeFile(join(runner,'runner-manifest.json'),JSON.stringify({runnerVersion:1,
      roomId:'room1',levelId:first.base.levelId,sourceSceneSha256:first.base.sourceScene.sha256,
      allowedObjectIds:first.base.objects.filter(o=>o.ownership==='A'&&!o.rectTransform).map(o=>o.id),
      playerExe:'PhysicsLevelPlaytest.exe'}));
    const service=new PlaytestService(project,runner,join(temp,'sessions'));
    const make=(x:number)=>({...first.overlay,positions:[{objectId:ground.id,
      localPosition:{...ground.localPosition,x}}]});
    const saved1=await project.save('room1',make(ground.localPosition.x+0.5),null);
    const session1=await service.prepare('room1',saved1.overlay,saved1.fingerprint);
    const saved2=await project.save('room1',make(ground.localPosition.x+1),saved1.fingerprint);
    const session2=await service.prepare('room1',saved2.overlay,saved2.fingerprint);
    assert.notEqual(session1.sessionId,session2.sessionId);
    assert.notEqual(session1.sha256,session2.sha256);
    const one=JSON.parse(await readFile(session1.overlayPath,'utf8'));
    const two=JSON.parse(await readFile(session2.overlayPath,'utf8'));
    assert.equal(one.positions[0].objectId,ground.id);
    assert.equal(two.positions[0].objectId,ground.id);
    assert.equal(one.positions[0].localPosition.x,ground.localPosition.x+0.5);
    assert.equal(two.positions[0].localPosition.x,ground.localPosition.x+1);
    await assert.rejects(service.prepare('room1',saved1.overlay,saved1.fingerprint),/先保存/);
    await assert.rejects(service.prepare('room1',make(ground.localPosition.x+2),saved2.fingerprint),/先保存/);
    await assert.rejects(service.prepare('room2',saved2.overlay,saved2.fingerprint),/仅 Room 1/);
  }finally{await rm(temp,{recursive:true,force:true});}
});
test('playtest launch rejects unvalidated handles and a runner without the native host',async()=>{
  const temp=await mkdtemp(join(tmpdir(),'ple-playtest-host-'));
  try{
    const project=new ReleaseProject(levels,join(temp,'工作副本'));
    const opened=await project.open('room1');
    const runner=join(temp,'game-runner');
    await mkdir(join(runner,'PhysicsLevelPlaytest_Data'),{recursive:true});
    await writeFile(join(runner,'PhysicsLevelPlaytest.exe'),'test fixture only');
    await writeFile(join(runner,'runner-manifest.json'),JSON.stringify({runnerVersion:1,
      roomId:'room1',levelId:opened.base.levelId,sourceSceneSha256:opened.base.sourceScene.sha256,
      allowedObjectIds:opened.base.objects.filter(o=>o.ownership==='A'&&!o.rectTransform).map(o=>o.id),
      playerExe:'PhysicsLevelPlaytest.exe'}));
    const service=new PlaytestService(project,runner,join(temp,'sessions'));
    const rect={x:10,y:20,width:640,height:360};
    await assert.rejects(service.launch('room1',opened.overlay,opened.fingerprint,
      'not-a-handle',rect,()=>{},()=>{}),/窗口句柄/);
    await assert.rejects(service.launch('room1',opened.overlay,opened.fingerprint,
      '123456',rect,()=>{},()=>{}),/PlaytestHost\.exe/);
  }finally{await rm(temp,{recursive:true,force:true});}
});
