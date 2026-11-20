'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  M = require('../src/project/model.cjs'),
  Registry = require('../src/plugins/registry.cjs'),
  TeacherLinks = require('../src/project/teacher-links.cjs'),
  { Engine } = require('../src/runtime/engine.cjs');

function scene() {
  const project = M.themedExample(),
    course = project.courses.find((c) => c.kind === 'slacker'),
    room = course.rooms[0],
    first = room.objects.find((o) => o.type === 'slacker.checkin'),
    second = Registry.instantiate(project, 'slacker.checkin', 'teacher-checkin-2', 18, 12, course);
  room.objects.push(second);
  return { project, course, room, first, second };
}
function addTeacher(scene, id, x = 6, y = 11) {
  const teacher = Registry.instantiate(scene.project, 'slacker.teacher', id, x, y, scene.course);
  teacher.params.patrolMinX = x;
  teacher.params.patrolMaxX = x + 3;
  teacher.params.speed = 4;
  scene.room.objects.push(teacher);
  return teacher;
}

test('teacher patrols inside its platform range and can bind check-in blocks', () => {
  const s = scene(),
    teacher = addTeacher(s, 'teacher-patrol');
  assert.equal(teacher.collision, false);
  assert.equal(teacher.params.patrolMinX, 6);
  assert.equal(teacher.params.patrolMaxX, 9);
  TeacherLinks.toggle(s.room, teacher, [s.first]);
  assert.deepEqual(TeacherLinks.ids(teacher), [s.first.id]);
  TeacherLinks.toggle(s.room, teacher, [s.second]);
  assert.deepEqual(new Set(TeacherLinks.ids(teacher)), new Set([s.first.id, s.second.id]));
  TeacherLinks.toggle(s.room, teacher, [s.first]);
  assert.deepEqual(TeacherLinks.ids(teacher), [s.second.id]);
  TeacherLinks.move(teacher, 1);
  assert.deepEqual([teacher.params.patrolMinX, teacher.params.patrolMaxX], [7, 10]);
  TeacherLinks.move(teacher, -1);
  assert.deepEqual([teacher.params.patrolMinX, teacher.params.patrolMaxX], [6, 9]);

  const engine = new Engine(s.project, s.course.id, s.room.id),
    state = engine.objectStates.get(teacher.id),
    xs = [],
    directions = new Set();
  engine.player.x = 32;
  engine.player.y = 32;
  for (let i = 0; i < 240; i++) {
    engine.update(1 / 120, {});
    xs.push(engine.objectRect(teacher).x / 32);
    directions.add(state.direction);
  }
  assert.ok(xs.some((x) => x < 6.5));
  assert.ok(xs.some((x) => x > 8.5));
  assert.ok(xs.every((x) => x >= 6 && x <= 9));
  assert.deepEqual(directions, new Set([1, -1]));
});

test('same teacher halves tokens once then kills on the next contact', () => {
  const s = scene(),
    teacher = addTeacher(s, 'teacher-hit', 6, 6),
    engine = new Engine(s.project, s.course.id, s.room.id);
  engine.tokens = 10;
  Object.assign(engine.player, { x: 6 * 32 + 4, y: 6 * 32 + 4, vx: 0, vy: 0 });
  engine.update(1 / 120, {});
  assert.equal(engine.tokens, 5);
  assert.equal(engine.objectStates.get(teacher.id).hits, 1);
  assert.ok(engine.events.some((e) => e.type === 'teacher-hit' && e.lost === 5));
  engine.player.x = 32;
  engine.player.y = 32;
  engine.update(1 / 120, {});
  engine.player.x = 6 * 32 + 4;
  engine.player.y = 6 * 32 + 4;
  engine.update(1 / 120, {});
  assert.equal(engine.deaths, 1);
  assert.ok(engine.events.some((e) => e.type === 'teacher-death'));
});

test('two different teachers each deduct half of the remaining tokens', () => {
  const s = scene(),
    a = addTeacher(s, 'teacher-a', 6, 6),
    b = addTeacher(s, 'teacher-b', 6, 6),
    engine = new Engine(s.project, s.course.id, s.room.id);
  engine.tokens = 10;
  Object.assign(engine.player, { x: 6 * 32 + 4, y: 6 * 32 + 4, vx: 0, vy: 0 });
  engine.update(1 / 120, {});
  assert.equal(engine.tokens, 2);
  assert.equal(engine.deaths, 0);
  assert.equal(engine.objectStates.get(a.id).hits, 1);
  assert.equal(engine.objectStates.get(b.id).hits, 1);
});

test('teacher disappears after every bound check-in is activated', () => {
  const s = scene(),
    teacher = addTeacher(s, 'teacher-remove');
  TeacherLinks.set(teacher, [s.first.id, s.second.id]);
  const engine = new Engine(s.project, s.course.id, s.room.id),
    state = engine.objectStates.get(teacher.id);
  engine.objectStates.get(s.first.id).signIns = 1;
  engine.update(1 / 120, {});
  assert.equal(state.removed, false);
  engine.objectStates.get(s.second.id).signIns = 1;
  engine.update(1 / 120, {});
  assert.equal(state.removed, true);
  assert.ok(engine.events.some((e) => e.type === 'teacher-removed'));
});

