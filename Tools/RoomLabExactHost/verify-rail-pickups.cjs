const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const app = path.resolve(process.argv[2], 'resources/app');
const M = require(path.join(app, 'src/project/model.cjs'));
const { Engine } = require(path.join(app, 'src/runtime/engine.cjs'));
const project = M.migrate(JSON.parse(fs.readFileSync(path.join(app, 'project.json'), 'utf8')));
const course = project.courses.find(c => c.rooms.some(r => r.name === 'AI追逐1'));
const room = course.rooms.find(r => r.name === 'AI追逐1');
const dt = 1 / 120;

// A normal dash already supports pickups, including collision-enabled tokens.
const dash = new Engine(project, course.id, room.id);
const token = dash.room.objects.find(o => o.type === 'common.small');
dash.room.objects = [token]; dash.room.tiles = []; dash.room.movables = []; dash.room.zones = []; dash.room.exits = [];
Object.assign(dash.player, { x: token.x * 32 - dash.player.w - 1, y: token.y * 32 + 1, grounded: false });
dash.update(dt, { right: true, dashPressed: true });
assert.ok(dash.player.dash > 0);
assert.equal(dash.tokens, 1);
assert.ok(dash.credited.has(`${room.id}/${token.id}`));
console.log('DASH_PICKUP_PASS tokens=1 duringDash=true');

// Use the actual multi-segment rail and the two tokens shown in the user's image.
const g = new Engine(project, course.id, room.id);
const rail = g.room.objects.find(o => o.id === 'block-mvnhknt8-r0nu6l');
const ids = ['block-mvnjmv0r-npmfdw', 'block-mvnjmvjy-hbph5r'];
g.charges = 2; g.recharge = 9;
g.startRail(rail);
const pickedWhileRiding = new Set();
for (let i = 0; i < 1000 && g.player.rail; i++) {
  g.update(dt);
  for (const id of ids) if (g.player.rail && g.credited.has(`${room.id}/${id}`)) pickedWhileRiding.add(id);
}
assert.deepEqual([...pickedWhileRiding].sort(), [...ids].sort(), 'Rail movement skipped token collection');
assert.equal(g.tokens, 2);
assert.equal(g.recharge, 1);
assert.equal(g.charges, 3);
assert.equal(g.score, 200);
for (const id of ids) assert.equal(g.events.filter(e => e.type === 'collect' && e.id === id).length, 1);
const end = rail.params.path.at(-1);
assert.equal(g.player.rail, null);
assert.equal(g.player.x, end.x * 32 - g.player.w / 2);
assert.equal(g.player.y, end.y * 32 - g.player.h);
assert.equal(g.player.vx, Math.cos(rail.params.launchAngle * Math.PI / 180) * rail.params.maxSpeed);
assert.equal(g.player.vy, Math.sin(rail.params.launchAngle * Math.PI / 180) * rail.params.maxSpeed);
console.log('RAIL_PICKUPS_PASS actualRoom=AI追逐1 tokens=2 recharge=1 charges=3 score=200 duplicate=none endpoint/launch=unchanged');
