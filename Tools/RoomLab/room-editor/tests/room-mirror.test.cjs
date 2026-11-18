'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  M = require('../src/project/model.cjs'),
  Mirror = require('../src/project/room-mirror.cjs'),
  Traces = require('../src/project/play-traces.cjs');

function fixture() {
  const room = M.room('mirror-room', '镜像测试', 10, 6);
  room.entries[0] = { id: 'entry-left', name: '左入口', notes: '', x: 1, y: 2, face: 1 };
  room.exits = [{ id: 'exit-right', name: '右出口', notes: '', x: 7, y: 3, w: 2, h: 2 }];
  room.tiles = [
    { x: 1, y: 2, collision: true },
    { x: 8, y: 4, collision: false },
  ];
  room.objects = [
    M.object('jet', 'physics.jet', 2, 2, {
      direction: 'right',
      force: 600,
      launchX: 600,
      launchY: 0,
    }),
    M.object('rail', 'physics.rail', 3, 2, {
      path: [
        { x: 3.5, y: 2.5 },
        { x: 6.5, y: 3.5 },
      ],
      launchAngle: -60,
    }),
    M.object('teacher', 'slacker.teacher', 2, 3, {
      patrolMinX: 1,
      patrolMaxX: 4,
      speed: 1.5,
      checkinIds: [],
    }),
    M.object('rotor', 'legacy.rotor', 4, 1, { angle: 90, launchX: 430, launchY: -780 }),
  ];
  room.movables = [
    {
      id: 'brick',
      x: 2,
      y: 1,
      targetX: 4,
      targetY: 1,
      padId: '',
      collision: true,
      motionPath: [
        { x: 2, y: 1, seconds: 0.45, mode: 'linear' },
        { x: 4, y: 1, seconds: 0.45, mode: 'linear', movingCollision: false },
      ],
    },
  ];
  room.playTraces = [Traces.create('轨迹', [{ x: 2.5, y: 2.5, t: 0, life: 1 }])];
  room.nativeCampaign = {
    switches: [],
    platforms: [
      {
        id: 'platform',
        x: 1,
        y: 1,
        w: 2,
        h: 1,
        toX: 4,
        toY: 3,
        seconds: 1,
        speed: 0,
      },
    ],
    patrols: [
      {
        id: 'patrol',
        nodes: [
          { x: 2.5, y: 1.5 },
          { x: 5.5, y: 4.5 },
        ],
        speed: 95,
      },
    ],
    signs: [{ id: 'sign', x: 2, y: 2, text: '标记' }],
    awareness: 50,
    checkins: 0,
    requireAI: false,
  };
  return room;
}

test('horizontal mirror reflects every room coordinate and directional value', () => {
  const room = fixture(),
    original = JSON.stringify(room),
    mirrored = Mirror.mirrorRoom(room, 'horizontal');
  assert.equal(JSON.stringify(room), original, 'source room must not mutate');
  assert.deepEqual(mirrored.tiles[0], { x: 8, y: 2, collision: true });
  assert.deepEqual(mirrored.entries[0], {
    id: 'entry-left',
    name: '左入口',
    notes: '',
    x: 8,
    y: 2,
    face: -1,
  });
  assert.equal(mirrored.exits[0].x, 1);
  assert.equal(mirrored.exits[0].w, 2);
  assert.equal(mirrored.objects[0].x, 7);
  assert.equal(mirrored.objects[0].params.direction, 'left');
  assert.equal(mirrored.objects[0].params.launchX, -600);
  assert.deepEqual(
    mirrored.objects[1].params.path.map(({ x, y }) => ({ x, y })),
    [
      { x: 6.5, y: 2.5 },
      { x: 3.5, y: 3.5 },
    ],
  );
  assert.equal(mirrored.objects[1].params.launchAngle, -120);
  assert.equal(mirrored.objects[2].params.patrolMinX, 5);
  assert.equal(mirrored.objects[2].params.patrolMaxX, 8);
  assert.equal(mirrored.objects[3].params.angle, -90);
  assert.equal(mirrored.movables[0].targetX, 5);
  assert.equal(mirrored.movables[0].motionPath[1].x, 5);
  assert.equal(mirrored.playTraces[0].points[0].x, 7.5);
  assert.equal(mirrored.nativeCampaign.platforms[0].x, 7);
  assert.equal(mirrored.nativeCampaign.platforms[0].toX, 4);
  assert.equal(mirrored.nativeCampaign.patrols[0].nodes[0].x, 7.5);
  assert.equal(mirrored.nativeCampaign.signs[0].x, 7);
});

test('vertical mirror reflects vertical geometry without changing horizontal facing', () => {
  const room = fixture(),
    mirrored = Mirror.mirrorRoom(room, 'vertical');
  assert.equal(mirrored.tiles[0].y, 3);
  assert.equal(mirrored.entries[0].y, 3);
  assert.equal(mirrored.entries[0].face, 1);
  assert.equal(mirrored.exits[0].y, 1);
  assert.equal(mirrored.objects[0].y, 3);
  assert.equal(mirrored.objects[0].params.direction, 'right');
  assert.equal(mirrored.objects[0].params.launchY, 0);
  assert.deepEqual(
    mirrored.objects[1].params.path.map(({ x, y }) => ({ x, y })),
    [
      { x: 3.5, y: 3.5 },
      { x: 6.5, y: 2.5 },
    ],
  );
  assert.equal(mirrored.objects[1].params.launchAngle, 60);
  assert.equal(mirrored.objects[2].params.patrolMinX, 1);
  assert.equal(mirrored.objects[2].params.patrolMaxX, 4);
  assert.equal(mirrored.objects[3].params.launchY, 780);
  assert.equal(mirrored.movables[0].targetY, 4);
  assert.equal(mirrored.movables[0].motionPath[1].y, 4);
  assert.equal(mirrored.playTraces[0].points[0].y, 3.5);
  assert.equal(mirrored.nativeCampaign.platforms[0].y, 4);
  assert.equal(mirrored.nativeCampaign.platforms[0].toY, 2);
  assert.equal(mirrored.nativeCampaign.patrols[0].nodes[0].y, 4.5);
  assert.equal(mirrored.nativeCampaign.signs[0].y, 3);
});

test('mirroring twice restores the full room and preserves stable IDs', () => {
  const room = fixture(),
    horizontal = Mirror.mirrorRoom(Mirror.mirrorRoom(room, 'horizontal'), 'horizontal'),
    vertical = Mirror.mirrorRoom(Mirror.mirrorRoom(room, 'vertical'), 'vertical');
  assert.deepEqual(horizontal, room);
  assert.deepEqual(vertical, room);
  assert.equal(horizontal.entries[0].id, room.entries[0].id);
  assert.equal(horizontal.objects[0].id, room.objects[0].id);
  assert.equal(horizontal.nativeCampaign.platforms[0].id, room.nativeCampaign.platforms[0].id);
});
test('starter physics rooms remain valid after either mirror axis', () => {
  for (const axis of Mirror.AXES) {
    const project = M.example(),
      course = project.courses[0];
    course.rooms = course.rooms.map((room) => Mirror.mirrorRoom(room, axis));
    assert.deepEqual(M.validate(project), { errors: [], warnings: [] }, axis);
  }
});
