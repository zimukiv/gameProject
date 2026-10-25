import {spawn,type ChildProcess} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,stat,writeFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import type {RoomId} from '../model/m1-contract.ts';
import type {RoomOverlay} from './release-model.ts';
import {ReleaseProject} from './release-project.ts';

type RunnerManifest={runnerVersion:1;roomId:'room1';levelId:string;
  sourceSceneSha256:string;allowedObjectIds:string[];playerExe:'PhysicsLevelPlaytest.exe'};
type AppliedReceipt={status:'applied'|'rejected';sessionId:string;
  sourceSceneSha256:string;appliedCount:number;
  positions:{objectId:string;localPosition:{x:number;y:number;z:number}}[];error?:string};
export type PreparedPlaytest={sessionId:string;overlayPath:string;receiptPath:string;
  logPath:string;sha256:string;runnerPath:string;overlay:RoomOverlay};
export type PlaytestLaunch={sessionId:string;pid:number|undefined;receiptPath:string;
  logPath:string;appliedCount:number;runnerPath:string};
export type PlaytestRect={x:number;y:number;width:number;height:number};
export type PlaytestHostEvent={type:'line'|'ready'|'exit'|'error';line?:string;
  sessionId?:string;exitCode?:number|null;message?:string};

const sha=(data:string)=>createHash('sha256').update(data).digest('hex');
const delay=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
const samePositions=(expected:RoomOverlay['positions'],actual:AppliedReceipt['positions'])=>
  expected.length===actual.length&&expected.every((edit,i)=>edit.objectId===actual[i]?.objectId&&
    (['x','y','z'] as const).every(axis=>Math.abs(edit.localPosition[axis]-
      actual[i].localPosition[axis])<=0.0001));

