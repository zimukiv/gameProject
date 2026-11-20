'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/project/model.cjs');
const Clip = require('../src/project/clipboard-selection.cjs');

function room() {
  const r = M.room('room-test', '测试房间', 20, 12);
  r.tiles = [];
  r.objects = [];
  r.movables = [];
  r.zones = [];
  return r;
}
const object = (id, type, x, y, extra = {}) => ({ id, type, x, y, params: {}, ...extra });
const movable = (id, x, y, extra = {}) => ({ id, type: 'physics.brick', x, y, ...extra });

test('capture keeps relative positions and paste remaps IDs without touching the source', () => {
  const r = room();
  const pad = object('pad-1', 'calculus.integral', 4, 4);
  const brick = movable('brick-1', 6, 5);
  r.objects.push(pad);
  r.movables.push(brick);
  r.tiles.push({ x: 3, y: 6 });
  const clip = Clip.capture(r, [
    { kind: 'objects', id: 'pad-1' },
    { kind: 'movables', id: 'brick-1' },
    { kind: 'tiles', x: 3, y: 6 },
  ]);
  assert.equal(clip.origin.x, 3);
  assert.equal(clip.origin.y, 4);
  assert.equal(clip.items.length, 3);
  const result = Clip.paste(r, clip, { offsetX: 2, offsetY: 1 });
  assert.equal(result.count, 3);
  const pastedPad = r.objects.find((o) => o.id !== 'pad-1'),
    pastedBrick = r.movables.find((o) => o.id !== 'brick-1');
  assert.ok(pastedPad && pastedBrick);
  assert.notEqual(pastedPad.id, 'pad-1');
  // Relative offset between the two objects is preserved.
  assert.equal(pastedPad.x - pad.x, 2);
  assert.equal(pastedPad.y - pad.y, 1);
  assert.equal(pastedBrick.x - brick.x, 2);
  assert.equal(pastedBrick.y - brick.y, 1);
  // Source objects are unchanged and the terrain copy landed on a free cell.
  assert.equal(pad.x, 4);
  assert.equal(brick.x, 6);
  assert.ok(r.tiles.some((t) => t.x === 5 && t.y === 7));
});

test('internal pad binding is remapped, external bindings are dropped', () => {
  const r = room();
  r.objects.push(object('pad-1', 'calculus.integral', 4, 4));
  r.movables.push(movable('brick-1', 6, 5, { padId: 'pad-1' }));
  r.movables.push(movable('brick-2', 7, 5, { padId: 'pad-outside' }));
  const clip = Clip.capture(r, [
    { kind: 'objects', id: 'pad-1' },
    { kind: 'movables', id: 'brick-1' },
    { kind: 'movables', id: 'brick-2' },
  ]);
  Clip.paste(r, clip, { offsetX: 1, offsetY: 1 });
  const pastedPad = r.objects.find((o) => o.id !== 'pad-1'),
    pasted = r.movables.slice(2);
  assert.equal(pasted.length, 2);
  const bound = pasted.find((b) => b.padId === pastedPad.id),
    loose = pasted.find((b) => b !== bound);
  // The copied brick whose pad was inside the selection points at the new pad.
  assert.ok(bound, 'internal pad reference must resolve to the pasted pad');
  // A pad outside the selection must never be re-used by the copy.
  assert.equal(loose.padId, '');
});

test('block/brick groups travel together only when fully selected', () => {
  const r = room();
  r.movables.push(movable('brick-a', 2, 2, { brickGroup: 'g1', assemblyId: 'a1' }));
  r.movables.push(movable('brick-b', 3, 2, { brickGroup: 'g1', assemblyId: 'a1' }));
  r.movables.push(movable('brick-c', 4, 2, { brickGroup: 'g2' }));
  r.movables.push(movable('brick-d', 5, 2, { brickGroup: 'g2' }));
  const whole = Clip.capture(r, [
    { kind: 'movables', id: 'brick-a' },
    { kind: 'movables', id: 'brick-b' },
  ]);
  Clip.paste(r, whole, { offsetX: 1, offsetY: 1 });
  const copied = r.movables.slice(4);
  assert.equal(copied.length, 2);
  assert.equal(copied[0].assemblyId, copied[1].assemblyId);
  assert.notEqual(copied[0].assemblyId, 'a1');
  assert.equal(copied[0].brickGroup, copied[1].brickGroup);
  assert.notEqual(copied[0].brickGroup, 'g1');

  const partial = Clip.capture(r, [{ kind: 'movables', id: 'brick-c' }]);
  Clip.paste(r, partial, { offsetX: 0, offsetY: 1 });
  const single = r.movables.at(-1);
  assert.equal(single.brickGroup, undefined);
});

