'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const M = require('../src/project/model.cjs'),
  N = require('../src/project/native-compat.cjs'),
  V = require('../src/project/native-validation.cjs'),
  S = require('../src/project/selection.cjs'),
  Batch = require('../src/project/room-import-batch.cjs');
const { fixture } = require('./helpers/native-fixture.cjs');
test('native campaign migration preserves extensions; ordinary projects stay ordinary', () => {
  const { p } = fixture();
  const q = M.migrate(p);
  assert.deepEqual(q.nativeCampaign, p.nativeCampaign);
  assert.deepEqual(q.courses[1].rooms[0].nativeCampaign, p.courses[1].rooms[0].nativeCampaign);
  assert.equal(N.enabled(M.example()), false);
  assert.deepEqual(V.validate(p).errors, []);
});
test('selection moves platform endpoint, full patrol and sign without losing decimal offsets', () => {
  const { r } = fixture();
  const refs = [
    { kind: 'platforms', id: 'native-platform' },
    { kind: 'patrols', id: 'native-patrol' },
    { kind: 'signs', id: '@0' },
  ];
  S.move(r, refs, 2, 1);
  assert.equal(r.nativeCampaign.platforms[0].toX, 8);
  assert.equal(r.nativeCampaign.patrols[0].nodes[0].y, 3.55);
  assert.equal(r.nativeCampaign.signs[0].x, 4);
  assert.ok(S.box(r, { x: 0, y: 0 }, { x: 10, y: 10 }).some((x) => x.kind === 'patrols'));
  S.remove({ connections: [] }, r, refs);
  assert.equal(
    r.nativeCampaign.platforms.length +
      r.nativeCampaign.patrols.length +
      r.nativeCampaign.signs.length,
    0,
  );
});
test('room shrinking checks native geometry and duplicate keeps local binding but renews entity IDs', () => {
  const { c, r } = fixture();
  const copy = M.duplicateRoom(c, r.id);
  assert.notEqual(copy.nativeCampaign.platforms[0].id, r.nativeCampaign.platforms[0].id);
  assert.equal(copy.nativeCampaign.platforms[0].switch, 'alpha');
  assert.equal(copy.nativeCampaign.platforms[0].signal, 'beta');
  const shrink = M.resizeRoom(r, 4, 4);
  assert.ok(shrink.out.some((x) => x.kind === 'platforms'));
  assert.ok(shrink.out.some((x) => x.kind === 'patrols'));
  assert.deepEqual(r.nativeCampaign.platforms[0].toX, 6);
});
test('signal rename updates every condition and does not rewrite unrelated author text', () => {
  const { c, r } = fixture();
  r.exits[0].rework = { signal: 'beta', signals: { beta: true }, lockedText: 'beta' };
  N.rename(c, r, 'signal', 'beta', 'new-beta');
  assert.equal(r.objects[0].rework.signal, 'new-beta');
  assert.deepEqual(r.exits[0].rework.signals, { 'new-beta': true });
  assert.equal(r.exits[0].rework.lockedText, 'beta');
  N.rename(c, r, 'switch', 'alpha', 'new-alpha');
  assert.equal(r.nativeCampaign.platforms[0].switch, 'new-alpha');
});
test('native validator catches undeclared signals, malformed paths and bad resource contracts', () => {
  let { p, c, r } = fixture();
  r.nativeCampaign.platforms[0].signal = 'missing';
  assert.ok(V.validate(p).errors.some((x) => x.includes('未知跨房')));
  ({ p, c, r } = fixture());
  r.nativeCampaign.patrols[0].nodes = [{ x: 1, y: 2 }];
  assert.ok(V.validate(p).errors.some((x) => x.includes('巡逻')));
  ({ p, c, r } = fixture());
  r.objects[0].rework.clarityDelta = 30;
  assert.ok(V.validate(p).errors.some((x) => x.includes('一次性')));
  ({ p, c, r } = fixture());
  r.nativeCampaign.platforms[0].toY = 400;
  assert.ok(V.validate(p, { play: true }).errors.some((x) => x.includes('越界')));
});
test('batch import requires collision policy, separates signals coherently and keeps unknown rules', () => {
  const source = fixture(),
    target = fixture();
  const choice = [{ courseId: source.c.id, roomId: source.r.id, mode: 'independent' }];
  assert.throws(
    () => Batch.prepare(target.p, new Map(), source.p, new Map(), target.c.id, choice, false),
    /同名跨房/,
  );
  const out = Batch.prepare(target.p, new Map(), source.p, new Map(), target.c.id, choice, false, {
    signalMode: 'independent',
  });
  const room = out.project.courses.find((c) => c.id === target.c.id).rooms.at(-1);
  assert.notEqual(room.objects[0].rework.signal, 'beta');
  assert.equal(room.objects[0].rework.signal, room.nativeCampaign.platforms[0].signal);
  assert.deepEqual(room.objects[0].rework.unrecognized, { x: 8 });
  assert.deepEqual(source.r.objects[0].rework.signal, 'beta');
  assert.deepEqual(V.validate(out.project).errors, []);
});
test('native room import into ordinary project requires explicit rule adoption', () => {
  const source = fixture(),
    target = M.themedExample(),
    c = target.courses.find((c) => c.kind === 'calculus'),
    choice = [{ courseId: source.c.id, roomId: source.r.id, mode: 'independent' }];
  assert.throws(
    () => Batch.prepare(target, new Map(), source.p, new Map(), c.id, choice, false),
    /确认启用来源规则/,
  );
  const out = Batch.prepare(target, new Map(), source.p, new Map(), c.id, choice, false, {
    adoptNative: true,
  });
  assert.equal(out.adoptedNative, true);
  assert.equal(N.enabled(target), false);
  assert.deepEqual(V.validate(out.project).errors, []);
});
module.exports = { fixture };

test('authored physics import preserves its ordinary rules during explicit adoption', () => {
  const source = M.themedExample(),
    target = M.themedExample();
  const from = source.courses.find((c) => c.kind === 'physics'),
    to = target.courses.find((c) => c.kind === 'physics');
  source.nativeCampaign = {
    id: 'deadline-rework-v2',
    saveMode: 'contact-auto-v1',
    authoredCourses: [from.id, to.id],
  };
  source.courses.filter((c) => c.kind !== 'physics').forEach(N.initCourse);
  const result = Batch.prepare(
    target,
    new Map(),
    source,
    new Map(),
    to.id,
    [{ courseId: from.id, roomId: from.rooms[0].id, mode: 'independent' }],
    false,
    { adoptNative: true },
  );
  const course = result.project.courses.find((c) => c.id === to.id);
  assert.equal(course.nativeCampaign, undefined);
  assert.equal(course.rooms.at(-1).nativeCampaign, undefined);
  assert.deepEqual(M.validate(result.project).errors, []);
});

test('contact-auto keeps authored physics outside extension validation and initialization', () => {
  const { p } = fixture(),
    c = p.courses[0];
  p.nativeCampaign.saveMode = 'contact-auto-v1';
  p.nativeCampaign.authoredCourses = [c.id];
  delete c.nativeCampaign;
  for (const r of c.rooms) delete r.nativeCampaign;
  const before = M.clone(c);
  assert.equal(N.active(p, c), false);
  assert.deepEqual(M.validate(p).errors, []);
  assert.deepEqual(M.migrate(p).courses[0], before);
});
