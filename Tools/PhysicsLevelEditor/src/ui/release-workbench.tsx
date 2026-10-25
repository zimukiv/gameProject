import React,{useEffect,useMemo,useRef,useState} from 'react';
import type {LevelDataV3,ObjectV3,ProjectManifestV1,RoomId} from '../model/m1-contract.ts';
import type {OpenRoom} from '../editor/release-project.ts';
import type {RoomOverlay} from '../editor/release-model.ts';
import {applyOverlay,validateOverlay} from '../editor/release-model.ts';
import {canvasEditable,moveCanvasSelection} from '../editor/v3-canvas.ts';
import {V3Canvas} from './v3-canvas-view.tsx';
import './release-workbench.css';

const labels:Record<RoomId,string>={room1:'Room 1 · Physics / 物理',
  room2:'Room 2 · Calculus / 高数',room3:'Room 3 · Slacker / 水课'};
const clone=<T,>(x:T):T=>structuredClone(x);
function Numeric({value,onCommit,disabled=false}:{value:number;onCommit:(n:number)=>void;disabled?:boolean}){
  const [draft,setDraft]=useState(String(value));
  useEffect(()=>setDraft(String(value)),[value]);
  return <input type="number" step="any" disabled={disabled} value={draft}
    onChange={e=>setDraft(e.target.value)} onBlur={()=>{
      const n=Number(draft);if(draft.trim()&&Number.isFinite(n))onCommit(n);else setDraft(String(value));
    }} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape')setDraft(String(value));}}/>;
}

