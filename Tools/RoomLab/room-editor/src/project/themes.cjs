'use strict';
const M = require('./model.cjs');

// Stable theme kinds are part of the project format: never rename them.
const THEMES = [
  {
    kind: 'physics',
    label: '物理',
    order: 1,
    color: '#4ea3d1',
    notes: '速度、材料与温控',
    aiId: 'physics-demo-ai',
    defaultSize: { cols: 30, rows: 17 },
  },
  {
    kind: 'calculus',
    label: '高数',
    order: 2,
    color: '#c39ae8',
    notes: '积分聚合与求导展开',
    aiId: 'calculus-demo-ai',
    defaultSize: { cols: 30, rows: 17 },
  },
  {
    kind: 'slacker',
    label: '水课',
    order: 3,
    color: '#7fd6a2',
    notes: '签到记录与清醒加速',
    aiId: 'slacker-demo-ai',
    defaultSize: { cols: 26, rows: 15 },
  },
];
const PLUGIN_VERSIONS = {
  'calculus.integral': '1.0.0',
  'calculus.derivative': '1.0.0',
  'slacker.checkin': '1.0.0',
  'slacker.awake': '1.0.0',
};
function theme(kind) {
  return THEMES.find((t) => t.kind === kind) || { ...THEMES[0], kind, label: kind };
}
function movable(id, x, y, targetX, targetY, padId) {
  return {
    id,
    x,
    y,
    targetX,
    targetY,
    padId,
    collision: true,
    notes: '',
    assetOverrides: {},
  };
}
// One editable starter room when adding a course. The shipped project also
// includes the focused examples below.
function buildRoom(kind, id) {
  if (kind === 'calculus') {
    const r = M.room(id, '01 积分桥与求导门', 30, 17);
    r.notes = '踩积分板让机关砖聚合搭桥；踩求导板把挡路的砖展开，随后走到出口。';
    r.phase = 'slow';
    r.aiPolicy = 'off';
    r.graph = { x: 30, y: 470 };
    M.floor(r, 0, 9, 14);
    M.floor(r, 14, 29, 14);
    r.movables = [
      movable(id + '-bridge-1', 10, 10, 10, 14, id + '-integral'),
      movable(id + '-bridge-2', 11, 10, 11, 14, id + '-integral'),
      movable(id + '-bridge-3', 12, 10, 12, 14, id + '-integral'),
      movable(id + '-bridge-4', 13, 10, 13, 14, id + '-integral'),
      movable(id + '-gate-1', 18, 13, 18, 9, id + '-derivative'),
      movable(id + '-gate-2', 18, 12, 18, 8, id + '-derivative'),
    ];
    r.objects = [
      M.object(id + '-integral', 'calculus.integral', 5, 14, {
        once: true,
        cooldown: 1,
      }),
      M.object(id + '-derivative', 'calculus.derivative', 16, 14, {
        once: true,
        cooldown: 1,
      }),
      M.object(id + '-coin', 'common.coin', 20, 13),
    ];
    r.exits = [
      { id: id + '-exit', name: '过关出口', notes: '完成高数示例', x: 28, y: 12, w: 1, h: 2 },
    ];
    return r;
  }
  if (kind === 'slacker') {
    const r = M.room(id, '01 签到与清醒冲刺', 26, 15);
    r.notes = '踩签到板留下签到记录，踩清醒板获得短暂加速，再冲向出口。';
    r.phase = 'slow';
    r.aiPolicy = 'off';
    r.graph = { x: 30, y: 470 };
    M.floor(r, 0, 25, 12);
    r.objects = [
      M.object(id + '-checkin', 'slacker.checkin', 5, 12, { cooldown: 1 }),
      M.object(id + '-awake', 'slacker.awake', 12, 12, { speed: 520, lift: 140, cooldown: 3 }),
      M.object(id + '-coin', 'common.coin', 16, 11),
    ];
    r.exits = [
      { id: id + '-exit', name: '下课出口', notes: '完成水课示例', x: 24, y: 10, w: 1, h: 2 },
    ];
    return r;
  }
  // Physics keeps the shipped first-course rooms; a new physics course gets a
  // small editable starter room instead.
  const r = M.room(id, '新物理房', 30, 17);
  r.notes = '可编辑的物理起始房。';
  r.graph = { x: 30, y: 470 };
  M.floor(r, 0, r.cols - 1, r.rows - 3);
  r.objects = [
    M.object(id + '-jet', 'physics.jet', 8, r.rows - 3, { cooldown: 1 }),
    M.object(id + '-coin', 'common.coin', 3, r.rows - 4),
  ];
  r.exits = [
    { id: id + '-exit', name: '大关结束', notes: '', x: r.cols - 2, y: r.rows - 5, w: 1, h: 2 },
  ];
  return r;
}
function buildCourse(kind, { id, name, examples = false, blank = false } = {}) {
  const t = theme(kind);
  const courseId = id || M.uid('course');
  const room = blank
    ? M.room(courseId + '-room', '新房间 1', t.defaultSize.cols, t.defaultSize.rows)
    : buildRoom(kind, courseId + '-room');
  const course = {
    id: courseId,
    name: name || '新大关 · ' + t.label,
    kind: t.kind,
    notes: t.notes,
    aiId: t.aiId,
    order: t.order,
    color: t.color,
    defaultSize: { ...t.defaultSize },
    artBindings: {},
    rooms: [room],
    connections: [],
  };
  if (blank || !examples) return course;
  if (kind !== 'physics') return demonstrationRooms(course);
  const source = M.example().courses[0];
  course.rooms = source.rooms.map((original) => ({
    ...M.duplicateRoom(source, original.id),
    name: original.name,
    graph: original.graph,
  }));
  for (const wire of source.connections) {
    const a = source.rooms.findIndex((r) => r.id === wire.from.roomId),
      b = source.rooms.findIndex((r) => r.id === wire.to.roomId),
      exit = source.rooms[a].exits.findIndex((x) => x.id === wire.from.exitId),
      entry = source.rooms[b].entries.findIndex((x) => x.id === wire.to.entryId);
    M.connect(
      course,
      course.rooms[a].id,
      course.rooms[a].exits[exit].id,
      course.rooms[b].id,
      course.rooms[b].entries[entry].id,
      wire.velocity,
    );
  }
  return course;
}
function demonstrationRooms(course, stem = course.id) {
  const kind = course.kind;
  const practice = buildRoom(kind, stem + '-practice');
  const challenge = buildRoom(kind, stem + '-challenge');
  if (kind === 'calculus') {
    practice.name = '02 积分练习 · 拼起缺口';
    practice.notes = '看机关砖的虚线目标：踩积分板，将分散的四块砖聚成桥，再穿过缺口。';
    practice.objects = practice.objects.filter((o) => o.type !== 'calculus.derivative');
    practice.movables = practice.movables.filter((b) => b.padId === practice.id + '-integral');

    challenge.name = '03 求导练习 · 双门分流';
    challenge.notes = '两道挡路砖各有一块求导板。观察绑线，踩对应板把砖移走。';
    challenge.tiles = [];
    M.floor(challenge, 0, challenge.cols - 1, 14);
    challenge.objects = [
      M.object(challenge.id + '-derivative', 'calculus.derivative', 5, 14),
      M.object(challenge.id + '-derivative-2', 'calculus.derivative', 16, 14),
      M.object(challenge.id + '-coin', 'common.coin', 22, 13),
    ];
    challenge.movables = [9, 20].flatMap((x, i) =>
      [12, 13].map((y) =>
        movable(
          challenge.id + '-gate-' + x + '-' + y,
          x,
          y,
          x,
          y - 4,
          challenge.id + (i ? '-derivative-2' : '-derivative'),
        ),
      ),
    );
  } else {
    practice.name = '02 签到练习 · 两个签到站';
    practice.notes = '分别踩两个签到站，观察每块板独立记录并亮起。中间设有复活点。';
    practice.objects = [
      M.object(practice.id + '-checkin', 'slacker.checkin', 5, 12),
      { ...M.object(practice.id + '-checkpoint', 'common.checkpoint', 10, 11), collision: false },
      M.object(practice.id + '-checkin-2', 'slacker.checkin', 16, 12),
    ];

    challenge.name = '03 清醒练习 · 加速跨空档';
    challenge.notes = '踩清醒板后保持向右，利用上抛和冲量跨过地面空档。';
    challenge.tiles = [];
    M.floor(challenge, 0, 10, 12);
    M.floor(challenge, 14, challenge.cols - 1, 12);
    challenge.objects = [
      M.object(challenge.id + '-awake', 'slacker.awake', 10, 12, {
        speed: 690,
        lift: 260,
        cooldown: 3,
      }),
      M.object(challenge.id + '-coin', 'common.coin', 17, 11),
    ];
  }
  course.rooms.push(practice, challenge);
  course.rooms.forEach((room, index) => {
    room.graph = { x: 30 + 360 * index, y: 90 };
    const next = course.rooms[index + 1];
    if (!next) return;
    room.exits[0].name = '去下个示例';
    room.exits[0].notes = next.name;
    course.connections.push({
      id: room.id + '-to-' + next.id,
      from: { roomId: room.id, exitId: room.exits[0].id },
      to: { roomId: next.id, entryId: next.entries[0].id },
      velocity: 'reset',
    });
  });
  return course;
}
function starter() {
  const p = M.example();
  p.name = '三主题起始项目';
  p.notes = '第一至第三大关分别演示物理、积分/求导与水课签到/清醒。三个起始模板都可编辑、可试玩。';
  p.courses[0].order = 1;
  p.courses[0].color = '#4ea3d1';
  p.courses.push(
    demonstrationRooms(buildCourse('calculus', { id: 'calculus', name: '第二大关 · 高数' })),
    demonstrationRooms(buildCourse('slacker', { id: 'slacker', name: '第三大关 · 水课' })),
  );
  p.pluginManifest = { ...p.pluginManifest, ...PLUGIN_VERSIONS, 'common.checkpoint': '1.0.0' };
  return p;
}
function pluginVersions() {
  return { ...PLUGIN_VERSIONS };
}
module.exports = {
  THEMES,
  PLUGIN_VERSIONS,
  theme,
  buildCourse,
  buildRoom,
  starter,
  pluginVersions,
};
