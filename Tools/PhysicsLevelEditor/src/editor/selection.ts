import type { LevelDataV1, LevelObject, Vec2 } from '../model/level.ts';
import { editorFields } from '../model/registry.ts';
import { validateLevel } from '../model/validate.ts';
import { assertSchema } from './schema.ts';
import { clone, inversePoint, worldMatrix } from './document.ts';

export type SharedValue = { state: 'same'; value: unknown } | { state: 'mixed' } | { state: 'unavailable' };
export type FieldTarget = { scope: 'object'; path: string } | { scope: 'component'; typeId: string; path: string };
const objectFields = new Set(['active', 'layer', 'localRotationZ', 'localScale.x', 'localScale.y', 'localScale.z']);
const get = (root: object, path: string): unknown => path.split('.').reduce<unknown>((value,key) =>
  value && typeof value === 'object' ? (value as Record<string,unknown>)[key] : undefined, root);
function set(root: object, path: string, value: unknown) {
  const keys = path.split('.'); let cursor = root as Record<string,unknown>;
  for (const key of keys.slice(0,-1)) cursor = cursor[key] as Record<string,unknown>;
  cursor[keys.at(-1)!] = value;
}
function selected(level: LevelDataV1, ids: readonly string[]): LevelObject[] {
  if (!ids.length || new Set(ids).size !== ids.length) throw new Error('选择列表为空或含重复 ID');
  return ids.map(id => {
    const object = level.objects.find(o => o.id === id);
    if (!object) throw new Error(`找不到对象 ID：${id}`);
    return object;
  });
}
function field(object: LevelObject, target: FieldTarget): unknown {
  if (target.scope === 'object') {
    if (!objectFields.has(target.path)) return undefined;
    return get(object,target.path);
  }
  const known = editorFields[target.typeId as keyof typeof editorFields];
  if (!known || target.path !== 'enabled' && !known.some(([path]) => path === target.path)) return undefined;
  const component = object.components.find(c => c.typeId === target.typeId);
  return component ? get(component,target.path) : undefined;
}
export function commonValue(level: LevelDataV1, ids: readonly string[], target: FieldTarget): SharedValue {
  const objects = selected(level,ids);
  const values = objects.map(o => field(o,target));
  if (values.some(value => value === undefined)) return { state: 'unavailable' };
  return values.every(value => JSON.stringify(value) === JSON.stringify(values[0]))
    ? { state: 'same', value: values[0] } : { state: 'mixed' };
}
function editable(level: LevelDataV1, ids: readonly string[], locked: readonly string[]): LevelObject[] {
  const objects = selected(level,ids);
  const blocked = objects.find(o => isEffectivelyLocked(level,o.id,locked));
  if (blocked) throw new Error(`对象已锁定：${blocked.name} (${blocked.id})`);
  return objects;
}
export function isEffectivelyLocked(level: LevelDataV1, id: string, locked: readonly string[]): boolean {
  let object=level.objects.find(o=>o.id===id);
  while(object) {
    if (locked.includes(object.id)) return true;
    object=object.parentId ? level.objects.find(o=>o.id===object!.parentId) : undefined;
  }
  return false;
}
export function batchSet(level: LevelDataV1, ids: readonly string[], target: FieldTarget,
  value: unknown, locked: readonly string[] = []): LevelDataV1 {
  editable(level,ids,locked);
  if (commonValue(level,ids,target).state === 'unavailable') throw new Error('所选对象没有共同的已注册字段');
  const next = clone(level);
  for (const o of selected(next,ids)) {
    if (target.scope === 'object') set(o,target.path,value);
    else set(o.components.find(c => c.typeId === target.typeId)!,target.path,value);
  }
  // Validate only after every edit is prepared; failure leaves the input untouched.
  assertSchema(next); validateLevel(next);
  return next;
}
function hasSelectedAncestor(level: LevelDataV1, object: LevelObject, ids: Set<string>): boolean {
  let parent = object.parentId;
  while (parent) {
    if (ids.has(parent)) return true;
    parent = level.objects.find(o => o.id === parent)?.parentId ?? null;
  }
  return false;
}
export function movableRoots(level: LevelDataV1, ids: readonly string[]): LevelObject[] {
  const all = selected(level,ids); const set = new Set(ids);
  return all.filter(o => !hasSelectedAncestor(level,o,set));
}
export function translateWorld(level: LevelDataV1, ids: readonly string[], delta: Vec2,
  locked: readonly string[] = []): LevelDataV1 {
  const all = editable(level,ids,locked);
  if (!Number.isFinite(delta.x) || !Number.isFinite(delta.y)) throw new Error('位移必须是有限数字');
  const roots = movableRoots(level,all.map(o => o.id));
  const next = clone(level);
  for (const object of roots) {
    const updated = next.objects.find(o => o.id === object.id)!;
    if (!object.parentId) { updated.localPosition.x += delta.x; updated.localPosition.y += delta.y; continue; }
    const parent = level.objects.find(o => o.id === object.parentId)!;
    const matrix=worldMatrix(level,parent);
    const from=inversePoint(matrix,{x:0,y:0});
    const to=inversePoint(matrix,delta);
    updated.localPosition.x += to.x-from.x;
    updated.localPosition.y += to.y-from.y;
  }
  assertSchema(next); validateLevel(next);
  return next;
}