test('zone links are remapped internally and deleted when external', () => {
  const r = room();
  r.zones.push({ id: 'zone-1', name: '热区', x: 2, y: 2, w: 3, h: 3, initial: 'hot' });
  r.objects.push(object('pedestal', 'physics.pedestal', 5, 5, { params: { zoneId: 'zone-1' } }));
  r.objects.push(object('pedestal-2', 'physics.pedestal', 6, 5, { params: { zoneId: 'zone-x' } }));
  const clip = Clip.capture(r, [
    { kind: 'zones', id: 'zone-1' },
    { kind: 'objects', id: 'pedestal' },
    { kind: 'objects', id: 'pedestal-2' },
  ]);
  Clip.paste(r, clip, { offsetX: 1, offsetY: 1 });
  const zone = r.zones.find((z) => z.id !== 'zone-1'),
    linked = r.objects.find((o) => o.params?.zoneId === zone.id),
    dropped = r.objects.find(
      (o) => o.id !== 'pedestal' && o.id !== 'pedestal-2' && !o.params?.zoneId,
    );
  assert.ok(linked, 'internal zone link must point at the pasted zone');
  assert.ok(dropped, 'external zone link must be removed');
});

test('out-of-bounds paste is rejected before any mutation', () => {
  const r = room();
  r.objects.push(object('edge', 'common.checkpoint', 19, 11));
  const clip = Clip.capture(r, [{ kind: 'objects', id: 'edge' }]);
  const before = JSON.stringify(r);
  assert.throws(() => Clip.paste(r, clip, { offsetX: 1, offsetY: 0 }), /边界/);
  assert.equal(JSON.stringify(r), before);
});

test('terrain merging does not duplicate an occupied cell', () => {
  const r = room();
  r.tiles.push({ x: 2, y: 2 }, { x: 3, y: 3 });
  const clip = Clip.capture(r, [{ kind: 'tiles', x: 2, y: 2 }]);
  const result = Clip.paste(r, clip, { offsetX: 1, offsetY: 1 });
  assert.equal(r.tiles.length, 2);
  assert.deepEqual(result.refs, [{ kind: 'tiles', x: 3, y: 3 }]);
});

test('rail paths move with their owner and get fresh node IDs', () => {
  const r = room();
  r.objects.push(
    object('rail', 'physics.rail', 3, 3, {
      params: { path: [{ id: 'node-1', parentId: 'rail', x: 3, y: 3 }] },
    }),
  );
  const clip = Clip.capture(r, [{ kind: 'objects', id: 'rail' }]);
  Clip.paste(r, clip, { offsetX: 2, offsetY: 1 });
  const copy = r.objects.find((o) => o.id !== 'rail'),
    node = copy.params.path[0];
  assert.equal(node.x, 5);
  assert.equal(node.y, 4);
  assert.equal(node.parentId, copy.id);
  assert.notEqual(node.id, 'node-1');
});

test('an empty or unsupported selection is an explicit error', () => {
  const r = room();
  assert.throws(() => Clip.capture(r, []), /请先框选/);
  assert.throws(() => Clip.capture(r, [{ kind: 'not-a-kind', id: 'x' }]), /请先框选/);
});

