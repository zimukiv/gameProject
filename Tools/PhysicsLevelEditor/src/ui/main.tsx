import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { LevelDataV1, LevelObject, LevelComponent, Vec2, Vec3 } from '../model/level.ts';
import { registry, editorFields } from '../model/registry.ts';
import { validateLevel } from '../model/validate.ts';
import { assertSchema } from '../editor/schema.ts';
import { batchSet, commonValue, isEffectivelyLocked, movableRoots, translateWorld, type FieldTarget } from '../editor/selection.ts';
import { clone, commit, createObject, current, deleteObjects, dirty, duplicate, groupObjects, history, moveObjects,
  reparentObject,
  redo, replaceCurrent, resizeColliderFromWorld, screenToWorld, serialized, setComponent, setObject, snap, undo, validateDocument,
  worldToScreen, colliderWorldCorners, worldPose, type History, type View, type Kind } from '../editor/document.ts';
import './style.css';

type FileState = { path: string; fingerprint: string } | null;
type Drag = { mode: 'move' | 'pan' | 'box' | 'resize'; start: Vec2; ids?: string[];
  startPan?: Vec2; objectId?: string; corner?: number; additive?: boolean };
const kinds: Kind[] = ['platform', 'airVent', 'token'];
const kindNames: Record<Kind,string> = { platform: '普通平台', airVent: '喷气装置', token: 'Token' };
const fieldValue = (root: unknown, path: string): unknown => path.split('.').reduce((v, key) => (v as Record<string, unknown>)?.[key], root);
function assignField(root: object, path: string, value: unknown) {
  const keys = path.split('.'); let target = root as Record<string, unknown>;
  for (const key of keys.slice(0,-1)) target = target[key] as Record<string, unknown>;
  target[keys.at(-1)!] = value;
}
function Field({ label, value, type, onCommit, mixed = false, onInvalid }: { label: string; value: unknown; type: string;
  onCommit: (value: unknown) => boolean | void; mixed?: boolean; onInvalid?: (message: string) => void }) {
  const [draft, setDraft] = useState(mixed ? '' : String(value ?? ''));
  const checkbox = useRef<HTMLInputElement>(null);
  useEffect(() => setDraft(mixed ? '' : String(value ?? '')), [value,mixed]);
  useEffect(() => { if (checkbox.current) checkbox.current.indeterminate = mixed; }, [mixed]);
  if (type === 'boolean') return <label className="field"><span>{label}</span><input ref={checkbox} type="checkbox" checked={!mixed && Boolean(value)} onChange={e => onCommit(e.target.checked)} /></label>;
  const save = () => {
    if (mixed && !draft.trim()) return;
    let result: unknown = draft;
    if (type === 'number' || type === 'integer') {
      result = Number(draft);
      if (!draft.trim() || !Number.isFinite(result) || (type === 'integer' && !Number.isInteger(result))) {
        onInvalid?.(`${label}：请输入${type === 'integer' ? '整数' : '有限数字'}`);
        setDraft(mixed ? '' : String(value)); return;
      }
    }
    try { if (onCommit(result) === false) setDraft(mixed ? '' : String(value)); }
    catch { setDraft(mixed ? '' : String(value)); }
  };
  return <label className="field"><span>{label}</span><input value={draft} placeholder={mixed ? 'Mixed' : undefined} type={type === 'number' || type === 'integer' ? 'number' : 'text'} step={type === 'integer' ? 1 : 'any'}
    onChange={e => setDraft(e.target.value)} onBlur={save} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setDraft(String(value)); e.currentTarget.blur(); } }} /></label>;
}

