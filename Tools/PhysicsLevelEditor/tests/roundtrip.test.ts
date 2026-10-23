import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { validateLevel, normalizeLevel } from '../src/model/validate.ts';
import type { LevelDataV1, LevelIdSidecar } from '../src/model/level.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const source = validateLevel(JSON.parse(readFileSync(resolve(root, 'Levels/Physics/Level1.phase1.json'), 'utf8')));
const reexportPath = resolve(root, 'Tools/PhysicsLevelEditor/tests/fixtures/roundtrip.json');
const sidecar = JSON.parse(readFileSync(resolve(root, 'Levels/Physics/Level1.ids.json'), 'utf8')) as LevelIdSidecar;
const clone = (value: LevelDataV1) => structuredClone(value);

test('three real types, partial coverage, stable unique IDs and sidecar', () => {
  assert.equal(source.coverage, 'partial');
  assert.deepEqual(source.objects.map(o => o.kind).sort(), ['airVent', 'platform', 'token']);
  assert.equal(new Set(source.objects.map(o => o.id)).size, 3);
  assert.equal(sidecar.sourceSceneGuid, source.sourceSceneGuid);
  assert.deepEqual(new Set(sidecar.entries.map(e => e.objectId)), new Set(source.objects.map(o => o.id)));
  assert.equal(new Set(sidecar.entries.map(e => e.globalObjectId)).size, 3);
  for (const entry of sidecar.entries)
    assert.match(entry.globalObjectId, new RegExp(`^GlobalObjectId_V1-2-${source.sourceSceneGuid}-[0-9]+-0$`));
});

test('a scene copy has different source identity; names do not participate in the key', () => {
  const renamed = clone(source);
  renamed.objects[0].name = 'Renamed without changing identity';
  assert.equal(renamed.objects[0].id, source.objects[0].id);
  const copiedSceneGuid = '00000000000000000000000000000001';
  assert.ok(sidecar.entries.every(e => !e.globalObjectId.includes(copiedSceneGuid)));
  assert.notEqual(sidecar.sourceSceneGuid, copiedSceneGuid);
});

test('Unity export/import/reexport has equal normalized semantics', { skip: !existsSync(reexportPath) }, () => {
  const reexport = validateLevel(JSON.parse(readFileSync(reexportPath, 'utf8')));
  assert.deepEqual(normalizeLevel(source), normalizeLevel(reexport));
});

test('collider size is independent of transform scale; actual source parameters survive', () => {
  const byKind = Object.fromEntries(source.objects.map(o => [o.kind, o]));
  const platform = byKind.platform;
  const vent = byKind.airVent;
  const token = byKind.token;
  assert.deepEqual(platform.localPosition, {x: -5, y: -3.5, z: 0});
  assert.deepEqual(platform.localScale, {x: 14, y: 1, z: 1});
  assert.deepEqual(platform.components.find(c => c.collider)?.collider?.size, {x: 1, y: 1});
  assert.equal(platform.layer, 8);
  assert.equal(platform.components.find(c => c.collider)?.collider?.isTrigger, false);
  assert.deepEqual(vent.localPosition, {x: 26, y: -2.9, z: 0});
  assert.equal(vent.components.find(c => c.airVent)?.airVent?.upwardForce, 19);
  assert.deepEqual(vent.components.find(c => c.airVent)?.airVent?.ventDirection, {x: 0, y: 1});
  assert.equal(vent.components.find(c => c.collider)?.collider?.isTrigger, true);
  assert.equal(token.components.find(c => c.token)?.token?.scoreAmount, 100);
  assert.equal(token.components.find(c => c.token)?.token?.tokenAmount, 1);
  assert.equal(token.components.find(c => c.collider)?.collider?.isTrigger, true);
  for (const object of source.objects) assert.match(object.components.find(c => c.sprite)!.sprite!.assetGuid, /^[0-9a-f]{32}$/);
});

test('validator rejects duplicate IDs, unknown components, missing references and bad fields', () => {
  const duplicate = clone(source);
  duplicate.objects[1].id = duplicate.objects[0].id;
  assert.throws(() => validateLevel(duplicate), /ID/);
  const unknown = clone(source);
  unknown.objects[0].components[0].typeId = 'unknown.fake';
  assert.throws(() => validateLevel(unknown), /component/);
  const badParent = clone(source);
  badParent.objects[0].parentId = '00000000-0000-0000-0000-000000000000';
  assert.throws(() => validateLevel(badParent), /parent/);
  const badNumber = clone(source);
  badNumber.objects[0].localScale.x = 0;
  assert.throws(() => validateLevel(badNumber), /object fields/);
  const missingSprite = clone(source);
  missingSprite.objects[0].components.find(c => c.sprite)!.sprite!.assetGuid = '';
  assert.throws(() => validateLevel(missingSprite), /sprite/);
});