export class PlaytestService{
  private active:ChildProcess|null=null;
  private unityPid:number|undefined;
  private activeSession='';
  private readonly project:ReleaseProject;
  private readonly runnerRoot:string;
  private readonly sessionsRoot:string;
  constructor(project:ReleaseProject,runnerRoot:string,sessionsRoot:string){
    this.project=project;this.runnerRoot=runnerRoot;this.sessionsRoot=sessionsRoot;
  }
  get isActive(){return Boolean(this.active&&this.active.exitCode===null);}
  get session(){return this.activeSession;}
  async prepare(roomId:RoomId,overlay:RoomOverlay,expectedFingerprint:string|null):Promise<PreparedPlaytest>{
    if(roomId!=='room1')throw Error('目前仅 Room 1 Physics 支持真实试玩');
    const opened=await this.project.open(roomId);
    if(opened.fingerprint!==expectedFingerprint||
      JSON.stringify(opened.overlay)!==JSON.stringify(overlay))
      throw Error('试玩前请先保存当前修改，并重新打开外部已更改的工作副本');
    const manifest=JSON.parse(await readFile(join(this.runnerRoot,'runner-manifest.json'),'utf8')) as RunnerManifest;
    const allowed=opened.base.objects.filter(o=>o.ownership==='A'&&!o.rectTransform).map(o=>o.id);
    if(manifest.runnerVersion!==1||manifest.roomId!=='room1'||
      manifest.levelId!==opened.base.levelId||
      manifest.sourceSceneSha256!==opened.base.sourceScene.sha256||
      manifest.playerExe!=='PhysicsLevelPlaytest.exe'||
      !Array.isArray(manifest.allowedObjectIds)||
      new Set(manifest.allowedObjectIds).size!==allowed.length||
      allowed.some(id=>!manifest.allowedObjectIds.includes(id)))
      throw Error('Unity Player 的来源 Scene 或稳定 ID 映射与当前关卡不一致');
    const runnerPath=join(this.runnerRoot,manifest.playerExe);
    await stat(runnerPath).catch(()=>{throw Error('Unity Player EXE 缺失；请先在隔离 Unity 工程构建运行器');});
    await stat(join(this.runnerRoot,'PhysicsLevelPlaytest_Data')).catch(()=>{
      throw Error('Unity Player Data 目录缺失，运行器包不完整');});
    const sessionId=randomUUID(),directory=join(this.sessionsRoot,sessionId);
    await mkdir(directory,{recursive:true});
    const overlayPath=join(directory,'room1.overlay.json'),receiptPath=join(directory,'receipt.json');
    const logPath=join(directory,'Player.log');
    const body=JSON.stringify(opened.overlay,null,2)+'\n';
    await writeFile(overlayPath,body,{flag:'wx'});
    return {sessionId,overlayPath,receiptPath,logPath,sha256:sha(body),runnerPath,
      overlay:opened.overlay};
  }
  async launch(roomId:RoomId,overlay:RoomOverlay,expectedFingerprint:string|null,
    parentHwnd:string,rect:PlaytestRect,
    onEvent:(event:PlaytestHostEvent)=>void,
    onExit:(sessionId:string,exitCode:number|null)=>void):Promise<PlaytestLaunch>{
    if(this.isActive)throw Error('一个 Unity 试玩窗口仍在运行，请先关闭');
    if(!/^\d+$/.test(parentHwnd))throw Error('窗口句柄无效，无法嵌入试玩');
    const prepared=await this.prepare(roomId,overlay,expectedFingerprint);
    const hostPath=join(this.runnerRoot,'PlaytestHost.exe');
    await stat(hostPath).catch(()=>{throw Error('PlaytestHost.exe 缺失；运行器包不完整');});
    const child=spawn(hostPath,[
      '--parent',parentHwnd,'--mode','owned',
      '--width',String(Math.max(1,Math.round(rect.width))),
      '--height',String(Math.max(1,Math.round(rect.height))),
      '--screen-x',String(Math.round(rect.x)),'--screen-y',String(Math.round(rect.y)),
      '--exe',prepared.runnerPath,'--',
      '-pleSession',prepared.sessionId,'-pleOverlay',prepared.overlayPath,
      '-pleSha256',prepared.sha256,'-pleReceipt',prepared.receiptPath,
      '-logFile',prepared.logPath],{cwd:dirname(hostPath),windowsHide:true,
      stdio:['pipe','pipe','pipe']});
    this.active=child;this.unityPid=undefined;this.activeSession=prepared.sessionId;
    const emit=(event:PlaytestHostEvent)=>onEvent({...event,sessionId:prepared.sessionId});
    let buffer='';
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data',(chunk:string)=>{
      buffer+=chunk;
      for(;;){const at=buffer.indexOf('\n');if(at<0)break;
        const line=buffer.slice(0,at).trim();buffer=buffer.slice(at+1);
        if(!line)continue;
        const pid=/UNITY_PID pid=(\d+)/.exec(line);
        if(pid)this.unityPid=Number(pid[1]);
        emit(/^READY /.test(line)?{type:'ready',line}:{type:'line',line});
      }
    });
    child.stderr?.on('data',()=>{});
    child.once('exit',code=>{
      if(this.active===child)this.active=null;
      emit({type:'exit',exitCode:code});
      onExit(prepared.sessionId,code);
    });
    let processError:unknown=null;
    child.once('error',error=>{processError=error;if(this.active===child)this.active=null;});
    for(let n=0;n<900;n++){
      if(processError){
        emit({type:'error',message:String(processError)});
        throw Error(`PlaytestHost 无法启动：${String(processError)}`);
      }
      try{
        const receipt=JSON.parse(await readFile(prepared.receiptPath,'utf8')) as AppliedReceipt;
        if(receipt.sessionId!==prepared.sessionId||
          receipt.sourceSceneSha256!==prepared.overlay.sourceSceneSha256)
          throw Error('Unity Player 回执身份与本次试玩不一致');
        if(receipt.status!=='applied')
          throw Error(`Unity Player 拒绝增量：${receipt.error??'未知原因'}；日志：${prepared.logPath}`);
        if(receipt.appliedCount!==prepared.overlay.positions.length||
          !samePositions(prepared.overlay.positions,receipt.positions))
          throw Error(`Unity Player 未完整应用本次位置修改；日志：${prepared.logPath}`);
        return {sessionId:prepared.sessionId,pid:this.unityPid,receiptPath:prepared.receiptPath,
          logPath:prepared.logPath,appliedCount:receipt.appliedCount,runnerPath:prepared.runnerPath};
      }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT'){
        this.stop();throw error;}}
      if(child.exitCode!==null)
        throw Error(`Unity Player 提前退出（${child.exitCode}），未确认修改；日志：${prepared.logPath}`);
      await delay(100);
    }
    this.stop();
    throw Error(`等待 Unity Player 应用回执超时；日志：${prepared.logPath}`);
  }
  resize(rect:PlaytestRect){
    this.write(`RESIZE 0 0 ${Math.round(rect.x)} ${Math.round(rect.y)} ` +
      `${Math.max(1,Math.round(rect.width))} ${Math.max(1,Math.round(rect.height))}`);
  }
  focus(){this.write('FOCUS');}
  hide(){this.write('HIDE');}
  show(){this.write('SHOW');}
  stop(){
    if(this.active&&this.active.exitCode===null){
      this.write('STOP');
      const child=this.active;
      setTimeout(()=>{if(child.exitCode===null)try{child.kill();}catch{}},6000).unref?.();
    }
  }
  private write(line:string){
    try{this.active?.stdin?.write(line+'\n');}catch{}
  }
}
