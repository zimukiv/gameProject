import type { LevelDataV1, LevelObject, LevelComponent, Vec2, Vec3 } from '../model/level.ts';
import { validateLevel } from '../model/validate.ts';
import { assertSchema, schemaErrors } from './schema.ts';

export type Kind = LevelObject['kind'];
export type Issue = { severity: 'error' | 'warning'; message: string; objectId?: string; component?: string };
export const clone = <T>(value: T): T => structuredClone(value);
export const serialized = (level: LevelDataV1) => JSON.stringify(level, null, 2) + '\n';
export const newId = () => crypto.randomUUID();

// Phase 1 supports one fixed Unity-backed component combination per kind.
export function createObject(kind: Kind, source: LevelObject): LevelObject {
  const object = clone(source);
  object.id = newId();
  object.name = `${kind} copy`;
  object.parentId = null;
  object.localPosition.x += 1;
  return object;
}

export function duplicate(level: LevelDataV1, ids: string[]): { level: LevelDataV1; ids: string[] } {
  const selected = level.objects.filter(o => ids.includes(o.id));
  const mapping = new Map(selected.map(o => [o.id, newId()]));
  const copies = selected.map(o => {
    const copy = clone(o);
    copy.id = mapping.get(o.id)!;
    copy.name = `${o.name} copy`;
    copy.parentId = o.parentId && mapping.has(o.parentId) ? mapping.get(o.parentId)! : o.parentId;
    copy.localPosition.x += 1;
    return copy;
  });
  return { level: { ...level, objects: [...level.objects, ...copies] }, ids: copies.map(o => o.id) };
}

export function deleteObjects(level: LevelDataV1, ids: string[]): LevelDataV1 {
  const removed = new Set(ids);
  if (level.objects.some(o => o.parentId && removed.has(o.parentId) && !removed.has(o.id)))
    throw new Error('删除父对象前请一并选择其子对象');
  const objects = level.objects.filter(o => !removed.has(o.id));
  if (!objects.length) throw new Error('Phase 1 格式要求至少一个对象');
  return { ...level, objects };
}

export function setObject(level: LevelDataV1, id: string, edit: (object: LevelObject) => void): LevelDataV1 {
  const next = clone(level);
  const object = next.objects.find(o => o.id === id);
  if (!object) throw new Error(`找不到对象 ${id}`);
  edit(object);
  assertSchema(next);
  validateLevel(next);
  return next;
}

export function setComponent(level: LevelDataV1, id: string, typeId: string, edit: (component: LevelComponent) => void) {
  return setObject(level, id, o => {
    const component = o.components.find(c => c.typeId === typeId);
    if (!component) throw new Error(`找不到组件 ${typeId}`);
    edit(component);
  });
}

export function moveObjects(level: LevelDataV1, positions: Map<string, Vec3>): LevelDataV1 {
  const next = clone(level);
  next.objects.forEach(o => { const p = positions.get(o.id); if (p) o.localPosition = clone(p); });
  assertSchema(next);
  validateLevel(next);
  return next;
}

export function groupObjects(level: LevelDataV1, ids: string[]): LevelDataV1 {
  if (ids.length < 2) throw new Error('请至少选择两个对象');
  const chosen = ids.map(id => level.objects.find(o => o.id === id));
  if (chosen.some(o => !o || o.parentId || o.localRotationZ !== 0))
    throw new Error('Phase 2 分组仅支持未旋转的根对象；请先取消父级或旋转');
  const parent = chosen[0]!;
  if (parent.localScale.z === 0) throw new Error('父对象 Z 缩放为零，不能保持子对象位置');
  const next = clone(level);
  for (const id of ids.slice(1)) {
    const child = next.objects.find(o => o.id === id)!;
    child.parentId = parent.id;
    child.localPosition = {
      x: (child.localPosition.x-parent.localPosition.x)/parent.localScale.x,
      y: (child.localPosition.y-parent.localPosition.y)/parent.localScale.y,
      z: (child.localPosition.z-parent.localPosition.z)/parent.localScale.z
    };
    child.localScale = { x: child.localScale.x/parent.localScale.x,
      y: child.localScale.y/parent.localScale.y, z: child.localScale.z/parent.localScale.z };
  }
  validateLevel(next);
  return next;
}

