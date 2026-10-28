'use strict';
const assert = require('node:assert/strict'),
  path = require('node:path'),
  fs = require('node:fs'),
  { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'),
  M = require('../src/project/model.cjs'),
  { seeds } = require('../src/assets/seeds.cjs'),
  A = require('../src/project/archive.cjs');
(async () => {
  const p = M.example(),
    seed = seeds();
  p.assets = seed.assets;
  const r = p.courses[0].rooms[0];
  r.environment = 'cold';
  r.entries[0].x = 5;
  r.entries[0].y = 9;
  r.objects = [
    {
      ...M.object('ghost-thermal', 'physics.thermal', 5, 10, { mode: 'hot', cooldown: 1 }),
      collision: false,
    },
  ];
  const input = path.resolve(__dirname, '../test-output/无碰撞温控验收.zip');
  fs.writeFileSync(input, A.pack(p, seed.files));
  const env = { ...process.env, ROOM_EDITOR_TEST: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({
    executablePath: process.env.EDITOR_EXE || require('electron'),
    args: process.env.EDITOR_EXE ? [] : [path.resolve(__dirname, '..')],
    env,
  });
  try {
    const page = await app.firstWindow(),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.waitForFunction(() => window.__ROOM_LAB__);
    await page.locator('#project-file').setInputFiles(input);
    await page.getByRole('button', { name: '进入大关 →', exact: true }).click();
    await page.getByRole('button', { name: '从首房试玩', exact: true }).click();
    await page.waitForFunction(
      () => window.__ROOM_LAB__.snapshot().game?.objects['ghost-thermal']?.used === true,
    );
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        ghostThermalUI: true,
        packaged: !!process.env.EDITOR_EXE,
        triggerWithoutCollision: true,
      }),
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
