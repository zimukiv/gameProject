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

export function worldPose(level: LevelDataV1, object: LevelObject): { position: Vec3; rotationZ: number; scale: Vec3 } {
  if (!object.parentId) return { position: object.localPosition, rotationZ: object.localRotationZ, scale: object.localScale };
  const parent = level.objects.find(o => o.id === object.parentId);
  if (!parent) throw new Error(`找不到父对象 ${object.parentId}`);
  const pose = worldPose(level,parent);
  const angle = pose.rotationZ * Math.PI / 180;
  const x = object.localPosition.x * pose.scale.x, y = object.localPosition.y * pose.scale.y;
  return { position: { x: pose.position.x + x*Math.cos(angle)-y*Math.sin(angle),
    y: pose.position.y + x*Math.sin(angle)+y*Math.cos(angle),
    z: pose.position.z + object.localPosition.z*pose.scale.z },
    rotationZ: pose.rotationZ + object.localRotationZ,
    scale: { x: pose.scale.x*object.localScale.x, y: pose.scale.y*object.localScale.y,
      z: pose.scale.z*object.localScale.z } };
}

export function colliderWorldCorners(level: LevelDataV1, object: LevelObject): Vec2[] {
  const pose = worldPose(level,object);
  return colliderCorners({ ...object, localPosition: pose.position, localRotationZ: pose.rotationZ, localScale: pose.scale });
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
