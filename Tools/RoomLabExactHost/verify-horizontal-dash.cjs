const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const app = path.resolve(process.argv[2], 'resources/app');
const M = require(path.join(app, 'src/project/model.cjs'));
const { Engine } = require(path.join(app, 'src/runtime/engine.cjs'));
const project = M.migrate(JSON.parse(fs.readFileSync(path.join(app, 'project.json'), 'utf8')));
function fixture(face = 1) {
  const g = new Engine(project);
  // Isolate movement from level geometry, pickups, triggers and exits.
  for (const key of ['tiles', 'objects', 'movables', 'zones', 'exits']) g.room[key] = [];
  Object.assign(g.player, { x: 320, y: 160, vx: 0, vy: 0, grounded: false, support: null, face });
  return g;
}
let cases = 0;
for (const face of [-1, 1]) for (let mask = 0; mask < 16; mask++) {
  const input = { left: !!(mask & 1), right: !!(mask & 2), up: !!(mask & 4), down: !!(mask & 8) };
  const expected = Number(input.right) - Number(input.left) || face;
  const g = fixture(face), p = g.player, x = p.x, y = p.y, dt = 1 / 120;
  g.update(dt, { ...input, dashPressed: true, jumpPressed: input.up });
  assert.equal(p.vy, 0, `vertical dash: face=${face} input=${JSON.stringify(input)}`);
  assert.equal(p.y, y);
  assert.equal(p.vx, expected * g.config.dashSpeed);
  assert.equal(p.x, x + expected * g.config.dashSpeed * dt);
  assert.equal(p.freeDash, false);
  assert.equal(p.dashCount, 1);
  assert.equal(g.charges, 3);
  // Direction stays fixed throughout the dash, even if held keys change.
  let steps = 1;
  while (p.dash > 0) {
    g.update(dt, { left: expected > 0, right: expected < 0, up: true, down: true });
    assert.equal(p.vy, 0);
    assert.equal(p.y, y);
    assert.equal(Math.sign(p.vx), expected);
    steps++;
  }
  assert.equal(steps, Math.ceil(g.config.dashTime / dt));
  cases++;
}
const g = fixture();
for (let i = 1; i <= 3; i++) {
  g.update(1 / 120, { right: true, up: true, dashPressed: true });
  assert.equal(g.player.dashCount, i);
  assert.equal(g.charges, 4 - i);
}
g.update(1 / 120, { left: true, dashPressed: true });
assert.equal(g.player.dashCount, 3);
assert.equal(g.charges, 1);
const empty = fixture();
empty.player.freeDash = false;
empty.charges = 0;
empty.update(1 / 120, { right: true, dashPressed: true });
assert.equal(empty.player.dashCount, 0);
assert.equal(empty.player.dash, 0);
console.log(`HORIZONTAL_DASH_PASS directions=${cases} duration=unchanged free/paid/cap/empty=pass`);
