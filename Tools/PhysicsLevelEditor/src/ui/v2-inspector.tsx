import React, {useEffect,useState} from 'react';
import type {LevelDataV2,LevelObjectV2,V2Component,SceneComponentRef,TransformRef} from '../model/level-v2.ts';
import {registryV2,type FieldSpec} from '../model/registry-v2.ts';
import {validateV2} from '../model/validate-v2.ts';

type FileState={path:string;fingerprint:string}|null;
const copy=<T,>(value:T):T=>structuredClone(value);
const get=(root:unknown,path:string):unknown=>path.split('.').reduce<unknown>((value,key)=>
  value && typeof value==='object'?(value as Record<string,unknown>)[key]:undefined,root);
function put(root:object,path:string,value:unknown) {
  const pieces=path.split('.'); let object=root as Record<string,unknown>;
  for(const key of pieces.slice(0,-1)) object=object[key] as Record<string,unknown>;
  object[pieces.at(-1)!]=value;
}
const supported=new Set(['mechanism.thermalController','mechanism.railgun']);

export function V2Inspector({onBack}:{onBack:()=>void}) {
  const [level,setLevel]=useState<LevelDataV2|null>(null);
  const [file,setFile]=useState<FileState>(null);
  const [saved,setSaved]=useState('');
  const [selection,setSelection]=useState<string|null>(null);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('打开 LevelDataV2 文件；Phase 4B 仅编辑冷热控制器与电磁炮参数。');
  const dirty=level!==null && JSON.stringify(level)!==saved;
  useEffect(()=>{const handler=(event:BeforeUnloadEvent)=>{if(dirty){event.preventDefault();event.returnValue='';}};
    window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler);},[dirty]);
  const back=()=>{if(!dirty || window.confirm('V2 文件有未保存修改。放弃修改？')) onBack();};
  const open=async()=>{
    if(dirty && !window.confirm('V2 文件有未保存修改。放弃修改？')) return;
    try {const result=await window.levelFiles.open();if(!result)return;
      const data=validateV2(JSON.parse(result.text));setLevel(data);setSaved(JSON.stringify(data));
      setFile({path:result.path,fingerprint:result.fingerprint});setSelection(data.objects[0]?.id??null);
      setError('');setMessage(`已打开 ${result.path}`);
    } catch(e){setError(String(e));}
  };
  const save=async(as:boolean)=>{
    if(!level)return;
    try {validateV2(level);const text=JSON.stringify(level,null,2)+'\n';
      const sample=Boolean(file?.path.toLowerCase().match(/level1\.phase4[ab]\.json$/));
      if(!as && sample && !window.confirm('即将覆盖 Phase 4 部分测试样本。确定继续？'))return;
      const result=as||!file?await window.levelFiles.saveAs(text):
        await window.levelFiles.save(file.path,text,file.fingerprint);
      if(!result)return;setFile({path:result.path,fingerprint:result.fingerprint});
      setSaved(JSON.stringify(level));setError('');setMessage(`已保存 ${result.path}`);
    }catch(e){setError(String(e));}
  };
  const edit=(objectId:string,typeId:string,path:string,value:unknown):boolean=>{
    if(!level)return false;
    try {const next=copy(level);const object=next.objects.find(o=>o.id===objectId)!;
      const component=object.components.find(c=>c.typeId===typeId)!;
      put(component,path,value);validateV2(next);setLevel(next);setError('');return true;
    }catch(e){setError(String(e));return false;}
  };
  const selected=level?.objects.find(o=>o.id===selection);
  const candidates=(type:string,self:string):LevelObjectV2[]=>level?.objects.filter(o=>o.id!==self &&
    o.components.some(c=>c.typeId===type))??[];
  const componentRef=(id:string,type:string):SceneComponentRef|null=>id?
    {kind:'sceneComponent',objectId:id,componentTypeId:type,instanceId:null}:null;
  const transformRef=(id:string):TransformRef|null=>id?{kind:'transform',objectId:id}:null;
  const renderField=(object:LevelObjectV2,component:V2Component,spec:FieldSpec)=>{
    const path=spec.path, value=get(component,path), id=object.id, type=component.typeId;
    const label=<span style={{minWidth:190}}>{path}{spec.minimum!==undefined?` (≥ ${spec.minimum})`:''}</span>;
    if(path==='thermal.roomFilterOverlay')return <div key={path} style={{opacity:.6}}>{path}: overlay 引用尚不支持导入，保持 null</div>;
    if(path==='thermal.linkedController' || path==='railgun.launchEndPoint'){
      const targetType=path.startsWith('thermal')?'mechanism.thermalController':'core.marker';
      const choices=candidates(targetType,id).filter(o=>targetType!=='mechanism.thermalController'||
        !o.components.find(c=>c.typeId===targetType)?.thermal?.linkedController);
      const current=(value as {objectId?:string}|null)?.objectId??'';
      return <label key={path} style={{display:'flex',gap:8,margin:'6px 0'}}>{label}<select value={current}
        onChange={e=>{if(targetType==='core.marker'&&!e.target.value){setError('Railgun 必须选择有效终点 Marker');return;}
          edit(id,type,path,targetType==='core.marker'?transformRef(e.target.value):componentRef(e.target.value,targetType));}}>
        <option value="">{targetType==='core.marker'?'选择终点 Marker':'无链接控制器'}</option>
        {choices.map(o=><option key={o.id} value={o.id}>{o.name} · {o.id.slice(0,8)}</option>)}
      </select></label>;
    }
    if(path==='thermal.controlledIce'){
      const current=value as SceneComponentRef[];
      return <section key={path}><b>controlledIce · 稳定 ID</b>{candidates('mechanism.ice',id).map(o=><label key={o.id}
        style={{display:'block'}}><input type="checkbox" checked={current.some(r=>r.objectId===o.id)} onChange={e=>{
          const next=e.target.checked?[...current,componentRef(o.id,'mechanism.ice')!]:current.filter(r=>r.objectId!==o.id);
          edit(id,type,path,next);}}/>{o.name} · {o.id.slice(0,8)}</label>)}</section>;
    }
    if(spec.type==='vec2'||spec.type==='color'){
      const keys=spec.type==='vec2'?['x','y']:['r','g','b','a'];
      return <div key={path} style={{margin:'6px 0'}}>{path}<div style={{display:'flex',gap:8}}>{keys.map(axis=><label key={axis}>{axis}
        <input key={`${id}.${path}.${axis}.${String((value as Record<string,number>)[axis])}`} type="number" step="any"
          defaultValue={(value as Record<string,number>)[axis]} style={{width:82}} onBlur={e=>{
            if(!e.target.value.trim()||!Number.isFinite(Number(e.target.value))) {
              setError(`${path}.${axis}: 需要有限数字`);e.target.value=String((value as Record<string,number>)[axis]);return;}
            if(!edit(id,type,`${path}.${axis}`,Number(e.target.value)))
              e.target.value=String((value as Record<string,number>)[axis]);}}/></label>)}</div></div>;
    }
    if(spec.type==='boolean')return <label key={path} style={{display:'flex',gap:8,margin:'6px 0'}}>{label}
      <input type="checkbox" checked={Boolean(value)} onChange={e=>edit(id,type,path,e.target.checked)}/></label>;
    if(spec.type==='enum')return <label key={path} style={{display:'flex',gap:8,margin:'6px 0'}}>{label}
      <select value={String(value)} onChange={e=>edit(id,type,path,e.target.value)}>
        {spec.choices?.map(choice=><option key={choice}>{choice}</option>)}</select></label>;
    return <label key={path} style={{display:'flex',gap:8,margin:'6px 0'}}>{label}
      <input key={`${id}.${path}.${String(value)}`} type={spec.type==='number'||spec.type==='integer'?'number':'text'}
        step={spec.type==='integer'?1:'any'} defaultValue={String(value??'')} onBlur={e=>{
          const raw=e.target.value;
          if(spec.type==='number'||spec.type==='integer'){
            const number=Number(raw);
            if(!raw.trim()||!Number.isFinite(number)||spec.type==='integer'&&!Number.isInteger(number)||
              spec.minimum!==undefined&&number<spec.minimum){setError(`${path}: 输入超出注册范围`);e.target.value=String(value??'');return;}
            if(!edit(id,type,path,number))e.target.value=String(value??'');
          }else if(!edit(id,type,path,raw))e.target.value=String(value??'');
        }}/></label>;
  };
  return <div className="app"><header><strong>Physics Level Editor · V2 Inspector</strong>
    <button onClick={back}>返回 V1 编辑器</button><button onClick={()=>void open()}>打开 V2 JSON</button>
    <button disabled={!level} onClick={()=>void save(false)}>保存</button>
    <button disabled={!level} onClick={()=>void save(true)}>另存为</button>
    <span className="spacer"/>{level?.coverage==='partial'&&<b className="badge">PARTIAL COVERAGE</b>}
    <span>{dirty?'● 未保存':'已保存'}</span></header>
    <main><aside className="left"><h3>V2 Hierarchy</h3>{level?.objects.map(o=><button key={o.id}
      className={selection===o.id?'selected':''} style={{display:'block',width:'100%',textAlign:'left'}}
      onClick={()=>setSelection(o.id)}>{o.name} · {o.id.slice(0,8)}</button>)}</aside>
      <section className="center" style={{padding:20,overflow:'auto'}}><h3>组件 Inspector · Design Config</h3>
      {selected?<><p>ID {selected.id}</p>{selected.components.map(component=>{
        const registration=registryV2[component.typeId];
        return <section key={component.typeId} className="component"><h4>{component.typeId} · v{component.version}</h4>
          <p>{registration?.status??'未知组件'}；{supported.has(component.typeId)?'Unity 适配已实现，待验收':'当前视图只读'}</p>
          {supported.has(component.typeId)&&registration?.fields.map(spec=>renderField(selected,component,spec))}</section>;
      })}</>:<p>打开 V2 文件并选择对象。</p>}</section></main>
    <footer><div className="status"><b>文件与验证</b>{error&&<span className="error">{error}</span>}
      <span>{message}</span><span>{file?.path??'未打开文件'}</span></div></footer></div>;
}
