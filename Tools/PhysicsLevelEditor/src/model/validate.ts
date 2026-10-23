import type { LevelDataV1, LevelObject, LevelComponent } from './level.ts';
import { kindComponent, registry } from './registry.ts';

const fail = (message: string): never => { throw new Error(message); };
const record = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const vec2 = (x: unknown): boolean => record(x) && num(x.x) && num(x.y);
const vec3 = (x: unknown): boolean => vec2(x) && record(x) && num(x.z);
const uuid = (x: unknown): boolean => typeof x === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);

export function validateLevel(input: unknown): LevelDataV1 {
  if (!record(input) || input.formatVersion !== 1 || input.coverage !== 'partial' ||
      typeof input.levelId !== 'string' || !input.levelId || typeof input.sourceSceneGuid !== 'string' ||
      !Array.isArray(input.objects) || input.objects.length === 0) fail('Invalid level header');
  const level = input as LevelDataV1;
  const ids = new Set<string>();
  for (const object of level.objects) {
    if (!record(object) || !uuid(object.id) || ids.has(object.id)) fail('Invalid or duplicate object ID');
    ids.add(object.id);
    if (typeof object.name !== 'string' || !object.name || !Object.hasOwn(kindComponent, object.kind) ||
        typeof object.active !== 'boolean' || !Number.isInteger(object.layer) || object.layer < 0 || object.layer > 31 ||
        !vec3(object.localPosition) || !vec3(object.localScale) || !num(object.localRotationZ) ||
        object.localScale.x === 0 || object.localScale.y === 0 || !Array.isArray(object.components))
      fail(`Invalid object fields: ${object.id}`);
    const expected = kindComponent[object.kind as keyof typeof kindComponent];
    const seen = new Set<string>();
    for (const c of object.components) {
      if (!record(c) || !Object.hasOwn(registry, c.typeId) || c.version !== 1 ||
          typeof c.enabled !== 'boolean' || seen.has(c.typeId)) fail(`Invalid component: ${object.id}`);
      seen.add(c.typeId);
      if (c.typeId === 'visual.sprite' && (!record(c.sprite) ||
          typeof c.sprite.assetGuid !== 'string' || !/^[0-9a-f]{32}$/i.test(c.sprite.assetGuid) ||
          typeof c.sprite.localFileId !== 'string' || !/^[1-9][0-9]*$/.test(c.sprite.localFileId) ||
          !record(c.sprite.color) ||
          !['r','g','b','a'].every(k => num((c.sprite!.color as unknown as Record<string, unknown>)[k])) ||
          !Number.isInteger(c.sprite.sortingOrder))) fail(`Invalid sprite: ${object.id}`);
      if (c.typeId === 'physics.boxCollider2d' && (!record(c.collider) || !vec2(c.collider.size) ||
          !vec2(c.collider.offset) || c.collider.size.x <= 0 || c.collider.size.y <= 0 ||
          typeof c.collider.isTrigger !== 'boolean')) fail(`Invalid collider: ${object.id}`);
      if (c.typeId === 'physics.airVent' && (!record(c.airVent) || !vec2(c.airVent.ventDirection) ||
          (c.airVent.ventDirection.x === 0 && c.airVent.ventDirection.y === 0) ||
          !num(c.airVent.upwardForce) || c.airVent.upwardForce <= 0 ||
          typeof c.airVent.isInteractable !== 'boolean' || typeof c.airVent.guideText !== 'string' ||
          typeof c.airVent.isContinuous !== 'boolean')) fail(`Invalid vent: ${object.id}`);
      if (c.typeId === 'item.token' && (!record(c.token) || !Number.isInteger(c.token.scoreAmount) ||
          !Number.isInteger(c.token.tokenAmount) || c.token.scoreAmount < 0 || c.token.tokenAmount < 0))
        fail(`Invalid token: ${object.id}`);
    }
    if (seen.size !== 3 || !seen.has('visual.sprite') || !seen.has('physics.boxCollider2d') || !seen.has(expected))
      fail(`Missing or extra component: ${object.id}`);
    const collider = object.components.find(c => c.typeId === 'physics.boxCollider2d')!.collider!;
    if (collider.isTrigger === (object.kind === 'platform') || (object.kind === 'platform' && object.layer !== 8))
      fail(`Invalid collider role or Ground layer: ${object.id}`);
  }
  const byId = new Map(level.objects.map(o => [o.id, o]));
  for (const object of level.objects) {
    const visited = new Set<string>();
    let current: LevelObject | undefined = object;
    while (current?.parentId) {
      if (visited.has(current.id) || !byId.has(current.parentId)) fail(`Invalid parent chain: ${object.id}`);
      visited.add(current.id);
      current = byId.get(current.parentId);
    }
  }
  return level;
}

const round = (n: number) => Math.round(n * 100000) / 100000;
function normalizedComponent(c: LevelComponent) {
  return {
    typeId: c.typeId, version: c.version, enabled: c.enabled,
    sprite: c.sprite && { ...c.sprite, color: Object.fromEntries(Object.entries(c.sprite.color).map(([k,v]) => [k, round(v)])) },
    collider: c.collider && { ...c.collider, size: {x: round(c.collider.size.x), y: round(c.collider.size.y)},
      offset: {x: round(c.collider.offset.x), y: round(c.collider.offset.y)} },
    airVent: c.airVent && { ...c.airVent, ventDirection: {x: round(c.airVent.ventDirection.x), y: round(c.airVent.ventDirection.y)},
      upwardForce: round(c.airVent.upwardForce) },
    token: c.token,
  };
}

// Quantization at 1e-5 Unity units keeps JSON formatting and float32 noise out of comparisons.
export function normalizeLevel(level: LevelDataV1) {
  return level.objects.map(o => ({
    id: o.id, kind: o.kind, parentId: o.parentId ?? null, active: o.active, layer: o.layer,
    localPosition: {x: round(o.localPosition.x), y: round(o.localPosition.y), z: round(o.localPosition.z)},
    localRotationZ: round(o.localRotationZ),
    localScale: {x: round(o.localScale.x), y: round(o.localScale.y), z: round(o.localScale.z)},
    components: o.components.map(normalizedComponent).sort((a,b) => a.typeId.localeCompare(b.typeId)),
  })).sort((a,b) => a.id.localeCompare(b.id));
}