test('mixed assembly (movable + spike + tile) copies as one fresh group', () => {
  const Groups = require('../src/project/block-groups.cjs');
  const r = room();
  const brick = movable('brick-1', 4, 4, { targetX: 8, targetY: 4, collision: true }),
    spike = object('spike-1', 'common.spike', 5, 4),
    tile = { x: 3, y: 4 };
  r.movables.push(brick);
  r.objects.push(spike);
  r.tiles.push(tile);
  // Real assembly tool, not hand-written group fields.
  Groups.create(r, [
    { kind: 'movables', id: 'brick-1' },
    { kind: 'objects', id: 'spike-1' },
    { kind: 'tiles', x: 3, y: 4 },
  ]);
  const assembly = brick.assemblyId;
  assert.ok(assembly, 'assembly created');
  assert.equal(spike.assemblyId, assembly);
  assert.equal(tile.assemblyId, assembly);
  assert.equal(spike.attachmentTo, 'brick-1');
  assert.equal(tile.attachmentTo, 'brick-1');

  const clip = Clip.capture(r, [
    { kind: 'movables', id: 'brick-1' },
    { kind: 'objects', id: 'spike-1' },
    { kind: 'tiles', x: 3, y: 4 },
  ]);
  const result = Clip.paste(r, clip, { offsetX: 2, offsetY: 2 });
  assert.equal(result.count, 3);
  const pastedBrick = r.movables.find((b) => b.id !== 'brick-1'),
    pastedSpike = r.objects.find((o) => o.id !== 'spike-1'),
    pastedTile = r.tiles.find((t) => t.x === 5 && t.y === 6);
  assert.ok(pastedBrick && pastedSpike && pastedTile, 'all three members were pasted');
  const copyAssembly = pastedBrick.assemblyId;
  assert.ok(copyAssembly && copyAssembly !== assembly, 'a fresh assembly ID is allocated');
  assert.equal(pastedSpike.assemblyId, copyAssembly);
  assert.equal(pastedTile.assemblyId, copyAssembly, 'terrain keeps its remapped assembly');
  assert.equal(pastedBrick.brickGroup, copyAssembly, 'brick group follows the assembly');
  // attachmentTo points at the pasted centre, never at the original mechanism.
  assert.equal(pastedSpike.attachmentTo, pastedBrick.id);
  assert.equal(pastedTile.attachmentTo, pastedBrick.id);
  // The source assembly is untouched.
  assert.equal(brick.assemblyId, assembly);
  assert.equal(spike.attachmentTo, 'brick-1');
  assert.equal(tile.assemblyId, assembly);
  assert.equal(brick.brickGroup, assembly);

  // Partial selection: the spike travels alone and every external relation drops.
  const partial = Clip.capture(r, [{ kind: 'objects', id: 'spike-1' }]);
  Clip.paste(r, partial, { offsetX: 0, offsetY: 2 });
  const lone = r.objects.filter((o) => o.type === 'common.spike').at(-1);
  assert.notEqual(lone.id, 'spike-1');
  assert.equal(lone.assemblyId, undefined, 'external assembly membership is dropped');
  assert.equal(lone.attachmentTo, undefined, 'external attachment is dropped');
});

test('native platforms/patrols/signs copy into nativeCampaign with fresh IDs', () => {
  const Native = require('../src/project/native-compat.cjs');
  const r = room();
  Native.initRoom(r);
  r.nativeCampaign.platforms.push({ id: 'platform-1', x: 2, y: 2, w: 2, h: 1, toX: 5, toY: 2 });
  r.nativeCampaign.patrols.push({
    id: 'patrol-1',
    speed: 95,
    nodes: [
      { x: 4.5, y: 3.5 },
      { x: 6.5, y: 3.5 },
    ],
  });
  r.nativeCampaign.signs.push({ x: 8, y: 6, text: '标记' });
  const clip = Clip.capture(r, [
    { kind: 'platforms', id: 'platform-1' },
    { kind: 'patrols', id: 'patrol-1' },
    { kind: 'signs', id: '@0' },
  ]);
  assert.equal(clip.items.length, 3, 'every native kind is captured, none silently dropped');
  const result = Clip.paste(r, clip, { offsetX: 1, offsetY: 1 });
  assert.equal(result.count, 3);
  assert.equal(r.platforms, undefined, 'native items never land in a top-level room.platforms');

  const platform = r.nativeCampaign.platforms.at(-1);
  assert.notEqual(platform.id, 'platform-1');
  assert.deepEqual([platform.x, platform.y, platform.toX, platform.toY], [3, 3, 6, 3]);
  const patrol = r.nativeCampaign.patrols.at(-1);
  assert.notEqual(patrol.id, 'patrol-1');
  assert.deepEqual(patrol.nodes, [
    { x: 5.5, y: 4.5 },
    { x: 7.5, y: 4.5 },
  ]);
  const sign = r.nativeCampaign.signs.at(-1);
  assert.ok(sign.id && sign.id !== '@0', 'a sign without a source ID gets one on paste');
  assert.deepEqual([sign.x, sign.y], [9, 7]);
  assert.equal(r.nativeCampaign.signs.length, 2);
  assert.deepEqual(
    result.refs.find((ref) => ref.kind === 'platforms'),
    { kind: 'platforms', id: platform.id },
    'the returned refs select the freshly pasted native object',
  );

  // A second paste allocates independent IDs again and leaves the source alone.
  const again = Clip.paste(r, clip, { offsetX: 2, offsetY: 0 });
  const second = r.nativeCampaign.platforms.at(-1);
  assert.notEqual(second.id, platform.id);
  assert.notEqual(second.id, 'platform-1');
  assert.equal(again.count, 3);
  assert.equal(r.nativeCampaign.platforms[0].id, 'platform-1');
});

