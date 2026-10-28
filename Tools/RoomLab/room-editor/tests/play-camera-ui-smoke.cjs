'use strict';
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'),
  M = require('../src/project/model.cjs'),
  A = require('../src/project/archive.cjs');
(async () => {
  const p = M.example(),
    r = p.courses[0].rooms[0];
  r.cols = 80;
  r.rows = 17;
  r.objects = [];
  r.tiles = [];
  r.entries[0].y = 13;
  r.exits = [{ id: 'end', name: '终点', x: 78, y: 12, w: 1, h: 2 }];
  M.floor(r, 0, 79, 14);
  p.courses[0].rooms = [r];
  p.courses[0].connections = [];
  const file = path.resolve(__dirname, '../test-output/试玩视角测试.zip');
  fs.writeFileSync(file, A.pack(p, new Map()));
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
    await page.locator('#project-file').setInputFiles(file);
    await page.waitForFunction(
      () => window.__ROOM_LAB__.snapshot().project.courses[0].rooms.length === 1,
    );
    await page.getByRole('button', { name: '进入大关 →', exact: true }).click();
    await page.getByRole('button', { name: '房间列表', exact: true }).click();
    await page.getByRole('button', { name: '编辑房间', exact: true }).click();
    await page.locator('#room-settings').click();
    assert.equal(await page.locator('#room-camera-mode').inputValue(), 'room');
    const before = (await page.evaluate(() => window.__ROOM_LAB__.snapshot())).state.roomView;
    await page.locator('#room-camera-mode').selectOption('follow');
    await page.locator('#room-camera-cols').fill('20');
    await page.locator('#room-camera-rows').fill('12');
    await page.locator('#apply-room').click();
    const camera = await page.evaluate(
      () => window.__ROOM_LAB__.snapshot().project.courses[0].rooms[0].playCamera,
    );
    assert.deepEqual(camera, { mode: 'follow', cols: 20, rows: 12 });
    assert.deepEqual(
      (await page.evaluate(() => window.__ROOM_LAB__.snapshot())).state.roomView,
      before,
    );
    await page.locator('#play-room').click();
    await page.waitForFunction(
      () => window.__ROOM_LAB__.snapshot().state.playView?.mode === 'follow',
    );
    const initial = await page.evaluate(() => window.__ROOM_LAB__.snapshot().state.playView);
    assert.ok(initial.cols >= 20 && initial.cols < 80 && initial.rows >= 12);
    await page.keyboard.down('KeyD');
    await page.waitForFunction(() => window.__ROOM_LAB__.snapshot().game.player.x > 650, null, {
      timeout: 8000,
    });
    await page.keyboard.up('KeyD');
    let snap = await page.evaluate(() => window.__ROOM_LAB__.snapshot());
    assert.ok(snap.state.playView.x < initial.x);
    const width = await page.locator('#play-canvas').evaluate((c) => c.width),
      screen = snap.state.playView.x + (snap.game.player.x + 12) * snap.state.playView.scale;
    assert.ok(screen > 22 && screen < width - 22);
    await page.locator('#play-retry').click();
    await page.waitForFunction(() => window.__ROOM_LAB__.snapshot().state.playView.x >= 21.9);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(980, 740));
    await page.waitForTimeout(150);
    snap = await page.evaluate(() => window.__ROOM_LAB__.snapshot());
    assert.ok(snap.state.playView.cols >= 20 - 1e-8 && snap.state.playView.rows >= 12 - 1e-8);
    assert.notEqual(snap.state.playView.scale, initial.scale);
    await page.screenshot({
      path: path.resolve(__dirname, '../test-output/play-camera-follow.png'),
    });
    await page.locator('#play-edit').click();
    if (await page.getByRole('button', { name: '不保存并退出', exact: true }).isVisible())
      await page.getByRole('button', { name: '不保存并退出', exact: true }).click();
    await page.locator('#room-settings').click();
    assert.equal(await page.locator('#room-camera-cols').inputValue(), '20');
    await page.locator('#room-camera-mode').selectOption('room');
    await page.locator('#apply-room').click();
    await page.locator('#play-room').click();
    await page.waitForFunction(
      () => window.__ROOM_LAB__.snapshot().state.playView?.mode === 'room',
    );
    assert.equal(
      (await page.evaluate(() => window.__ROOM_LAB__.snapshot().state.playView)).cols,
      80,
    );
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        roomCameraUI: true,
        packaged: !!process.env.EDITOR_EXE,
        roomSettings: true,
        editorZoomPreserved: true,
        follow: true,
        boundaryClamp: true,
        retryRecenter: true,
        windowResize: true,
        fullRoomMode: true,
      }),
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