export type Matrix2D = { a: number; b: number; c: number; d: number; x: number; y: number };
const identity: Matrix2D = {a:1,b:0,c:0,d:1,x:0,y:0};
export function multiply(left: Matrix2D, right: Matrix2D): Matrix2D {
  return { a:left.a*right.a+left.c*right.b, b:left.b*right.a+left.d*right.b,
    c:left.a*right.c+left.c*right.d, d:left.b*right.c+left.d*right.d,
    x:left.a*right.x+left.c*right.y+left.x, y:left.b*right.x+left.d*right.y+left.y };
}
export function transformPoint(matrix: Matrix2D, point: Vec2): Vec2 {
  return {x:matrix.a*point.x+matrix.c*point.y+matrix.x,
    y:matrix.b*point.x+matrix.d*point.y+matrix.y};
}
export function inversePoint(matrix: Matrix2D, point: Vec2): Vec2 {
  const det=matrix.a*matrix.d-matrix.b*matrix.c;
  if (Math.abs(det)<1e-9) throw new Error('父子变换矩阵不可逆；缩放接近零');
  const x=point.x-matrix.x, y=point.y-matrix.y;
  return {x:(matrix.d*x-matrix.c*y)/det, y:(-matrix.b*x+matrix.a*y)/det};
}
export function inverseMatrix(matrix: Matrix2D): Matrix2D {
  const det=matrix.a*matrix.d-matrix.b*matrix.c;
  if (Math.abs(det)<1e-9) throw new Error('父子变换矩阵不可逆；缩放接近零');
  return {a:matrix.d/det,b:-matrix.b/det,c:-matrix.c/det,d:matrix.a/det,
    x:(matrix.c*matrix.y-matrix.d*matrix.x)/det,
    y:(matrix.b*matrix.x-matrix.a*matrix.y)/det};
}
export function worldMatrix(level: LevelDataV1, object: LevelObject): Matrix2D {
  const angle=object.localRotationZ*Math.PI/180, co=Math.cos(angle), si=Math.sin(angle);
  const local: Matrix2D={a:co*object.localScale.x,b:si*object.localScale.x,
    c:-si*object.localScale.y,d:co*object.localScale.y,
    x:object.localPosition.x,y:object.localPosition.y};
  if (!object.parentId) return local;
  const parent=level.objects.find(o=>o.id===object.parentId);
  if (!parent) throw new Error(`找不到父对象 ${object.parentId}`);
  return multiply(worldMatrix(level,parent),local);
}
export function worldPose(level: LevelDataV1, object: LevelObject): { position: Vec3; rotationZ: number; scale: Vec3 } {
  const m=worldMatrix(level,object);
  let ancestor=object.parentId ? level.objects.find(o=>o.id===object.parentId) : undefined;
  let z=object.localPosition.z, zScale=object.localScale.z;
  while (ancestor) { z=ancestor.localPosition.z+z*ancestor.localScale.z; zScale*=ancestor.localScale.z;
    ancestor=ancestor.parentId ? level.objects.find(o=>o.id===ancestor!.parentId) : undefined; }
  return {position:{x:m.x,y:m.y,z},rotationZ:Math.atan2(m.b,m.a)*180/Math.PI,
    scale:{x:Math.hypot(m.a,m.b),y:Math.hypot(m.c,m.d),z:zScale}};
}
export function colliderWorldCorners(level: LevelDataV1, object: LevelObject): Vec2[] {
  const c=object.components.find(c=>c.typeId==='physics.boxCollider2d')?.collider;
  if (!c) return [];
  const m=worldMatrix(level,object);
  return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([sx,sy]) => transformPoint(m,
    {x:c.offset.x+sx*c.size.x/2,y:c.offset.y+sy*c.size.y/2}));
}
export function resizeColliderFromWorld(level: LevelDataV1, id: string, corner: number, target: Vec2): LevelDataV1 {
  if (!Number.isInteger(corner) || corner<0 || corner>3) throw new Error('Collider 控制点无效');
  const source=level.objects.find(o=>o.id===id);
  if (!source) throw new Error(`找不到对象 ${id}`);
  const c=source.components.find(c=>c.typeId==='physics.boxCollider2d')?.collider;
  if (!c) throw new Error('对象没有 BoxCollider2D');
  const opposite=[2,3,0,1][corner];
  const corners=[[-1,-1],[1,-1],[1,1],[-1,1]];
  const [sx,sy]=corners[opposite];
  const fixed={x:c.offset.x+sx*c.size.x/2,y:c.offset.y+sy*c.size.y/2};
  const moving=inversePoint(worldMatrix(level,source),target);
  const next=clone(level);
  const collider=next.objects.find(o=>o.id===id)!.components.find(c=>c.typeId==='physics.boxCollider2d')!.collider!;
  collider.size={x:Math.abs(moving.x-fixed.x),y:Math.abs(moving.y-fixed.y)};
  collider.offset={x:(moving.x+fixed.x)/2,y:(moving.y+fixed.y)/2};
  if(collider.size.x<0.05 || collider.size.y<0.05) throw new Error('Collider 每个轴至少需要 0.05 单位');
  assertSchema(next); validateLevel(next);
  return next;
}
export function reparentObject(level: LevelDataV1, id: string, parentId: string | null): LevelDataV1 {
  const object=level.objects.find(o=>o.id===id);
  if (!object) throw new Error(`找不到对象 ${id}`);
  if (parentId===object.parentId) return level;
  if (parentId===id) throw new Error('对象不能成为自己的父级');
  const parent=parentId ? level.objects.find(o=>o.id===parentId) : null;
  if (parentId && !parent) throw new Error(`找不到父对象 ${parentId}`);
  let cursor=parent;
  while(cursor) {
    if(cursor.id===id) throw new Error('父子关系会形成循环引用');
    cursor=cursor.parentId ? level.objects.find(o=>o.id===cursor!.parentId) : null;
  }
  const world=worldMatrix(level,object);
  const base=parent ? worldMatrix(level,parent) : identity;
  const local=multiply(inverseMatrix(base),world);
  const sx=Math.hypot(local.a,local.b);
  const determinant=local.a*local.d-local.b*local.c;
  if(sx<1e-9 || Math.abs(determinant)<1e-9) throw new Error('目标层级存在不可逆缩放');
  const sy=determinant/sx, angle=Math.atan2(local.b,local.a);
  const expected={a:Math.cos(angle)*sx,b:Math.sin(angle)*sx,c:-Math.sin(angle)*sy,d:Math.cos(angle)*sy};
  if (Math.max(Math.abs(local.a-expected.a),Math.abs(local.b-expected.b),
    Math.abs(local.c-expected.c),Math.abs(local.d-expected.d))>1e-7)
    throw new Error('改父级将产生剪切变换；当前 LevelDataV1 无法无损表示，已拒绝');
  const before=worldPose(level,object);
  const parentPose=parent ? worldPose(level,parent) : null;
  if(parentPose && Math.abs(parentPose.scale.z)<1e-9) throw new Error('父对象 Z 缩放不可逆');
  const next=clone(level); const updated=next.objects.find(o=>o.id===id)!;
  updated.parentId=parentId;
  updated.localPosition={x:local.x,y:local.y,
    z:parentPose ? (before.position.z-parentPose.position.z)/parentPose.scale.z : before.position.z};
  updated.localRotationZ=angle*180/Math.PI;
  updated.localScale={x:sx,y:sy,z:parentPose ? before.scale.z/parentPose.scale.z : before.scale.z};
  assertSchema(next); validateLevel(next);
  return next;
}

