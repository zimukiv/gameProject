import React,{useEffect,useMemo,useRef,useState} from 'react';
import type {LevelDataV3} from '../model/m1-contract.ts';
import type {Vec2} from '../model/level.ts';
import {screenToWorld,worldToScreen,type View} from '../editor/document.ts';
import {applyOverlay,type RoomOverlay} from '../editor/release-model.ts';
import {canvasShapes,moveCanvasSelection,shapeScreenBounds} from '../editor/v3-canvas.ts';

type Drag={mode:'pan'|'box'|'move';start:Vec2;startPan:Vec2;ids:string[];
  additive:boolean;preview:RoomOverlay|null};
type Props={base:LevelDataV3;level:LevelDataV3;overlay:RoomOverlay;selection:string[];
  setSelection:(ids:string[])=>void;onCommit:(overlay:RoomOverlay)=>void;
  hidden:string[];locked:string[];onError:(message:string)=>void};

export function V3Canvas({base,level,overlay,selection,setSelection,onCommit,hidden,locked,onError}:Props){
  const [view,setView]=useState<View>({zoom:32,pan:{x:0,y:0}});
  const [size,setSize]=useState({width:900,height:650});
  const [grid,setGrid]=useState(true),[snapOn,setSnapOn]=useState(true),[snapStep,setSnapStep]=useState(0.5);
  const [box,setBox]=useState<{a:Vec2;b:Vec2}|null>(null);
  const [preview,setPreview]=useState<RoomOverlay|null>(null);
  const [cursor,setCursor]=useState<Vec2|null>(null);
  const svg=useRef<SVGSVGElement>(null),drag=useRef<Drag|null>(null);
  useEffect(()=>{if(!svg.current)return;const obs=new ResizeObserver(entries=>{
    setSize({width:entries[0].contentRect.width,height:entries[0].contentRect.height});
  });obs.observe(svg.current);return()=>obs.disconnect();},[]);
  const effective=useMemo(()=>preview?applyOverlay(base,preview):level,[base,level,preview]);
  const shapes=useMemo(()=>canvasShapes(effective).filter(s=>!hidden.includes(s.objectId)),[effective,hidden]);
  const point=(e:React.PointerEvent<SVGSVGElement>|React.WheelEvent<SVGSVGElement>):Vec2=>{
    const rect=e.currentTarget.getBoundingClientRect();return {x:e.clientX-rect.left,y:e.clientY-rect.top};};
  const lockedByParent=(id:string)=>{let object=level.objects.find(o=>o.id===id);const seen=new Set<string>();
    while(object){if(locked.includes(object.id))return true;
      if(seen.has(object.id))return true;seen.add(object.id);
      object=object.parentId?level.objects.find(o=>o.id===object!.parentId):undefined;}return false;};
  const toggle=(id:string,additive:boolean)=>setSelection(additive?
    selection.includes(id)?selection.filter(x=>x!==id):[...selection,id]:[id]);
  function onDown(e:React.PointerEvent<SVGSVGElement>){
    const p=point(e),id=(e.target as Element).closest('[data-canvas-id]')?.getAttribute('data-canvas-id');
    if(e.button===1||e.button===2||e.altKey)
      drag.current={mode:'pan',start:p,startPan:{...view.pan},ids:[],additive:false,preview:null};
    else if(id){
      if(e.shiftKey||e.ctrlKey){toggle(id,true);return;}
      const ids=selection.includes(id)?selection:[id];setSelection(ids);
      if(ids.some(x=>!shapes.find(s=>s.objectId===x)?.editable||lockedByParent(x))){
        onError('所选对象含只读或锁定对象；拖动未修改数据');return;}
      drag.current={mode:'move',start:p,startPan:{...view.pan},ids,additive:false,preview:null};
    }else{
      const additive=e.shiftKey||e.ctrlKey;
      if(!additive)setSelection([]);
      drag.current={mode:'box',start:p,startPan:{...view.pan},ids:[],additive,preview:null};
      setBox({a:p,b:p});
    }
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onMove(e:React.PointerEvent<SVGSVGElement>){
    const p=point(e);setCursor(screenToWorld(p,view,size.width,size.height));
    const d=drag.current;if(!d)return;
    if(d.mode==='pan')setView(v=>({...v,pan:{x:d.startPan.x+p.x-d.start.x,y:d.startPan.y+p.y-d.start.y}}));
    if(d.mode==='box')setBox({a:d.start,b:p});
    if(d.mode==='move'){
      try{const delta={x:(p.x-d.start.x)/view.zoom,y:-(p.y-d.start.y)/view.zoom};
        const next=moveCanvasSelection(level,overlay,d.ids,delta,snapOn?snapStep:null);
        d.preview=next;setPreview(next);onError('');
      }catch(error){d.preview=null;setPreview(null);onError(String(error));}
    }
  }
  function onUp(e:React.PointerEvent<SVGSVGElement>){
    const d=drag.current;if(!d)return;
    if(d.mode==='move'&&d.preview&&JSON.stringify(d.preview)!==JSON.stringify(overlay))onCommit(d.preview);
    if(d.mode==='box'&&box){
      const minX=Math.min(box.a.x,box.b.x),maxX=Math.max(box.a.x,box.b.x);
      const minY=Math.min(box.a.y,box.b.y),maxY=Math.max(box.a.y,box.b.y);
      const found=shapes.filter(s=>{const r=shapeScreenBounds(s,view,size.width,size.height);
        return r.maxX>=minX&&r.minX<=maxX&&r.maxY>=minY&&r.minY<=maxY;}).map(s=>s.objectId);
      setSelection(d.additive?[...new Set([...selection,...found])]:found);
    }
    drag.current=null;setPreview(null);setBox(null);
    if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  }
  function wheel(e:React.WheelEvent<SVGSVGElement>){
    e.preventDefault();const p=point(e),w=screenToWorld(p,view,size.width,size.height);
    const zoom=Math.max(4,Math.min(240,view.zoom*(e.deltaY<0?1.1:1/1.1)));
    setView({zoom,pan:{x:p.x-size.width/2-w.x*zoom,y:p.y-size.height/2+w.y*zoom}});
  }
  function focus(){const target=shapes.find(s=>selection.includes(s.objectId));if(!target)return;
    setView(v=>({...v,pan:{x:-target.worldCenter.x*v.zoom,y:target.worldCenter.y*v.zoom}}));}
  const screen=(p:Vec2)=>worldToScreen(p,view,size.width,size.height);
  const colliderCount=shapes.filter(s=>s.kind==='box'||s.kind==='circle').length;
  return <section className="release-center">
    <div className="release-caption">2D Scene Canvas · Unity 世界坐标，Y 向上 · 滚轮缩放 / 中键或 Alt 平移 / Shift 框选
      <button onClick={()=>setGrid(!grid)}>网格 {grid?'开':'关'}</button>
      <button onClick={()=>setSnapOn(!snapOn)}>吸附 {snapOn?'开':'关'}</button>
      <label>步长 <input type="number" min="0.01" step="any" value={snapStep}
        onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n)&&n>0)setSnapStep(n);}}/></label>
      <button onClick={focus} disabled={!selection.length}>聚焦选中</button>
    </div>
    <svg ref={svg} className="release-canvas" onPointerDown={onDown} onPointerMove={onMove}
      onPointerUp={onUp} onPointerCancel={()=>{drag.current=null;setPreview(null);setBox(null);}}
      onWheel={wheel} onContextMenu={e=>e.preventDefault()}>
      {grid&&<g className="release-grid">{Array.from({length:Math.ceil(size.width/view.zoom)+2},(_,i)=>{
        const x=(i-Math.ceil(size.width/view.zoom)/2)*view.zoom+
          (size.width/2+view.pan.x)%view.zoom;
        return <line key={'x'+i} x1={x} x2={x} y1={0} y2={size.height}/>;})}
        {Array.from({length:Math.ceil(size.height/view.zoom)+2},(_,i)=>{
          const y=(i-Math.ceil(size.height/view.zoom)/2)*view.zoom+
            (size.height/2+view.pan.y)%view.zoom;
          return <line key={'y'+i} x1={0} x2={size.width} y1={y} y2={y}/>;})}</g>}
      {shapes.map(shape=>{
        const points=shape.worldPoints.map(screen),at=screen(shape.worldCenter);
        const picked=selection.includes(shape.objectId);
        const geometry=shape.kind==='box'||shape.kind==='circle';
        return <g key={shape.objectId} data-canvas-id={shape.objectId}
          data-geometry={shape.kind} className={'release-object '+(picked?'picked ':'')+(shape.editable?'':'read-only')}>
          {geometry?<>
            <polygon className="release-hit" points={points.map(p=>`${p.x},${p.y}`).join(' ')}/>
            <polygon className={'release-outline '+(shape.isTrigger?'trigger':'')}
              points={points.map(p=>`${p.x},${p.y}`).join(' ')} fill={shape.color}/>
          </>:shape.kind==='spritePlaceholder'?<rect x={at.x-6} y={at.y-6} width="12" height="12"
            fill={shape.color} className="release-placeholder"/>:
            <path d={`M${at.x} ${at.y-6}L${at.x+6} ${at.y}L${at.x} ${at.y+6}L${at.x-6} ${at.y}Z`}
              className="release-placeholder"/>}
          {picked&&geometry&&points.filter((_,i)=>shape.kind==='box'||i%8===0).map((p,i)=><rect key={i}
            className="release-readonly-handle" x={p.x-3} y={p.y-3} width="6" height="6"><title>Collider 尺寸目前只读</title></rect>)}
          <text x={at.x+8} y={at.y-8}>{shape.name}</text>
        </g>;
      })}
      {box&&<rect className="release-selection-box" x={Math.min(box.a.x,box.b.x)}
        y={Math.min(box.a.y,box.b.y)} width={Math.abs(box.b.x-box.a.x)}
        height={Math.abs(box.b.y-box.a.y)}/>}
    </svg>
    <div className="release-caption">{colliderCount} 个真实 Collider 轮廓 · {shapes.length} 个世界对象 ·
      zoom {view.zoom.toFixed(1)} px/unit · {cursor?`鼠标 ${cursor.x.toFixed(2)}, ${cursor.y.toFixed(2)}`:'鼠标世界坐标'} ·
      Sprite 无图像资源时只显示颜色/几何占位；Collider 尺寸只读</div>
  </section>;
}
