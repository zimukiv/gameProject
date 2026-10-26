const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const app = path.resolve(process.argv[2], 'resources/app');
const M = require(path.join(app, 'src/project/model.cjs'));
const { Engine } = require(path.join(app, 'src/runtime/engine.cjs'));
const project = M.migrate(JSON.parse(fs.readFileSync(path.join(app, 'project.json'), 'utf8')));
const course = project.courses.find(c => c.rooms.some(r => r.objects.some(o => o.type === 'common.spike')));
const room = course.rooms.find(r => r.objects.some(o => o.type === 'common.spike'));
function fixture(collision, direction = 'up') {
  const g = new Engine(project, course.id, room.id);
  const spike = g.room.objects.find(o => o.type === 'common.spike');
  Object.assign(spike, { x: 10, y: 8, w: 1, h: 1, collision });
  spike.params.direction = direction;
  g.room.objects = [spike];
  for (const key of ['tiles', 'movables', 'zones', 'exits']) g.room[key] = [];
  Object.assign(g.player, { vx: 0, vy: 0, dash: 0, grounded: false, support: null, launched: false });
  return { g, spike, cx: 336, cy: 288 };
}
const cases = [
  ['upper part of old cell', (p, x, y) => ({ x: x - p.w / 2, y: y - 18 - p.h }), false],
  ['3px visual margin at top', (p, x, y) => ({ x: x - p.w / 2, y: y - 12 - p.h }), false],
  ['above exact danger boundary', (p, x, y) => ({ x: x - p.w / 2, y: y - 11 - p.h }), false],
  ['left visual margin', (p, x, y) => ({ x: x - 12 - p.w, y: y - 1 }), false],
  ['right visual margin', (p, x, y) => ({ x: x + 12, y: y - 1 }), false],
  ['curved corner outside disk', (p, x, y) => ({ x: x - 8 - p.w, y: y - 8 - p.h }), false],
  ['below flat base', (p, x, y) => ({ x: x - p.w / 2, y }), false],
  ['top of danger disk', (p, x, y) => ({ x: x - p.w / 2, y: y - 10 - p.h }), true],
  ['inside curved corner', (p, x, y) => ({ x: x - 7 - p.w, y: y - 7 - p.h }), true],
  ['left of danger disk', (p, x, y) => ({ x: x - 10 - p.w, y: y - 1 }), true],
  ['right of danger disk', (p, x, y) => ({ x: x + 10, y: y - 1 }), true],
  ['center of danger disk', (p, x, y) => ({ x: x - p.w / 2, y: y - 3 }), true],
];
let checked = 0;
const poses = { up: [336, 288], down: [336, 256], right: [320, 272], left: [352, 272] };
const rotate = { up: (x,y) => [x,y], down: (x,y) => [-x,-y], right: (x,y) => [-y,x], left: (x,y) => [y,-x] };
for (const direction of Object.keys(poses)) for (const collision of [true, false]) for (const [label, position, lethal] of cases) {
  const { g, cx, cy } = fixture(collision, direction);
  const p = { ...g.player, ...position(g.player, cx, cy) }, [bx, by] = poses[direction];
  const points = [[p.x,p.y],[p.x+p.w,p.y],[p.x,p.y+p.h],[p.x+p.w,p.y+p.h]]
    .map(([x,y]) => rotate[direction](x-cx,y-cy));
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  Object.assign(g.player, { x: bx+Math.min(...xs), y: by+Math.min(...ys), w: Math.max(...xs)-Math.min(...xs), h: Math.max(...ys)-Math.min(...ys) });
  g.update(0);
  assert.equal(g.deaths, lethal ? 1 : 0, `${label}, collision=${collision}, direction=${direction}`);
  checked++;
}
const { g, spike } = fixture(true);
assert.ok(!g.colliders().some(c => c.id === spike.id), 'Spike editor cell must not block movement');
g.room.tiles = [{ x: 8, y: 9 }];
Object.assign(g.player, { x: 8 * 32 + 4, y: 9 * 32 - g.player.h - 1, vy: 240 });
g.update(1 / 120);
assert.equal(g.player.grounded, true);
assert.equal(g.player.y + g.player.h, 9 * 32);
let assigned = 0;
for (const c of project.courses) for (const r of c.rooms) for (const o of r.objects.filter(o => o.type === 'common.spike')) {
  assert.ok(Object.hasOwn(poses, o.params.direction), `Missing/invalid direction: ${r.name}/${o.id}`);
  assigned++;
}
const examples = [
  ['AI追逐1',18,1,'right'], ['AI追逐1',23,1,'left'], ['AI追逐1',12,1,'down'],
  ['XX',41,22,'right'], ['XX',49,22,'left'], ['XX',22,57,'up'], ['XX',8,49,'down'],
  ['XX',6,52,'up'], ['XX',5,23,'up'],
];
for (const [name,x,y,direction] of examples) {
  const r = project.courses.flatMap(c => c.rooms).find(r => r.name === name);
  const o = r.objects.find(o => o.type === 'common.spike' && o.x === x && o.y === y);
  assert.equal(o?.params.direction, direction, `${name} (${x},${y})`);
}
console.log(`SPIKES_PASS cases=${checked} assigned=${assigned} directions=4 wall/ceiling/floor/floating=pass visualRadius=14 dangerRadius=11 fullCellBlocking=removed normalFloor=pass`);