export function validateDocument(level: LevelDataV1): Issue[] {
  const issues: Issue[] = [{ severity: 'warning', message: 'partial coverage：此文件只包含已导出的对象，不代表完整 Level1。' }];
  for (const message of schemaErrors(level)) issues.unshift({ severity: 'error', message });
  try { validateLevel(level); } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    issues.unshift({ severity: 'error', message, objectId: level.objects.find(o => message.includes(o.id))?.id });
  }
  return issues;
}

export type History = { states: LevelDataV1[]; index: number; saved: string };
export function history(level: LevelDataV1): History { return { states: [clone(level)], index: 0, saved: serialized(level) }; }
export const current = (h: History) => h.states[h.index];
export const dirty = (h: History) => serialized(current(h)) !== h.saved;
export function commit(h: History, next: LevelDataV1): History {
  assertSchema(next);
  validateLevel(next);
  if (serialized(current(h)) === serialized(next)) return h;
  return { ...h, states: [...h.states.slice(0, h.index + 1), clone(next)], index: h.index + 1 };
}
export function replaceCurrent(h: History, next: LevelDataV1): History {
  assertSchema(next);
  validateLevel(next);
  const states = h.states.slice(); states[h.index] = clone(next);
  return { ...h, states };
}
export const undo = (h: History): History => ({ ...h, index: Math.max(0, h.index - 1) });
export const redo = (h: History): History => ({ ...h, index: Math.min(h.states.length - 1, h.index + 1) });
export const markSaved = (h: History): History => ({ ...h, saved: serialized(current(h)) });

export type View = { zoom: number; pan: Vec2 };
export function worldToScreen(p: Vec2, v: View, width: number, height: number): Vec2 {
  return { x: width / 2 + v.pan.x + p.x * v.zoom, y: height / 2 + v.pan.y - p.y * v.zoom };
}
export function screenToWorld(p: Vec2, v: View, width: number, height: number): Vec2 {
  return { x: (p.x - width / 2 - v.pan.x) / v.zoom, y: -(p.y - height / 2 - v.pan.y) / v.zoom };
}
export const snap = (n: number, step = 0.5) => Math.round(n / step) * step;
export function colliderCorners(o: LevelObject): Vec2[] {
  const c = o.components.find(c => c.typeId === 'physics.boxCollider2d')?.collider;
  if (!c) return [];
  const sx = o.localScale.x, sy = o.localScale.y;
  const angle = o.localRotationZ * Math.PI / 180;
  const co = Math.cos(angle), si = Math.sin(angle);
  return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y]) => {
    const lx = (c.offset.x + x * c.size.x / 2) * sx;
    const ly = (c.offset.y + y * c.size.y / 2) * sy;
    return { x: o.localPosition.x + lx * co - ly * si, y: o.localPosition.y + lx * si + ly * co };
  });
}
