'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  M = require('../src/project/model.cjs'),
  Themes = require('../src/project/themes.cjs'),
  Courses = require('../src/project/courses.cjs'),
  Registry = require('../src/plugins/registry.cjs'),
  Engine = require('../src/runtime/engine.cjs').Engine,
  Archive = require('../src/project/archive.cjs'),
  Seeds = require('../src/assets/seeds.cjs'),
  Catalog = require('../src/assets/catalog.cjs');

function walk(engine, seconds, input = { right: true }) {
  for (let i = 0; i < seconds * 120; i++) {
    if (engine.mode !== 'playing') break;
    engine.update(1 / 120, input);
  }
  return engine.snapshot();
}

test('three-theme starter keeps the physics baseline and adds independent themes', () => {
  const base = M.example(),
    p = M.themedExample();
  assert.deepEqual(M.validate(p).errors, []);
  assert.equal(p.courses.length, 3);
  assert.deepEqual(
    p.courses.map((c) => c.kind),
    ['physics', 'calculus', 'slacker'],
  );
  // Physics content/IDs stay the shipped baseline; generated rail-node IDs differ per call.
  const stable = (v) => JSON.parse(JSON.stringify(v).replace(/rail-node-[a-z0-9-]+/g, 'rail-node'));
  assert.deepEqual(stable(p.courses[0].rooms), stable(base.courses[0].rooms));
  assert.deepEqual(p.courses[0].connections, base.courses[0].connections);
  assert.equal(p.courses[0].id, 'physics');
  const roomIds = p.courses.flatMap((c) => c.rooms.map((r) => r.id));
  assert.equal(new Set(roomIds).size, roomIds.length);
  assert.equal(new Set(p.courses.map((c) => c.aiId)).size, 3);
  assert.deepEqual(
    p.courses.map((c) => c.order),
    [1, 2, 3],
  );
  for (const c of p.courses) {
    assert.match(c.color, /^#[0-9a-f]{6}$/i);
    assert.ok(M.validate(p).errors.length === 0);
  }
});

test('opening an old physics project never appends or rewrites courses', () => {
  const old = M.example(),
    before = JSON.stringify(old.courses),
    p = M.migrate(JSON.parse(JSON.stringify(old)));
  assert.equal(p.version, 2);
  assert.equal(p.courses.length, 1);
  assert.equal(p.courses[0].kind, 'physics');
  assert.equal(JSON.stringify(p.courses), before);
  assert.deepEqual(M.validate(p).errors, []);
});

test('theme tools are exclusive while shared common tools stay available', () => {
  const typeList = (kind) => Registry.list(kind).map((d) => d.type),
    physics = typeList('physics'),
    calculus = typeList('calculus'),
    slacker = typeList('slacker'),
    legacy = typeList('legacy');
  assert.ok(!physics.some((t) => t.startsWith('calculus.') || t.startsWith('slacker.')));
  assert.ok(!calculus.some((t) => t.startsWith('physics.') || t.startsWith('slacker.')));
  assert.ok(!slacker.some((t) => t.startsWith('physics.') || t.startsWith('calculus.')));
  for (const type of ['calculus.integral', 'calculus.derivative'])
    assert.ok(calculus.includes(type));
  for (const type of ['slacker.checkin', 'slacker.awake']) assert.ok(slacker.includes(type));
  for (const common of ['common.coin', 'common.checkpoint', 'common.aiStart', 'common.portalIn']) {
    assert.ok(physics.includes(common), common);
    assert.ok(calculus.includes(common), common);
    assert.ok(slacker.includes(common), common);
  }
  assert.ok(legacy.includes('legacy.integral'));
  assert.ok(!legacy.includes('calculus.integral'));
});

test('calculus mechanisms aggregate and expand through the group-displacement context', () => {
  const p = M.themedExample(),
    c = p.courses.find((course) => course.kind === 'calculus'),
    engine = new Engine(p, c.id, c.rooms[0].id),
    room = c.rooms[0],
    integral = room.objects.find((o) => o.type === 'calculus.integral'),
    derivative = room.objects.find((o) => o.type === 'calculus.derivative');
  assert.ok(integral && derivative);
  assert.ok(integral.params.range > 0 && typeof integral.params.once === 'boolean');
  engine.fire(integral);
  assert.ok(engine.events.some((e) => e.type === 'calculus-integral'));
  assert.equal(engine.movableStates.get(room.id + '-bridge-1').anim.to, 1);
  walk(engine, 1);
  assert.ok(engine.movableStates.get(room.id + '-bridge-1').progress > 0.9);
  engine.fire(derivative);
  assert.ok(engine.events.some((e) => e.type === 'calculus-derivative'));
  assert.ok(engine.movableStates.get(room.id + '-gate-1').anim);
  assert.equal(engine.snapshot().objects[derivative.id].fired, true);
});

test('slacker check-in records visits and wakefulness grants a measurable speed gain', () => {
  const p = M.themedExample(),
    c = p.courses.find((course) => course.kind === 'slacker'),
    engine = new Engine(p, c.id, c.rooms[0].id),
    room = c.rooms[0],
    checkin = room.objects.find((o) => o.type === 'slacker.checkin'),
    awake = room.objects.find((o) => o.type === 'slacker.awake');
  engine.fire(checkin);
  assert.equal(engine.snapshot().objects[checkin.id].signIns, 1);
  assert.equal(engine.visualState(checkin), 'active');
  assert.ok(engine.events.some((e) => e.type === 'checkin' && e.count === 1));
  engine.player.vx = 0;
  engine.fire(awake);
  assert.ok(Math.abs(engine.player.vx) >= awake.params.speed);
  assert.equal(engine.snapshot().objects[awake.id].boosts, 1);
  assert.ok(engine.events.some((e) => e.type === 'awake' && e.speed === awake.params.speed));
  assert.equal(engine.visualState(awake), 'active');
});

test('both theme example routes cross all three rooms without retries', () => {
  for (const kind of ['calculus', 'slacker']) {
    const p = M.themedExample(),
      c = p.courses.find((course) => course.kind === kind),
      engine = new Engine(p, c.id, c.rooms[0].id),
      snap = walk(engine, 12);
    assert.equal(c.rooms.length, 3);
    assert.equal(snap.mode, 'won', kind + ' route should be walkable');
    assert.equal(snap.deaths, 0, kind + ' room should not require a retry');
    assert.deepEqual(
      snap.events.filter((e) => e.type === 'room-enter').map((e) => e.room),
      c.rooms.map((r) => r.id),
    );
    const events = snap.events.map((e) => e.type);
    if (kind === 'calculus') {
      assert.ok(events.includes('calculus-integral'));
      assert.ok(events.includes('calculus-derivative'));
    } else {
      assert.ok(events.includes('checkin'));
      assert.ok(events.includes('awake'));
    }
  }
});

test('new courses carry a theme starter room and preserve existing courses', () => {
  const p = M.themedExample(),
    before = JSON.stringify(p.courses);
  for (const kind of ['physics', 'calculus', 'slacker']) {
    const course = Courses.add(p, kind);
    assert.equal(course.kind, kind);
    assert.equal(course.aiId, Themes.theme(kind).aiId);
    assert.ok(course.rooms.length >= 1);
    assert.equal(course.rooms[0].exits.length, 1);
    assert.deepEqual(M.validate(p).errors, []);
  }
  assert.equal(p.courses.length, 6);
  assert.equal(JSON.stringify(p.courses.slice(0, 3)), before);
  while (p.courses.length < 12) Courses.add(p, 'physics');
  assert.throws(() => Courses.add(p, 'physics'), /12/);
});

test('seeded theme artwork binds to all three starter courses and stays theme-scoped', () => {
  const s = Seeds.seeds({ allThemes: true }),
    p = M.themedExample();
  p.assets = s.assets;
  for (const course of p.courses)
    course.artBindings = { ...(s.themeBindings[course.kind] || {}), ...course.artBindings };
  for (const kind of ['calculus', 'slacker'])
    for (const binding of Object.values(s.themeBindings[kind]))
      for (const id of Object.values(binding))
        assert.ok(
          s.assets.some((a) => a.id === id),
          'missing seed ' + id,
        );
  assert.deepEqual(M.validate(p).errors, []);
  assert.deepEqual(
    M.validate(p).warnings.filter((w) => w.includes('缺失')),
    [],
  );
  const added = Courses.add(p, 'calculus');
  assert.ok(Catalog.available(p, added.id, 'calculus.integral').length > 0);
  assert.equal(Catalog.groupForType('calculus.integral'), 'mechanism');
  assert.equal(Catalog.groupForType('slacker.checkin'), 'mechanism');
  const folder = Catalog.classification(
    p,
    s.assets.find((a) => a.id === 'seed-calculus-integral'),
  );
  assert.equal(folder.subcategory, 'calculus.integral');
  assert.ok(folder.subcategory !== 'physics.ice');
  const archived = Archive.unpack(Archive.pack(p, s.files));
  assert.deepEqual(archived.project, p);
  assert.equal(archived.files.size, s.assets.length);
});