function App() {
  const [doc, setDoc] = useState<History | null>(null);
  const [file, setFile] = useState<FileState>(null);
  const [selection, setSelection] = useState<string[]>([]);
  const [locked, setLocked] = useState<string[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<View>({ zoom: 32, pan: { x: 0, y: 0 } });
  const [grid, setGrid] = useState(true);
  const [snapOn, setSnapOn] = useState(true);
  const [snapStep, setSnapStep] = useState(0.5);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [message, setMessage] = useState('打开 Phase 1 样本或其他 LevelDataV1 文件。');
  const [error, setError] = useState('');
  const [box, setBox] = useState<{ a: Vec2; b: Vec2 } | null>(null);
  const [previewLevel, setPreviewLevel] = useState<LevelDataV1 | null>(null);
  const canvas = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [cursorWorld, setCursorWorld] = useState<Vec2 | null>(null);
  const level = doc ? current(doc) : null;
  const selected = level?.objects.find(o => o.id === selection[0]);
  const issues = level ? validateDocument(level) : [];
  const hasChanges = doc ? dirty(doc) : false;
  useEffect(() => { if (!canvas.current) return; const obs = new ResizeObserver(entries => {
    setSize({ width: entries[0].contentRect.width, height: entries[0].contentRect.height });
  }); obs.observe(canvas.current); return () => obs.disconnect(); }, [doc]);
  useEffect(() => { const before = (e: BeforeUnloadEvent) => { if (hasChanges) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', before); return () => window.removeEventListener('beforeunload', before); }, [hasChanges]);

  const act = (fn: () => void): boolean => { try { setError(''); fn(); return true; }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); return false; } };
  const edit = (next: LevelDataV1) => { if (!doc) return; setDoc(commit(doc, next)); };
  const confirmDiscard = () => !hasChanges || window.confirm('当前文件有未保存修改。放弃修改并继续？');
  async function load(open: () => Promise<{ path: string; text: string; fingerprint: string } | null>) {
    if (!confirmDiscard()) return;
    try {
      const result = await open(); if (!result) return;
      const raw = JSON.parse(result.text); assertSchema(raw); const data = validateLevel(raw);
      setDoc(history(data)); setFile({ path: result.path, fingerprint: result.fingerprint });
      setSelection([]); setLocked([]); setHidden([]); setCollapsed([]); setError(''); setMessage(`已打开 ${result.path}`);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  function newLevel() {
    if (!confirmDiscard()) return;
    // A new Phase 1 document is created from a real valid source, keeping its required Sprite reference.
    void (async () => { try {
      const sample = await window.levelFiles.openSample();
      const source = validateLevel(JSON.parse(sample.text));
      const only = createObject('platform', source.objects.find(o => o.kind === 'platform')!);
      const fresh: LevelDataV1 = { ...source, levelId: `editor:${crypto.randomUUID()}`,
        sourceSceneGuid: crypto.randomUUID().replaceAll('-', ''), objects: [only] };
      setDoc({ ...history(fresh), saved: '' }); setFile(null); setSelection([only.id]); setLocked([]); setHidden([]); setCollapsed([]); setError('');
      setMessage('新建 partial 文档；平台 Sprite 引用取自 Phase 1 样本。请另存为。');
    } catch (e) { setError(String(e)); } })();
  }
  async function save(as = false) {
    if (!doc || !level) return;
    try {
      assertSchema(level); validateLevel(level);
      const text = serialized(level);
      const isSample = Boolean(file?.path.toLowerCase().endsWith('level1.phase1.json'));
      if (!as && isSample && !window.confirm('即将覆盖 Phase 1 部分样本文件。确定保存到原文件？')) return;
      const result = as || !file ? await window.levelFiles.saveAs(text) : await window.levelFiles.save(file.path, text, file.fingerprint);
      if (!result) return;
      setFile({ path: result.path, fingerprint: result.fingerprint });
      setDoc(h => h ? { ...h, saved: text } : h);
      setMessage(`已保存 ${result.path}`); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  async function add(kind: Kind) {
    if (!level) return;
    try {
      let source = level.objects.find(o => o.kind === kind);
      if (!source) {
        const sample = validateLevel(JSON.parse((await window.levelFiles.openSample()).text));
        source = sample.objects.find(o => o.kind === kind);
      }
      if (!source) throw new Error(`没有 ${kindNames[kind]} 的 Unity 适配样本`);
      const object = createObject(kind, source);
      setDoc(h => h ? commit(h, { ...current(h), objects: [...current(h).objects, object] }) : h);
      setSelection([object.id]); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  function ensureUnlocked() { if (level && selection.some(id => isEffectivelyLocked(level,id,locked))) throw new Error('所选对象或其父级已锁定'); }
  function copy() { act(() => { if (!level || !selection.length) return; ensureUnlocked(); const result = duplicate(level, selection); edit(result.level); setSelection(result.ids); }); }
  function group() { act(() => { if (!level) return; ensureUnlocked(); edit(groupObjects(level, selection)); setSelection([selection[0]]); }); }
  function remove() { act(() => { if (!level || !selection.length) return; ensureUnlocked(); edit(deleteObjects(level, selection)); setSelection([]); }); }
  function updateObject(id: string, path: string, value: unknown) { return act(() => { if (!level) return;
    if (isEffectivelyLocked(level,id,locked)) throw new Error('对象或其父级已锁定');
    edit(setObject(level, id, o => assignField(o, path, value))); }); }
  function updateComponent(id: string, typeId: string, path: string, value: unknown) { return act(() => { if (!level) return;
    if (isEffectivelyLocked(level,id,locked)) throw new Error('对象或其父级已锁定');
    edit(setComponent(level, id, typeId, c => assignField(c, path, value))); }); }
  function changeParent(id: string, parentId: string | null) { act(() => {
    if (!level) return;
    if (isEffectivelyLocked(level,id,locked) || parentId && isEffectivelyLocked(level,parentId,locked))
      throw new Error('对象或目标父级已锁定');
    edit(reparentObject(level,id,parentId));
  }); }
  function updateBatch(target: FieldTarget, value: unknown) { return act(() => {
    if (!level) return; edit(batchSet(level,selection,target,value,locked));
  }); }
  function applyOffset() { act(() => {
    if (!level) return; edit(translateWorld(level,selection,offset,locked)); setOffset({x:0,y:0});
  }); }
  function toggleSelect(id: string, additive: boolean) { setSelection(old => additive ? old.includes(id) ? old.filter(x => x !== id) : [...old,id] : [id]); }
  function focus(id?: string) { if (!level) return; const object = level.objects.find(o => o.id === (id ?? selected?.id));
    if (!object) return; const p = worldPose(level,object).position;
    setView(v => ({ ...v, pan: { x: -p.x * v.zoom, y: p.y * v.zoom } })); }
  function isHidden(id: string) { if (!level) return false; let object=level.objects.find(o=>o.id===id);
    while(object) { if(hidden.includes(object.id)) return true;
      object=object.parentId ? level.objects.find(o=>o.id===object!.parentId) : undefined; }
    return false; }
  function pointer(e: React.MouseEvent<SVGSVGElement>): Vec2 { const r = e.currentTarget.getBoundingClientRect(); return { x: e.clientX-r.left, y: e.clientY-r.top }; }
  function onDown(e: React.PointerEvent<SVGSVGElement>) {
    if (!level) return;
    const p = pointer(e);
    const target = (e.target as Element).closest('[data-object-id]')?.getAttribute('data-object-id');
    const corner = (e.target as Element).getAttribute('data-corner');
    if (e.button === 1 || e.button === 2 || e.altKey) drag.current = { mode: 'pan', start: p, startPan: clone(view.pan) };
    else if (target && corner !== null && !isEffectivelyLocked(level,target,locked)) {
      setSelection([target]); drag.current={mode:'resize',start:p,objectId:target,corner:Number(corner)};
    }
    else if (target) {
      if (e.shiftKey || e.ctrlKey) { toggleSelect(target,true); return; }
      let ids = selection;
      if (!selection.includes(target)) { ids = [target]; toggleSelect(target, false); }
      if (isEffectivelyLocked(level,target,locked)) return;
      drag.current = { mode: 'move', start: p, ids };
    } else { const additive=e.shiftKey||e.ctrlKey; drag.current = { mode: 'box', start: p, additive };
      setBox({ a: p, b: p }); if (!additive) setSelection([]); }
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const p = pointer(e);
    setCursorWorld(screenToWorld(p,view,size.width,size.height));
    if (!drag.current || !level) return; const d = drag.current;
    if (d.mode === 'pan') setView(v => ({ ...v, pan: { x: d.startPan!.x + p.x-d.start.x, y: d.startPan!.y + p.y-d.start.y } }));
    if (d.mode === 'box') setBox({ a: d.start, b: p });
    if (d.mode === 'move') {
      let dx = (p.x-d.start.x)/view.zoom, dy = -(p.y-d.start.y)/view.zoom;
      try {
        if (snapOn) {
          const anchor = worldPose(level,movableRoots(level,d.ids!)[0]).position;
          dx = snap(anchor.x+dx,snapStep)-anchor.x;
          dy = snap(anchor.y+dy,snapStep)-anchor.y;
        }
        setPreviewLevel(translateWorld(level,d.ids!,{x:dx,y:dy},locked)); setError('');
      } catch (error) { setPreviewLevel(null); setError(error instanceof Error ? error.message : String(error)); }
    }
    if (d.mode === 'resize') {
      const world=screenToWorld(p,view,size.width,size.height);
      const target=snapOn ? {x:snap(world.x,snapStep),y:snap(world.y,snapStep)} : world;
      try { setPreviewLevel(resizeColliderFromWorld(level,d.objectId!,d.corner!,target)); setError(''); }
      catch(error) { setPreviewLevel(null); setError(error instanceof Error?error.message:String(error)); }
    }
  }
  function onUp(e: React.PointerEvent<SVGSVGElement>) {
    if (!drag.current || !level) return; const d = drag.current;
    if ((d.mode === 'move' || d.mode === 'resize') && previewLevel) act(() => edit(previewLevel));
    if (d.mode === 'box' && box) {
      const minX = Math.min(box.a.x,box.b.x), maxX = Math.max(box.a.x,box.b.x);
      const minY = Math.min(box.a.y,box.b.y), maxY = Math.max(box.a.y,box.b.y);
      const found = level.objects.filter(o => { if (isHidden(o.id)) return false;
        const points=colliderWorldCorners(level,o).map(c=>worldToScreen(c,view,size.width,size.height));
        return Math.max(...points.map(p=>p.x))>=minX && Math.min(...points.map(p=>p.x))<=maxX &&
          Math.max(...points.map(p=>p.y))>=minY && Math.min(...points.map(p=>p.y))<=maxY;
      }).map(o => o.id);
      setSelection(d.additive ? old => [...new Set([...old,...found])] : found);
    }
    drag.current = null; setPreviewLevel(null); setBox(null);
  }
  function onCancel() { drag.current=null; setPreviewLevel(null); setBox(null); }
  function wheel(e: React.WheelEvent<SVGSVGElement>) {
    e.preventDefault(); const p = pointer(e); const w = screenToWorld(p, view, size.width, size.height);
    const zoom = Math.max(6, Math.min(240, view.zoom * (e.deltaY < 0 ? 1.1 : 1/1.1)));
    setView({ zoom, pan: { x: p.x-size.width/2-w.x*zoom, y: p.y-size.height/2+w.y*zoom } });
  }
  useEffect(() => { const key = (e: KeyboardEvent) => {
    if (['INPUT','TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
    if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); void save(); }
    if (e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); setDoc(h => h ? undo(h) : h); }
    if (e.ctrlKey && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); setDoc(h => h ? redo(h) : h); }
    if (e.ctrlKey && e.key.toLowerCase() === 'd') { e.preventDefault(); copy(); }
    if (e.key === 'Delete') remove();
  }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); });
  const visible = useMemo(() => level?.objects.filter(o => o.name.toLowerCase().includes(query.toLowerCase())) ?? [], [level,query]);
  const tree = (parent: string | null, depth = 0): React.ReactNode => visible.filter(o => o.parentId === parent).map(o =>
    <React.Fragment key={o.id}><div className={`tree-row ${selection.includes(o.id) ? 'selected' : ''}`} style={{ paddingLeft: 10+depth*15 }}
      onClick={e => toggleSelect(o.id, e.ctrlKey || e.shiftKey)} onDoubleClick={() => { setSelection([o.id]); focus(o.id); }}>
      {level?.objects.some(child=>child.parentId===o.id) ? <button className="tree-control" onClick={e=>{e.stopPropagation();setCollapsed(old=>old.includes(o.id)?old.filter(id=>id!==o.id):[...old,o.id]);}}>{collapsed.includes(o.id)?'▸':'▾'}</button> : <span>◇</span>}
      <span>{o.name}</span><small>{kindNames[o.kind]}</small>
      <button className="tree-control" title="会话可见性" onClick={e=>{e.stopPropagation();setHidden(old=>old.includes(o.id)?old.filter(id=>id!==o.id):[...old,o.id]);}}>{isHidden(o.id)?'◌':'◉'}</button>
      <button className="tree-control" title="会话锁定" onClick={e=>{e.stopPropagation();setLocked(old=>old.includes(o.id)?old.filter(id=>id!==o.id):[...old,o.id]);}}>{isEffectivelyLocked(level!,o.id,locked)?'🔒':'◇'}</button>
      </div>{!collapsed.includes(o.id) && tree(o.id, depth+1)}</React.Fragment>);
  const ordered = level ? [...level.objects].filter(o=>!isHidden(o.id)).sort((a,b) => Number(Boolean(a.parentId))-Number(Boolean(b.parentId))) : [];
  return <div className="app">
    <header><strong>Physics Level Editor</strong><button onClick={newLevel}>新建</button><button onClick={() => void load(window.levelFiles.open)}>打开</button>
      <button onClick={() => void load(window.levelFiles.openSample)}>打开 Phase 1 样本</button>
      <button disabled={!doc} onClick={() => void save()}>保存</button><button disabled={!doc} onClick={() => void save(true)}>另存为</button>
      <button disabled={!doc || doc.index === 0} onClick={() => setDoc(h => h && undo(h))}>撤销</button>
      <button disabled={!doc || doc.index === doc.states.length-1} onClick={() => setDoc(h => h && redo(h))}>重做</button>
      <button className={snapOn ? 'on' : ''} onClick={() => setSnapOn(!snapOn)}>吸附 {snapOn ? '开' : '关'}</button>
      <label className="snap-step">步长 <input type="number" min="0.01" step="any" value={snapStep} onChange={e => {
        const n = Number(e.target.value); if (Number.isFinite(n) && n >= 0.01 && n <= 100) { setSnapStep(n); setError(''); }
        else setError('吸附步长必须在 0.01–100 世界单位之间'); }} /></label>
      <button onClick={() => setMessage(issues.map(i => `${i.severity}: ${i.message}`).join(' | ') || '验证通过')}>验证</button>
      <span className="spacer" /><span>{hasChanges ? '● 未保存' : '已保存'} {level && <b className="badge">PARTIAL COVERAGE</b>}</span>
    </header>
    <main><aside className="left"><h3>Hierarchy</h3><input placeholder="搜索对象名称" value={query} onChange={e => setQuery(e.target.value)} />
       <div className="tree">{level && (query ? visible.map(o => <div key={o.id} className={`tree-row ${selection.includes(o.id) ? 'selected' : ''}`}
         onClick={e => toggleSelect(o.id,e.ctrlKey||e.shiftKey)} onDoubleClick={()=>{setSelection([o.id]);focus(o.id);}}>{o.name} <small>{kindNames[o.kind]}</small></div>) : tree(null))}</div>
      <h3>物件库</h3><div className="buttons">{kinds.map(k => <button key={k} disabled={!level} onClick={() => void add(k)}>+ {kindNames[k]}</button>)}</div>
      <div className="buttons"><button disabled={!selection.length} onClick={copy}>复制</button><button disabled={selection.length<2} onClick={group}>分组</button><button disabled={!selection.length} onClick={remove}>删除</button>
        <button disabled={!selection.length} onClick={() => setLocked(old => selection.every(id => old.includes(id)) ? old.filter(id => !selection.includes(id)) : [...new Set([...old,...selection])])}>锁定/解锁</button></div>
      <h3>组件库</h3><p className="hint">Phase 1 固定组合；以下组件由 Unity 适配器支持。暂不能单独增删。</p>
      {Object.entries(registry).map(([id,r]) => <div className="library" key={id}>{id}<small>{r.unity}</small></div>)}
      <h3>资源引用</h3><p className="hint">Phase 1 仅支持 Unity Sprite GUID + local file ID。外部 PNG/JPG/WAV/OGG 还不能映射到 Unity 资源，当前不提供关联按钮。</p>
      {[...new Set(level?.objects.flatMap(o => o.components.filter(c => c.sprite).map(c => c.sprite!.assetGuid)) ?? [])].map(guid =>
        <div className="library" key={guid}>Sprite GUID <small>{guid}</small></div>)}
      <h3>模板</h3><div className="buttons"><button disabled={!selection.length} onClick={() => void (async () => { try { if (!level) return; const objects = level.objects.filter(o => selection.includes(o.id)); const path = await window.levelFiles.saveTemplate(JSON.stringify({ templateVersion: 1, objects }, null, 2)); if (path) setMessage(`模板已保存 ${path}`); } catch(e) { setError(String(e)); } })()}>保存选中</button>
        <button disabled={!level} onClick={() => void (async () => { try { const result = await window.levelFiles.openTemplate(); if (!result || !level) return;
          const parsed = JSON.parse(result.text); if (parsed.templateVersion !== 1 || !Array.isArray(parsed.objects) || !parsed.objects.length) throw new Error('模板格式不支持');
          const temp = validateLevel({ ...level, objects: parsed.objects }); const copies = duplicate(temp, temp.objects.map(o => o.id));
          const inserted = copies.level.objects.slice(temp.objects.length); edit({ ...level, objects: [...level.objects,...inserted] }); setSelection(copies.ids);
        } catch(e) { setError(String(e)); } })()}>使用模板</button></div>
    </aside>
    <section className="center"><div className="canvas-top">2D Scene Canvas · Unity 世界坐标，Y 向上 · 滚轮缩放 / 中键或 Alt 平移 · Shift 框选多选
      <button onClick={() => setGrid(!grid)}>网格 {grid ? '开' : '关'}</button><button disabled={!selected} onClick={() => focus()}>聚焦选中</button></div>
      <svg ref={canvas} className="canvas" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onCancel} onWheel={wheel} onContextMenu={e => e.preventDefault()}>
        {grid && <g className="grid">{Array.from({length: Math.ceil(size.width/view.zoom)+2},(_,i) => {
          const x = (i-Math.ceil(size.width/view.zoom)/2)*view.zoom + (size.width/2+view.pan.x)%view.zoom;
          return <line key={`x${i}`} x1={x} y1={0} x2={x} y2={size.height}/>; })}
          {Array.from({length: Math.ceil(size.height/view.zoom)+2},(_,i) => {
            const y = (i-Math.ceil(size.height/view.zoom)/2)*view.zoom + (size.height/2+view.pan.y)%view.zoom;
            return <line key={`y${i}`} x1={0} y1={y} x2={size.width} y2={y}/>; })}</g>}
        {ordered.map(o => { const effective = previewLevel ?? level!;
          const effectiveObject = effective.objects.find(x => x.id === o.id)!;
          const pose = worldPose(effective,effectiveObject);
          const corners = colliderWorldCorners(effective,effectiveObject).map(c => worldToScreen(c,view,size.width,size.height));
          const minX=Math.min(...corners.map(c=>c.x)), maxX=Math.max(...corners.map(c=>c.x));
          const minY=Math.min(...corners.map(c=>c.y)), maxY=Math.max(...corners.map(c=>c.y));
          const at = worldToScreen(pose.position,view,size.width,size.height);
          return <g key={o.id} data-object-id={o.id} className={`object ${selection.includes(o.id) ? 'picked' : ''} ${!o.active ? 'inactive' : ''}`}>
            <rect x={minX} y={minY} width={maxX-minX} height={maxY-minY} fill="transparent" stroke="transparent" strokeWidth="12" />
            <polygon points={corners.map(c=>`${c.x},${c.y}`).join(' ')} className={o.kind} />
            <circle cx={at.x} cy={at.y} r="3" /><text x={at.x+8} y={at.y-8}>{o.name}</text>
            {selection.length===1 && selection.includes(o.id) && !isEffectivelyLocked(level!,o.id,locked) && corners.map((c,i) =>
              <rect key={i} data-corner={i} x={c.x-5} y={c.y-5} width="10" height="10" className="handle"/>)}
          </g>;
        })}
        {box && <rect className="selection-box" x={Math.min(box.a.x,box.b.x)} y={Math.min(box.a.y,box.b.y)} width={Math.abs(box.b.x-box.a.x)} height={Math.abs(box.b.y-box.a.y)}/>}
      </svg><div className="canvas-footer">zoom {view.zoom.toFixed(1)} px/unit · {cursorWorld ? `鼠标世界坐标 ${cursorWorld.x.toFixed(2)}, ${cursorWorld.y.toFixed(2)}` : 'Unity 世界坐标'} · 拖动角点修改 Collider size/offset；Transform scale 独立</div>
    </section>
    <aside className="right"><h3>Inspector</h3>{level && selection.length > 1 ? <>
      <div className="id">选中 {selection.length} 个对象 · Mixed 表示值不同 · 位置使用相对位移</div>
      {([{scope:'object',path:'active',label:'启用',type:'boolean'},
        {scope:'object',path:'layer',label:'Layer',type:'integer'},
        {scope:'object',path:'localRotationZ',label:'局部旋转 Z (°)',type:'number'},
        {scope:'object',path:'localScale.x',label:'局部缩放 X',type:'number'},
        {scope:'object',path:'localScale.y',label:'局部缩放 Y',type:'number'}] as const).map(item => {
          const target: FieldTarget = {scope:'object',path:item.path}; const shared=commonValue(level,selection,target);
          return <Field key={item.path} label={item.label} type={item.type} mixed={shared.state==='mixed'}
            value={shared.state==='same' ? shared.value : undefined} onInvalid={setError} onCommit={v=>updateBatch(target,v)}/>;
        })}
      <h4>批量世界坐标偏移 (Unity unit)</h4>
      <Field label="ΔX" type="number" value={offset.x} onInvalid={setError} onCommit={v=>setOffset(o=>({...o,x:v as number}))}/>
      <Field label="ΔY" type="number" value={offset.y} onInvalid={setError} onCommit={v=>setOffset(o=>({...o,y:v as number}))}/>
      <button onClick={applyOffset}>应用偏移 · 一次撤销</button>
      {level.objects.find(o=>o.id===selection[0])?.components.map(c => {
        const sharedEnabled=commonValue(level,selection,{scope:'component',typeId:c.typeId,path:'enabled'});
        if (sharedEnabled.state==='unavailable') return null;
        return <section className="component" key={c.typeId}><h4>{c.typeId} <small>v{c.version} · Unity 已注册</small></h4>
          <Field label="启用" type="boolean" mixed={sharedEnabled.state==='mixed'} value={sharedEnabled.state==='same'?sharedEnabled.value:undefined}
            onCommit={v=>updateBatch({scope:'component',typeId:c.typeId,path:'enabled'},v)}/>
          {(editorFields[c.typeId as keyof typeof editorFields] ?? []).map(([path,label,type]) => {
            const target: FieldTarget={scope:'component',typeId:c.typeId,path}; const shared=commonValue(level,selection,target);
            if(shared.state==='unavailable') return null;
            return <Field key={`${c.typeId}.${path}`} label={label + (path.startsWith('collider.size') || path.startsWith('collider.offset') ? ' (unit)' : path==='airVent.upwardForce' ? ' (力)' : '')} type={type} mixed={shared.state==='mixed'}
              value={shared.state==='same'?shared.value:undefined} onInvalid={setError} onCommit={v=>updateBatch(target,v)}/>;
          })}</section>;
      })}
    </> : selected ? <>
      <div className="id">ID {selected.id}</div><Field key={`${selected.id}.name`} label="名称" type="text" value={selected.name} onInvalid={setError} onCommit={v => updateObject(selected.id,'name',v)} />
      <Field label="启用" type="boolean" value={selected.active} onCommit={v => updateObject(selected.id,'active',v)} />
      <Field label="Layer" type="integer" value={selected.layer} onInvalid={setError} onCommit={v => updateObject(selected.id,'layer',v)} />
      <label className="field"><span>父对象 · 保持世界变换</span><select value={selected.parentId ?? ''} onChange={e => changeParent(selected.id,e.target.value || null)}>
        <option value="">无</option>{level?.objects.filter(o=>o.id!==selected.id).map(o=><option key={o.id} value={o.id}>{o.name} · {o.id.slice(0,8)}</option>)}</select></label>
      <h4>Transform · local</h4>{(['localPosition','localScale'] as const).flatMap(group => (['x','y','z'] as const).map(axis =>
        <Field key={`${selected.id}.${group}.${axis}`} label={`${group === 'localPosition' ? '局部位置 (unit)' : '局部缩放'} ${axis.toUpperCase()}`} type="number" value={selected[group][axis]} onInvalid={setError}
          onCommit={v => updateObject(selected.id,`${group}.${axis}`,v)} />))}
      <Field label="局部旋转 Z (°)" type="number" value={selected.localRotationZ} onInvalid={setError} onCommit={v => updateObject(selected.id,'localRotationZ',v)} />
      {selected.components.map(c => <section className="component" key={c.typeId}><h4>{c.typeId} <small>v{c.version} · Unity 已注册</small></h4>
        <Field label="启用" type="boolean" value={c.enabled} onCommit={v => updateComponent(selected.id,c.typeId,'enabled',v)} />
        {(editorFields[c.typeId as keyof typeof editorFields] ?? []).map(([path,label,type]) => <Field key={`${selected.id}.${c.typeId}.${path}`} label={label + (path.startsWith('collider.size') || path.startsWith('collider.offset') ? ' (unit)' : path==='airVent.upwardForce' ? ' (力)' : '')} type={type}
          value={fieldValue(c,path)} onInvalid={setError} onCommit={v => updateComponent(selected.id,c.typeId,path,v)} />)}</section>)}
    </> : <p className="hint">选择对象后编辑。锁定仅作用于当前编辑会话，Phase 1 Schema 不保存锁定状态。</p>}</aside></main>
    <footer><div className="status"><b>Validation</b>{issues.map((i,n)=><button key={n} className={i.severity} onClick={() => i.objectId && setSelection([i.objectId])}>{i.severity}: {i.message}</button>)}</div>
      <div className="status"><b>文件与状态</b>{error && <span className="error">{error}</span>}<span>{message}</span><span>{file?.path ?? '未命名文件'}</span></div></footer>
  </div>;
}
createRoot(document.getElementById('root')!).render(<App />);
