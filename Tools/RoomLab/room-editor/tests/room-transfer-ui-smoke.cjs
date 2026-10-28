'use strict';
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'),
  M = require('../src/project/model.cjs'),
  A = require('../src/project/archive.cjs'),
  Seeds = require('../src/assets/seeds.cjs'),
  { standalone } = require('../src/project/room-export.cjs');
(async () => {
  const source = M.example(),
    seed = Seeds.seeds();
  source.assets = seed.assets;
  source.courses[0].artBindings = seed.bindings;
  seed.files.set(
    'assets/seed-metal.svg',
    new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#da67c0"/></svg>',
    ),
  );
  const file = path.resolve(__dirname, '../test-output/导入房间测试包.zip');
  fs.writeFileSync(file, A.pack(standalone(source, 'physics', 'ice-room'), seed.files));
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
    const before = await page.evaluate(() => window.__ROOM_LAB__.snapshot().project);
    const choose = async () => {
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.locator('#import-room').click(),
      ]);
      await chooser.setFiles(file);
      await page.locator('#room-import-choice').waitFor();
    };
    await choose();
    await page.getByRole('button', { name: '取消', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.__ROOM_LAB__.snapshot().project), before);
    await choose();
    assert.equal(await page.locator('#room-import-art').isChecked(), true);
    await page.getByRole('button', { name: '导入到大关', exact: true }).click();
    await page.waitForFunction(
      () => window.__ROOM_LAB__.snapshot().project.courses[0].rooms.length === 4,
    );
    const snap = await page.evaluate(() => window.__ROOM_LAB__.snapshot()),
      r = snap.project.courses[0].rooms[3];
    assert.equal(snap.project.id, before.id);
    assert.deepEqual(snap.project.courses[0].rooms.slice(0, 3), before.courses[0].rooms);
    assert.equal(r.name, '02 温控与累计融冰（导入 2）');
    assert.equal(r.id, snap.state.roomId);
    assert.equal(snap.project.assets.length, before.assets.length + 1);
    assert.equal(r.objects.find((o) => o.type === 'physics.thermal').params.zoneId, r.zones[0].id);
    assert.notEqual(r.artBindings['common.solid'].idle, 'seed-metal');
    await page.screenshot({
      path: path.resolve(__dirname, '../test-output/import-room-editor.png'),
    });
    await page.keyboard.press('Control+z');
    await page.waitForFunction(
      () => window.__ROOM_LAB__.snapshot().project.courses[0].rooms.length === 3,
    );
    assert.deepEqual(await page.evaluate(() => window.__ROOM_LAB__.snapshot().project), before);
    await page.keyboard.press('Control+y');
    await page.waitForFunction(
      () => window.__ROOM_LAB__.snapshot().project.courses[0].rooms.length === 4,
    );
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        roomImportUI: true,
        packaged: !!process.env.EDITOR_EXE,
        cancelPreservesProject: true,
        appendPreservesExisting: true,
        rename: true,
        conflictingAssetsCopied: true,
        thermalReferences: true,
        undoRedo: true,
      }),
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