export function ReleaseWorkbench({onLegacy}:{onLegacy:()=>void}){
  const [manifest,setManifest]=useState<ProjectManifestV1|null>(null);
  const [opened,setOpened]=useState<OpenRoom|null>(null);
  const [steps,setSteps]=useState<RoomOverlay[]>([]),[index,setIndex]=useState(0);
  const [saved,setSaved]=useState('');
  const [selection,setSelection]=useState<string[]>([]),[query,setQuery]=useState('');
  const [hidden,setHidden]=useState<string[]>([]),[locked,setLocked]=useState<string[]>([]);
  const [error,setError]=useState(''),[message,setMessage]=useState('');
  const [playState,setPlayState]=useState('未启动试玩');
  const [playing,setPlaying]=useState(false);
  const stageRef=useRef<HTMLDivElement|null>(null);
  const overlay=steps[index];
  const level=useMemo(()=>opened&&overlay?applyOverlay(opened.base,overlay):null,[opened,overlay]);
  const dirty=Boolean(overlay&&JSON.stringify(overlay)!==saved);
  useEffect(()=>{window.releaseProject.overview().then(setManifest).catch(e=>setError(String(e)));},[]);
  useEffect(()=>{const leave=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue='';}};
    window.addEventListener('beforeunload',leave);return()=>window.removeEventListener('beforeunload',leave);},[dirty]);
  useEffect(()=>window.releaseProject.onPlaytestExit(result=>{
    setPlaying(false);
    setPlayState(`Unity Player 已退出（代码 ${result.exitCode??'未知'}）；可以继续编辑`);
  }),[]);
  useEffect(()=>window.releaseProject.onPlaytestEvent(event=>{
    if(event.type==='ready')setPlayState('Unity 已在工作台试玩区域运行 · 点击画面获得键盘焦点');
    else if(event.type==='error')setPlayState(`试玩宿主错误：${event.message??'未知'}`);
    else if(event.type==='line'&&event.line?.startsWith('UNITY_EMBED_TIMEOUT'))
      setPlayState('Unity 嵌入超时，正在回退…');
  }),[]);
  useEffect(()=>{
    if(!playing)return;
    const element=stageRef.current;
    if(!element)return;
    const send=()=>{
      const rect=element.getBoundingClientRect();
      void window.releaseProject.resizePlaytest({x:rect.x,y:rect.y,
        width:rect.width,height:rect.height}).catch(()=>{});
    };
    const observer=new ResizeObserver(send);
    observer.observe(element);
    window.addEventListener('resize',send);
    const timer=window.setInterval(send,700);
    send();
    return ()=>{observer.disconnect();window.removeEventListener('resize',send);
      window.clearInterval(timer);};
  },[playing]);
  const confirmDiscard=()=>!dirty||window.confirm('当前房间有未保存修改。放弃修改并继续？');
  async function openRoom(roomId:RoomId){
    if(!confirmDiscard())return;
    try{const result=await window.releaseProject.open(roomId);
      setOpened(result);setSteps([result.overlay]);setIndex(0);setSaved(JSON.stringify(result.overlay));
      setSelection([]);setHidden([]);setLocked([]);setError('');setMessage(`已打开 ${labels[roomId]} · ${result.level.objects.length} 个来源对象`);
    }catch(e){setError(String(e));}
  }
  function commit(next:RoomOverlay){
    if(!opened)return;
    try{validateOverlay(next,opened.base,opened.base.roomId);
      setSteps(old=>[...old.slice(0,index+1),next]);setIndex(index+1);setError('');
    }catch(e){setError(String(e));}
  }
  function editPosition(id:string,axis:'x'|'y'|'z',value:number){
    if(!opened||!overlay||!level||!Number.isFinite(value))return;
    const o=level.objects.find(x=>x.id===id);if(!o||!editable(o))return;
    const next=clone(overlay),existing=next.positions.find(x=>x.objectId===id);
    if(existing)existing.localPosition[axis]=value;
    else next.positions.push({objectId:id,localPosition:{...o.localPosition,[axis]:value}});
    commit(next);
  }
  function moveSelected(dx:number,dy:number){
    if(!level||!overlay||!Number.isFinite(dx)||!Number.isFinite(dy))return;
    try{if(selection.some(id=>{let o=level.objects.find(x=>x.id===id);
      while(o){if(locked.includes(o.id))return true;o=o.parentId?level.objects.find(x=>x.id===o!.parentId):undefined;}
      return false;}))throw Error('所选对象含锁定项');
      commit(moveCanvasSelection(level,overlay,selection,{x:dx,y:dy},null));
    }catch(e){setError(String(e));}
  }
  async function save(){
    if(!opened||!overlay)return;
    try{const result=await window.releaseProject.save(opened.base.roomId,overlay,opened.fingerprint);
      setOpened(result);setSaved(JSON.stringify(overlay));setError('');
      setMessage(`工作副本已保存：${result.workPath}（原始 Scene 与 V3 草稿未改）`);
    }catch(e){setError(String(e));}
  }
  async function playtest(){
    if(!opened||!overlay||playing)return;
    if(opened.base.roomId!=='room1'){setError('目前仅 Room 1 Physics 支持真实 Unity 试玩');return;}
    if(dirty){setError('请先保存当前修改，再启动真实 Unity 试玩');return;}
    const rect=stageRef.current?.getBoundingClientRect();
    if(!rect||rect.width<80||rect.height<80){setError('试玩区域尚未就绪');return;}
    try{setPlaying(true);setPlayState('正在启动 Unity Player 并等待修改回执…');setError('');
      const result=await window.releaseProject.playtest(opened.base.roomId,overlay,
        opened.fingerprint,{x:rect.x,y:rect.y,width:rect.width,height:rect.height});
      setPlayState(`Unity 已确认应用 ${result.appliedCount} 项位置修改 · PID ${result.pid??'未知'}`);
      setMessage(`试玩日志：${result.logPath}`);
    }catch(e){setPlaying(false);setPlayState('试玩未启动或修改未确认');
      void window.releaseProject.stopPlaytest();setError(String(e));}
  }
  function stopPlaytest(){
    setPlayState('正在停止 Unity Player…');
    void window.releaseProject.stopPlaytest();
  }
  function restore(){if(!opened||!overlay||!window.confirm('恢复本房间的全部来源位置？保存后仍可从自动备份找回。'))return;
    commit({...overlay,positions:[]});}
  useEffect(()=>{const key=(e:KeyboardEvent)=>{
    if(e.ctrlKey&&e.key.toLowerCase()==='s'){e.preventDefault();void save();}
    if(e.ctrlKey&&e.key.toLowerCase()==='z'){e.preventDefault();setIndex(i=>Math.max(0,i-1));}
    if(e.ctrlKey&&(e.key.toLowerCase()==='y'||e.shiftKey&&e.key.toLowerCase()==='z')){
      e.preventDefault();setIndex(i=>Math.min(steps.length-1,i+1));}
  };window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);});
  const objects=level?.objects??[],byId=new Map(objects.map(o=>[o.id,o]));
  const selected=selection.length===1?selection[0]:null;
  const choice=objects.find(o=>o.id===selected);
  const editable=(o:ObjectV3)=>{if(!level||!canvasEditable(level,o))return false;
    let parent:ObjectV3|undefined=o;
    while(parent){if(locked.includes(parent.id))return false;
      parent=parent.parentId?level.objects.find(x=>x.id===parent!.parentId):undefined;}
    return true;};
  const hierarchy=(parent:string|null,depth=0):React.ReactNode=>objects.filter(o=>o.parentId===parent)
    .sort((a,b)=>(a.siblingIndex??0)-(b.siblingIndex??0)).map(o=><React.Fragment key={o.id}>
      {(!query||o.name.toLowerCase().includes(query.toLowerCase()))&&<button data-source-object={o.id}
        className={'release-tree-row '+(selection.includes(o.id)?'active':'')}
        style={{paddingLeft:8+depth*14}} onClick={e=>setSelection(e.ctrlKey||e.shiftKey?
          selection.includes(o.id)?selection.filter(x=>x!==o.id):[...selection,o.id]:[o.id])}>
        <span>{o.rectTransform?'▣ ':o.components.some(c=>c.typeId==='unity.Camera')?'◉ ':''}{o.name}</span>
        <small>{o.rectTransform?'UI':o.components.some(c=>c.typeId==='unity.Camera')?'Camera':o.ownership} · {o.components.length}</small>
        <span className="release-tree-action" onClick={e=>{e.stopPropagation();setHidden(old=>old.includes(o.id)?old.filter(x=>x!==o.id):[...old,o.id]);}}>{hidden.includes(o.id)?'◌':'◉'}</span>
        <span className="release-tree-action" onClick={e=>{e.stopPropagation();setLocked(old=>old.includes(o.id)?old.filter(x=>x!==o.id):[...old,o.id]);}}>{locked.includes(o.id)?'🔒':'◇'}</span></button>}
      {hierarchy(o.id,depth+1)}</React.Fragment>);
  const sourceFields=choice?.components.map(c=>({id:c.componentId,type:c.typeId,
    fields:c.data?.fields??c.sourceSerialized?.fields,refs:c.sourceReferences??[]}))??[];
  return <div className="release-app">
    <header className="release-bar"><strong>Physics Level Editor · Beta</strong>
      <button onClick={()=>{if(confirmDiscard()){setOpened(null);setSelection([]);}}}>三关总览</button>
      <button onClick={save} disabled={!opened||!dirty}>保存工作副本</button>
      {playing?<button data-playtest-stop onClick={stopPlaytest}>停止试玩</button>:
        <button data-playtest onClick={()=>void playtest()}
          disabled={!opened||opened.base.roomId!=='room1'||dirty}
          title={dirty?'请先保存工作副本':'在工作台内启动真实 Unity Windows 游戏'}>
          {dirty?'先保存再试玩':'试玩 Room 1'}</button>}
      <button onClick={()=>setIndex(i=>Math.max(0,i-1))} disabled={!opened||index===0}>撤销</button>
      <button onClick={()=>setIndex(i=>Math.min(steps.length-1,i+1))}
        disabled={!opened||index>=steps.length-1}>重做</button>
      <button onClick={restore} disabled={!opened}>恢复来源位置</button>
      <button data-open-legacy onClick={()=>{if(confirmDiscard())onLegacy();}}>旧版 V1/V2 工具</button>
      <span className="release-grow"/>
      <b>{dirty?'未保存':'已保存'}</b>
    </header>
    {!opened?<section className="release-overview"><h1>三个完整来源房间</h1>
      <p>内置真实 Unity 场景导出的 V3 来源数据。画布显示 Collider 几何及明确标注的视觉占位，并非游戏画面；保存工作副本后可在同一区域启动嵌入的真实 Unity 试玩。</p>
      <div className="release-rooms">{manifest?.rooms.map(room=><button key={room.roomId}
        data-room-id={room.roomId} className="release-room" onClick={()=>void openRoom(room.roomId)}>
        <strong>{labels[room.roomId]}</strong><span>Level {room.roomId.slice(-1)} · {room.sourceObjectCount} 对象 · {room.sourceComponentCount} 组件</span>
        <small>来源状态：{room.migrationState} · 打开工作副本</small></button>)}</div></section>:<main className="release-main">
      <aside className="release-left"><h3>{labels[opened.base.roomId]}</h3>
        <p className="release-warning">SOURCE ONLY · 完整来源清单，游戏加载未验证</p>
        <input placeholder="按原始对象名称搜索" value={query} onChange={e=>setQuery(e.target.value)}/>
        <div className="release-tree">{hierarchy(null)}</div></aside>
      <div className="release-center">
        <div className="release-caption">编辑画布 · 缩放/平移查看 Collider 几何；试玩在同一区域嵌入真实 Unity 画面</div>
        <div className="release-stage" ref={stageRef}>
          <V3Canvas base={opened.base} level={level!} overlay={overlay!} selection={selection}
            setSelection={setSelection} onCommit={commit} hidden={hidden} locked={locked} onError={setError}/>
          {playing&&<div className="release-playtest-cover"
            onClick={()=>void window.releaseProject.focusPlaytest()}>
            <strong>真实 Unity 游戏正在此区域运行</strong>
            <span>{playState}</span>
            <button onClick={e=>{e.stopPropagation();stopPlaytest();}}>停止试玩</button>
            <small>点击画面获得键盘焦点 · A/D 移动 · 空格跳跃</small>
          </div>}
        </div>
      </div>
      <aside className="release-right"><h3>Inspector</h3>{selection.length>1?<>
        <p>选中 {selection.length} 个对象 · 批量位移保持相对位置</p>
        <div className="release-buttons"><button onClick={()=>moveSelected(-0.5,0)}>← 0.5</button>
          <button onClick={()=>moveSelected(0.5,0)}>→ 0.5</button>
          <button onClick={()=>moveSelected(0,0.5)}>↑ 0.5</button>
          <button onClick={()=>moveSelected(0,-0.5)}>↓ 0.5</button></div>
        <p className="release-note">只允许可编辑的世界对象整体位移；含只读或锁定对象时整批拒绝。尺寸和组件字段仍只读。</p>
      </>:choice?<>
        <strong>{choice.name}</strong><div className="release-id">objectId: {choice.id}</div>
        <p>归属 {choice.ownership} · {choice.active?'启用':'禁用'} · Layer {choice.layer} · {choice.tag}</p>
        <h4>Transform · localPosition</h4>
        {(['x','y','z'] as const).map(axis=><label key={axis} className="release-field">{axis.toUpperCase()}
          <Numeric value={choice.localPosition[axis]} disabled={!editable(choice)}
            onCommit={v=>editPosition(choice.id,axis,v)}/></label>)}
        <p className="release-note">{editable(choice)?'仅 localPosition 写入独立工作副本；保存后试玩会由 Unity 运行器读取并应用。':'此对象位置只读；UI 布局或运行器归属尚未验证。'}</p>
        <div className="release-id">rotation {JSON.stringify(choice.localRotation)} · scale {JSON.stringify(choice.localScale)}</div>
        {sourceFields.map(c=><details key={c.id}><summary>{c.type} · {c.id.slice(0,8)} · 只读</summary>
          <pre>{JSON.stringify(c.fields,null,2)}</pre>
          {c.refs.length>0&&<div><b>来源引用</b>{c.refs.map((r,i)=><p key={i}>{r.fieldPath} → {
            'objectId'in r?(byId.get(r.objectId)?.name??r.objectId):r.kind==='asset'?r.assetId:r.kind}</p>)}</div>}</details>)}
      </>:<p>选择场景对象查看组件和来源引用。</p>}</aside>
    </main>}
    <footer className="release-footer"><span>工作副本：{opened?.workPath??'未打开'}</span>
      <span>{message}</span>{error&&<strong data-release-error>{error}</strong>}
      <span>{playState} · 原始 Unity Scene 不会被覆盖</span></footer>
  </div>;
}