test('deleting a check-in cleans teacher bindings', () => {
  const s = scene(),
    teacher = addTeacher(s, 'teacher-cleanup');
  TeacherLinks.set(teacher, [s.first.id]);
  require('../src/project/selection.cjs').remove(s.course, s.room, [
    { kind: 'objects', id: s.first.id },
  ]);
  assert.deepEqual(TeacherLinks.ids(teacher), []);
});

test('copying a room remaps teacher check-in bindings', () => {
  const s = scene(),
    teacher = addTeacher(s, 'teacher-copy');
  TeacherLinks.set(teacher, [s.first.id]);
  const copy = M.duplicateRoom(s.course, s.room.id),
    copiedTeacher = copy.objects.find((o) => o.type === 'slacker.teacher'),
    copiedCheckin = copy.objects.find((o) => o.type === 'slacker.checkin');
  assert.deepEqual(copiedTeacher.params.checkinIds, [copiedCheckin.id]);
});

test('teacher follows a 2D node route with per-segment time and round trip', () => {
  const Route = require('../src/project/teacher-route.cjs'),
    s = scene(),
    teacher = addTeacher(s, 'teacher-route', 4, 4);
  teacher.params.path = [
    { x: 8, y: 4, seconds: 1, mode: 'linear' },
    { x: 8, y: 8, seconds: 1, mode: 'linear' },
  ];
  teacher.params.pathLoop = 'roundtrip';
  assert.equal(Route.hasPath(teacher), true);
  assert.equal(Route.duration(teacher), 2);
  const engine = new Engine(s.project, s.course.id, s.room.id),
    state = engine.objectStates.get(teacher.id),
    xs = [],
    ys = [];
  engine.player.x = 32;
  engine.player.y = 32;
  for (let i = 0; i < 360; i++) {
    engine.update(1 / 120, {});
    xs.push(state.x);
    ys.push(state.y);
  }
  assert.ok(Math.max(...xs) > 7.9 && Math.max(...ys) > 7.9, 'route moves on both axes');
  assert.ok(Math.min(...ys) < 4.1, 'round trip returns towards the teacher node 0');
  assert.ok(
    xs.every((x) => x >= 4 && x <= 8) && ys.every((y) => y >= 4 && y <= 8),
    'route stays inside its nodes',
  );
});

test('moving the teacher carries the node route and copying keeps it', () => {
  const Route = require('../src/project/teacher-route.cjs'),
    s = scene(),
    teacher = addTeacher(s, 'teacher-move-route', 4, 4);
  teacher.params.path = [{ x: 8, y: 4, seconds: 1, mode: 'smooth' }];
  Route.moveOwner(teacher, 6, 5);
  assert.deepEqual(
    [teacher.x, teacher.y, ...Route.nodes(teacher).flatMap((n) => [n.x, n.y])],
    [6, 5, 10, 5],
  );
  const copy = M.duplicateRoom(s.course, s.room.id),
    copied = copy.objects.find((o) => o.type === 'slacker.teacher');
  assert.deepEqual(
    Route.nodes(copied).map((n) => [n.x, n.y, n.seconds, n.mode]),
    [[10, 5, 1, 'smooth']],
    'copied room keeps its own route copy',
  );
  copied.params.path[0].x = 3;
  assert.equal(Route.nodes(teacher)[0].x, 10, 'route is deep copied, not shared');
});

test('a teacher without a node route keeps the legacy patrol behaviour', () => {
  const Route = require('../src/project/teacher-route.cjs'),
    s = scene(),
    teacher = addTeacher(s, 'teacher-legacy', 6, 11);
  assert.equal(Route.hasPath(teacher), false);
  assert.equal(teacher.params.path.length, 0);
  const engine = new Engine(s.project, s.course.id, s.room.id),
    state = engine.objectStates.get(teacher.id);
  engine.player.x = 32;
  engine.player.y = 32;
  for (let i = 0; i < 120; i++) engine.update(1 / 120, {});
  assert.equal(state.y, 11, 'legacy patrol never changes row');
  assert.ok(state.x >= 6 && state.x <= 9);
});

test('teacher route serialization round trip keeps the unknown fields', () => {
  const Route = require('../src/project/teacher-route.cjs'),
    s = scene(),
    teacher = addTeacher(s, 'teacher-save', 5, 5);
  teacher.params.path = [{ x: 7, y: 5, seconds: 1.5, mode: 'easeIn' }];
  teacher.params.pathLoop = 'loop';
  teacher.params.checkinIds = [s.first.id];
  const json = JSON.parse(JSON.stringify(s.project)),
    saved = json.courses
      .find((c) => c.kind === 'slacker')
      .rooms[0].objects.find((o) => o.type === 'slacker.teacher');
  assert.deepEqual(Route.nodes(saved), [{ x: 7, y: 5, seconds: 1.5, mode: 'easeIn' }]);
  assert.equal(saved.params.pathLoop, 'loop');
  assert.deepEqual(saved.params.checkinIds, [s.first.id]);
});
