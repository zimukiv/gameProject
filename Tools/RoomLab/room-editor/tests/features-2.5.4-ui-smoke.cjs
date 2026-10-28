'use strict';
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'),
  M = require('../src/project/model.cjs'),
  A = require('../src/project/archive.cjs'),
  Seeds = require('../src/assets/seeds.cjs'),
  Traces = require('../src/project/play-traces.cjs');
(async () => {
  const source = M.example(),
    seed = Seeds.seeds();
  source.id = 'batch-source';
  source.assets = seed.assets;
  source.courses[0].artBindings = seed.bindings;
  source.courses[0].rooms[0].notes = '覆盖内容预览';
  source.courses[0].rooms[2].notes = '未选择，不应导入';
  source.courses[0].rooms[0].playTraces = [
    Traces.create('1', [
      { x: 50, y: 400, t: 0 },
      { x: 150, y: 350, t: 1 },
      { x: 250, y: 400, t: 2 },
    ]),
    Traces.create(
      '2',
      [
        { x: 50, y: 400, t: 0 },
        { x: 100, y: 300, t: 0.5 },
        { x: 200, y: 400, t: 2 },
      ],
      1,
    ),
  ];
  seed.files.set(
    'assets/seed-metal.svg',
    new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="pink"/></svg>',
    ),
  );
  const file = path.resolve(__dirname, '../test-output/2.5.4-batch-source.zip');
  fs.writeFileSync(file, A.pack(source, seed.files));
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
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('#import-room').click(),
    ]);
    await chooser.setFiles(file);
    await page.locator('[data-room-import-index]').first().waitFor();
    await page.locator('[data-room-import-index="0"]').check();
    await page.locator('[data-room-import-index="1"]').check();
    await page.locator('[data-room-import-mode="0"]').selectOption('overwrite');
    await page.getByRole('button', { name: '导入到大关', exact: true }).click();
    await page.locator('#room-import-confirm-yes').waitFor();
    assert.deepEqual(await page.evaluate(() => window.__ROOM_LAB__.snapshot().project), before);
    assert.ok((await page.locator('#room-import-impact').textContent()).includes('01 喷气起跳'));
    await page.locator('#room-import-confirm-no').click();
    assert.deepEqual(await page.evaluate(() => window.__ROOM_LAB__.snapshot().project), before);
    await page.getByRole('button', { name: '导入到大关', exact: true }).click();
    await page.locator('#room-import-confirm-yes').click();
    await page.waitForFunction(
      () => window.__ROOM_LAB__.snapshot().project.courses[0].rooms.length === 4,
    );
    let snap = await page.evaluate(() => window.__ROOM_LAB__.snapshot()),
      c = snap.project.courses[0];
    assert.equal(snap.project.id, before.id);
    assert.equal(c.rooms[0].id, 'jet-room');
    assert.equal(c.rooms[0].notes, '覆盖内容预览');
    assert.deepEqual(c.rooms[2], before.courses[0].rooms[2]);
    assert.equal(snap.project.assets.length, before.assets.length + 1);
    const copied = c.rooms.find((r) => r.name.endsWith('（导入 2）'));
    assert.ok(c.connections.some((w) => w.from.roomId === 'jet-room' && w.to.roomId === copied.id));
    await page.keyboard.press('Control+z');
    await page.waitForFunction(
      () => window.__ROOM_LAB__.snapshot().project.courses[0].rooms.length === 3,
    );
    assert.deepEqual(await page.evaluate(() => window.__ROOM_LAB__.snapshot().project), before);
    await page.keyboard.press('Control+y');
    await page.waitForFunction(
      () => window.__ROOM_LAB__.snapshot().project.courses[0].rooms.length === 4,
    );
    await page.locator('#graph-edit').click();
    const initial = await page.evaluate(() => window.__ROOM_LAB__.snapshot()),
      wires = JSON.stringify(initial.project.courses[0].connections);
    await page
      .locator(`[data-nav-room="${copied.id}"]`)
      .dragTo(page.locator('[data-nav-room="jet-room"]'), { targetPosition: { x: 5, y: 15 } });
    await page.waitForFunction(
      (id) => window.__ROOM_LAB__.snapshot().project.courses[0].rooms[0].id === id,
      copied.id,
    );
    snap = await page.evaluate(() => window.__ROOM_LAB__.snapshot());
    assert.equal(snap.state.roomId, 'jet-room');
    assert.deepEqual(snap.state.roomView, initial.state.roomView);
    assert.equal(JSON.stringify(snap.project.courses[0].connections), wires);
    await page.keyboard.press('Control+z');
    await page.waitForFunction(
      () => window.__ROOM_LAB__.snapshot().project.courses[0].rooms[0].id === 'jet-room',
    );
    let beforeReplay = await page.evaluate(() => window.__ROOM_LAB__.snapshot().project);
    await page.locator('#room-traces').click();
    assert.equal(await page.locator('[data-trace-replay]').count(), 2);
    const oldTrace = beforeReplay.courses[0].rooms.find((r) => r.id === 'jet-room').playTraces[0];
    await page.locator('[data-trace-name]').first().fill('改名后的路线');
    await page.locator('[data-trace-rename]').first().click();
    beforeReplay = await page.evaluate(() => window.__ROOM_LAB__.snapshot().project);
    const renamed = beforeReplay.courses[0].rooms.find((r) => r.id === 'jet-room').playTraces[0];
    assert.equal(renamed.name, '改名后的路线');
    assert.equal(renamed.id, oldTrace.id);
    assert.deepEqual(renamed.points, oldTrace.points);
    await page.locator('#trace-replay-visible').click();
    await page.waitForFunction(
      () => document.querySelector('#trace-replay-canvas')?.dataset.markerCount === '2',
    );
    await page.locator('#trace-replay-play').click();
    await page.waitForFunction(
      () => Number(document.querySelector('#trace-replay-canvas')?.dataset.replayTime) > 0.15,
    );
    await page.locator('#trace-replay-play').click();
    const time = await page.locator('#trace-replay-canvas').getAttribute('data-replay-time');
    await page.waitForTimeout(120);
    assert.equal(await page.locator('#trace-replay-canvas').getAttribute('data-replay-time'), time);
    await page.locator('#trace-replay-seek').evaluate((el) => {
      el.value = '1';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForFunction(
      () => Number(document.querySelector('#trace-replay-canvas')?.dataset.replayTime) === 1,
    );
    await page.locator('#trace-replay-speed').selectOption('2');
    await page.locator('[data-replay-trace]').first().uncheck();
    await page.waitForFunction(
      () => document.querySelector('#trace-replay-canvas')?.dataset.markerCount === '1',
    );
    await page.screenshot({ path: path.resolve(__dirname, '../test-output/2.5.4-replay.png') });
    await page.locator('#trace-replay-back').click();
    await page.locator('#trace-close').click();
    assert.deepEqual(
      await page.evaluate(() => window.__ROOM_LAB__.snapshot().project),
      beforeReplay,
    );
    await page.locator('#play-room').click();
    await page.waitForTimeout(200);
    await page.locator('#play-retry').click();
    await page.waitForTimeout(180);
    await page.locator('#play-retry').click();
    await page.waitForTimeout(180);
    await page.locator('#play-edit').click();
    assert.equal(await page.locator('[data-exit-life]').count(), 3);
    await page.locator('#exit-trace-invert').click();
    assert.equal(await page.locator('[data-exit-life]:checked').count(), 0);
    await page.locator('[data-exit-life]').first().check();
    await page.locator('#exit-trace-invert').click();
    assert.equal(await page.locator('[data-exit-life]:checked').count(), 2);
    await page.locator('#exit-trace-all').click();
    assert.equal(await page.locator('[data-exit-life]:checked').count(), 3);
    await page.locator('[data-exit-life-name="1"]').fill('成功路线');
    await page.locator('[data-exit-life-name="2"]').fill('');
    await page.locator('[data-exit-life-name="3"]').fill('第三次尝试');
    await page
      .locator('#dialog')
      .screenshot({ path: path.resolve(__dirname, '../test-output/2.5.4-save-paths.png') });
    await page.getByRole('button', { name: '保存路径并退出', exact: true }).click();
    await page.locator('#play-room').waitFor();
    assert.equal(
      (
        await page.evaluate(
          () =>
            window.__ROOM_LAB__.snapshot().project.courses[0].rooms.find((r) => r.id === 'jet-room')
              .playTraces,
        )
      ).length,
      5,
    );
    assert.deepEqual(
      (
        await page.evaluate(
          () =>
            window.__ROOM_LAB__.snapshot().project.courses[0].rooms.find((r) => r.id === 'jet-room')
              .playTraces,
        )
      )
        .slice(-3)
        .map((t) => t.name),
      ['成功路线', '2', '第三次尝试'],
    );
    await page.locator('#play-room').click();
    await page.waitForTimeout(180);
    await page.locator('#play-traces').click();
    const elapsed = await page.evaluate(() => window.__ROOM_LAB__.snapshot().game.elapsed);
    await page.locator('[data-trace-replay]').first().click();
    await page.locator('#trace-replay-play').click();
    await page.waitForTimeout(180);
    assert.equal(await page.evaluate(() => window.__ROOM_LAB__.snapshot().game.elapsed), elapsed);
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await page.waitForFunction((t) => window.__ROOM_LAB__.snapshot().game.elapsed > t, elapsed);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        features254: true,
        packaged: !!process.env.EDITOR_EXE,
        multiRoomImport: true,
        overwriteConfirmation: true,
        independentCopy: true,
        connections: true,
        undo: true,
        tabDrag: true,
        zoomPreserved: true,
        replayPlaybackPauseSeekSpeed: true,
        multiReplay: true,
        gamePausedDuringReplay: true,
        saveSelectAllInvert: true,
        customSaveNames: true,
        renameKeepsTraceData: true,
      }),
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
