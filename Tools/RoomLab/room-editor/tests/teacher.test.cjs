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
