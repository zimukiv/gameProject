'use strict';
const path = require('node:path'),
  fs = require('node:fs/promises'),
  assert = require('node:assert/strict'),
  { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const M = require('../src/project/model.cjs'),
    seed = require('../src/assets/seeds.cjs').seeds(),
    A = require('../src/project/archive.cjs'),
    p = M.example();
  p.assets = seed.assets;
  p.courses[0].artBindings = seed.bindings;
  require('../src/project/courses.cjs').add(p);
  const file = path.resolve(__dirname, '../test-output/新版多大关-兼容.zip');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, A.pack(p, seed.files));
  const env = { ...process.env, ROOM_EDITOR_TEST: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({
    executablePath:
      process.env.OLD_EDITOR_EXE ||
      path.resolve(__dirname, '../release/RoomLab-2.3.1-win-x64/RoomLab.exe'),
    args: [],
    env,
  });
  try {
    const page = await app.firstWindow();
    await page.waitForFunction(() => window.__ROOM_LAB__);
    await page.locator('#project-file').setInputFiles(file);
    await page.waitForFunction(() => window.__ROOM_LAB__.snapshot().project.courses.length === 2);
    const loaded = await page.evaluate(() => window.__ROOM_LAB__.snapshot().project);
    assert.equal(loaded.id, p.id);
    assert.deepEqual(loaded.courses[0].connections, p.courses[0].connections);
    assert.equal(loaded.assets.length, p.assets.length);
    console.log(
      JSON.stringify({
        oldExe: '2.3.1',
        readsNewExport: true,
        courses: 2,
        assets: loaded.assets.length,
      }),
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
