const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const app = path.resolve(process.argv[2], 'resources/app');
const M = require(path.join(app, 'src/project/model.cjs'));
const { Engine } = require(path.join(app, 'src/runtime/engine.cjs'));
const project = M.migrate(JSON.parse(fs.readFileSync(path.join(app, 'project.json'), 'utf8')));
const dt = 1 / 120;
let rooms = 0;
for (const c of project.courses) for (const r of c.rooms) {
  const g = new Engine(project, c.id, r.id);
  assert.equal(g.respawnRemaining, 0, 'Initial room load must start immediately');
  g.retry();
  assert.equal(g.respawnRemaining, 0.5);
  const frozen = g.snapshot();
  for (let i = 0; i < 60; i++) {
    if (i === 12) {
      g.togglePause();
      const paused = g.snapshot();
      for (let n = 0; n < 30; n++) g.update(dt);
      assert.deepEqual(g.snapshot(), paused, 'Esc pause must also freeze the countdown');
      g.togglePause();
    }
    if (i === 20) {
      const deaths = g.deaths, remaining = g.respawnRemaining;
      g.retry();
      assert.equal(g.deaths, deaths, 'Retry during the buffer must not start another life');
      assert.equal(g.respawnRemaining, remaining, 'Retry must not restart the countdown');
    }
    g.update(dt, { right: true, up: true, jumpPressed: true, dashPressed: true });
    const state = g.snapshot();
    assert.deepEqual({ ...state, respawnRemaining: 0.5 }, frozen, 'World/player/AI/resources must stay frozen');
  }
  assert.equal(g.respawnRemaining, 0, 'Buffer must expire after exactly 60 fixed ticks');
  g.update(dt);
  assert.equal(g.elapsed, frozen.elapsed + dt);
  assert.equal(g.player.dashCount, 0, 'Buffered dash must not leak into the next life');
  assert.ok(!g.events.slice(frozen.events.length).some(e => e.type === 'dash' || e.type === 'jump'));
  rooms++;
}
// Exercise automatic death routes in addition to manual R.
for (const kind of ['fall', 'spike', 'ai']) {
  const g = new Engine(project);
  g.room.tiles = []; g.room.movables = []; g.room.zones = []; g.room.objects = []; g.room.exits = [];
  if (kind === 'fall') { g.player.y = g.room.rows * 32 + 100; g.update(dt); }
  if (kind === 'spike') {
    const spike = project.courses.flatMap(c => c.rooms).flatMap(r => r.objects).find(o => o.type === 'common.spike');
    const o = JSON.parse(JSON.stringify(spike));
    Object.assign(o, { x: 10, y: 8, params: { ...o.params, direction: 'up' } });
    g.room.objects = [o]; g.objectStates.set(o.id, { cooldown: 0 });
    Object.assign(g.player, { x: 326, y: 280, vx: 0, vy: 0 }); g.update(0);
  }
  if (kind === 'ai') { g.tokens = 0; g.player.invulnerable = 0; g.ai.processing = 0; g.ai.cooldown = 0; g.catchPlayer(); }
  assert.equal(g.deaths, 1, kind);
  assert.equal(g.respawnRemaining, 0.5, kind);
}
console.log(`RESPAWN_PASS rooms=${rooms} buffer=0.5s frozenTicks=60 inputDropped=true pause/resume=pass repeatedRetry=ignored deaths=fall/spike/ai`);