test('a native platform inside a full assembly follows the group; partial copy drops it', () => {
  const Native = require('../src/project/native-compat.cjs');
  const Groups = require('../src/project/block-groups.cjs');
  const r = room();
  Native.initRoom(r);
  r.movables.push(movable('brick-1', 4, 4, { targetX: 8, targetY: 4 }));
  r.nativeCampaign.platforms.push({ id: 'platform-1', x: 5, y: 4, w: 1, h: 1 });
  Groups.create(r, [
    { kind: 'movables', id: 'brick-1' },
    { kind: 'platforms', id: 'platform-1' },
  ]);
  const assembly = r.movables[0].assemblyId;
  assert.ok(assembly);
  assert.equal(r.nativeCampaign.platforms[0].assemblyId, assembly);
  assert.equal(r.nativeCampaign.platforms[0].attachmentTo, 'brick-1');

  const clip = Clip.capture(r, [
    { kind: 'movables', id: 'brick-1' },
    { kind: 'platforms', id: 'platform-1' },
  ]);
  Clip.paste(r, clip, { offsetX: 1, offsetY: 1 });
  const brick = r.movables.find((b) => b.id !== 'brick-1'),
    platform = r.nativeCampaign.platforms.find((p) => p.id !== 'platform-1');
  assert.ok(brick && platform);
  assert.notEqual(brick.assemblyId, assembly);
  assert.equal(platform.assemblyId, brick.assemblyId, 'native platform keeps the new assembly');
  assert.equal(platform.attachmentTo, brick.id, 'attachment points at the copied centre');

  // Partial selection: an external assembly/attachment must not survive.
  const partial = Clip.capture(r, [{ kind: 'platforms', id: 'platform-1' }]);
  Clip.paste(r, partial, { offsetX: 0, offsetY: 2 });
  const lone = r.nativeCampaign.platforms.at(-1);
  assert.equal(lone.assemblyId, undefined);
  assert.equal(lone.attachmentTo, undefined);
});

test('entries/exits copy as data and never inherit course wiring', () => {
  const r = room();
  r.entries[0] = { id: 'entry-1', name: '入口', x: 2, y: 3, face: 1, allowReturn: true };
  r.exits.push({ id: 'exit-1', name: '出口', x: 10, y: 3, w: 1, h: 2 });
  const course = {
    connections: [
      {
        id: 'wire-1',
        from: { roomId: 'room-test', exitId: 'exit-1' },
        to: { roomId: 'other', entryId: 'entry-9' },
      },
    ],
  };
  const before = JSON.stringify(course);
  const clip = Clip.capture(r, [
    { kind: 'entries', id: 'entry-1' },
    { kind: 'exits', id: 'exit-1' },
  ]);
  assert.equal(clip.items.length, 2);
  const result = Clip.paste(r, clip, { offsetX: 1, offsetY: 1 });
  const entry = r.entries.at(-1),
    exit = r.exits.at(-1);
  assert.notEqual(entry.id, 'entry-1');
  assert.notEqual(exit.id, 'exit-1');
  assert.deepEqual([entry.x, entry.y], [3, 4]);
  assert.deepEqual([exit.x, exit.y], [11, 4]);
  assert.equal(JSON.stringify(course), before, 'no external connection is copied or mutated');
  assert.ok(result.refs.some((ref) => ref.kind === 'entries' && ref.id === entry.id));
  assert.ok(result.refs.some((ref) => ref.kind === 'exits' && ref.id === exit.id));
});

test('native and port out-of-bounds pastes are rejected before any mutation', () => {
  const Native = require('../src/project/native-compat.cjs');
  const r = room();
  Native.initRoom(r);
  r.nativeCampaign.platforms.push({ id: 'platform-1', x: 18, y: 10, w: 2, h: 2 });
  r.nativeCampaign.patrols.push({ id: 'patrol-1', nodes: [{ x: 19.5, y: 2.5 }] });
  const platformClip = Clip.capture(r, [{ kind: 'platforms', id: 'platform-1' }]);
  const before = JSON.stringify(r);
  assert.throws(() => Clip.paste(r, platformClip, { offsetX: 1, offsetY: 0 }), /边界/);
  assert.equal(JSON.stringify(r), before, 'rejected native paste mutates nothing');
  const patrolClip = Clip.capture(r, [{ kind: 'patrols', id: 'patrol-1' }]);
  assert.throws(() => Clip.paste(r, patrolClip, { offsetX: 1, offsetY: 0 }), /边界/);
  assert.equal(JSON.stringify(r), before, 'rejected patrol paste mutates nothing');
});
