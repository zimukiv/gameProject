'use strict';
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const M = require('../src/project/model.cjs'),
  R = require('../src/plugins/registry.cjs');
const A = require('../src/project/archive.cjs');
(async () => {
  const env = { ...process.env, ROOM_EDITOR_TEST: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({
    executablePath: process.env.EDITOR_EXE || require('electron'),
    args: process.env.EDITOR_EXE ? [] : [path.resolve(__dirname, '..')],
    env,
  });
  const page = await app.firstWindow(),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  async function leave() {
    await page.locator('#play-edit').click();
    await page.getByRole('button', { name: '不保存并退出', exact: true }).click();
    await page.locator('#play-room').waitFor();
  }
  async function enter(file) {
    await page.locator('#project-file').setInputFiles(file);
    await page.getByRole('button', { name: '进入大关 →', exact: true }).click();
    await page.getByRole('button', { name: '房间列表', exact: true }).click();
    await page.getByRole('button', { name: '编辑房间', exact: true }).first().click();
  }
  try {
    await page.waitForFunction(() => window.__ROOM_LAB__);
    const real =
      process.env.FRIEND_ARCHIVE ||
      path.resolve(__dirname, '../../存档/第一大关 · 物理 DDL-2.5.5/RoomLab-2.5.5-兼容存档.zip');
    await enter(real);
    const imported = await page.evaluate(() => window.__ROOM_LAB__.snapshot().project);
    const rooms = imported.courses[0].rooms;
    assert.equal(rooms.length, 11);
    assert.equal(
      rooms.flatMap((r) => r.objects).filter((o) => o.type === 'common.checkpoint').length,
      7,
    );
    assert.equal(
      rooms
        .flatMap((r) => r.objects)
        .filter((o) => o.type === 'physics.rail' && o.params.sideTrigger).length,
      12,
    );
    for (const room of rooms) {
      await page.locator(`[data-nav-room="${room.id}"]`).click();
      await page.locator('#play-room').click();
      await page.locator('#play-checkpoint').waitFor();
      assert.equal(
        (await page.evaluate(() => window.__ROOM_LAB__.snapshot().game)).roomId,
        room.id,
      );
      await page.waitForTimeout(100);
      await leave();
    }
    const p = M.example(),
      c = p.courses[0],
      r = c.rooms[0];
    c.rooms = [r];
    c.connections = [];
    r.exits = [];
    r.tiles = [];
    r.objects = [];
    r.aiPolicy = 'off';
    for (let x = 0; x < 30; x++) for (let y = 14; y < 17; y++) r.tiles.push({ x, y });
    r.entries[0].x = 1;
    r.entries[0].y = 13;
    const cp = R.instantiate(p, 'common.checkpoint', 'ui-cp', 5, 13);
    cp.collision = false;
    const rail = R.instantiate(p, 'physics.rail', 'ui-rail', 12, 13);
    rail.params.sideTrigger = true;
    r.objects = [cp, rail];
    const fixture = path.resolve(__dirname, '../test-output/2.5.5-checkpoint.zip');
    fs.writeFileSync(fixture, A.pack(p, new Map()));
    await enter(fixture);
    assert.equal(await page.locator('[data-block-type="common.checkpoint"]').count(), 1);
    await page.locator('#play-room').click();
    await page.keyboard.down('KeyD');
    await page.waitForFunction(
      () => document.querySelector('#play-checkpoint')?.textContent === '存档点',
    );
    await page.keyboard.up('KeyD');
    await page.keyboard.press('KeyR');
    await page.waitForFunction(
      () => Number(document.querySelector('#play-deaths')?.textContent) === 1,
    );
    const g = await page.evaluate(() => window.__ROOM_LAB__.snapshot().game);
    assert.ok(Math.abs(g.player.x - 164) < 2);
    assert.equal(g.player.dashCount, 0);
    await page.screenshot({ path: path.resolve(__dirname, '../test-output/2.5.5-checkpoint.png') });
    await leave();
    await page.locator('[data-tool="select"]').first().click();
    const point = await page.evaluate(() => {
      const b = document.getElementById('room-canvas').getBoundingClientRect(),
        v = window.__ROOM_LAB__.snapshot().state.roomView;
      return { x: b.x + v.x + 12.5 * 32 * v.scale, y: b.y + v.y + 13.5 * 32 * v.scale };
    });
    await page.mouse.click(point.x, point.y);
    await page.locator('[data-inspector="behavior"]').click();
    assert.equal(await page.locator('#param-sideTrigger').isChecked(), true);
    await page.locator('#param-sideTrigger').uncheck();
    await page.locator('#apply-behavior').click();
    assert.equal(
      (
        await page.evaluate(() => window.__ROOM_LAB__.snapshot().project)
      ).courses[0].rooms[0].objects.find((o) => o.id === 'ui-rail').params.sideTrigger,
      false,
    );
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        friend255: true,
        packaged: !!process.env.EDITOR_EXE,
        real11RoomsPlayable: true,
        sevenCheckpoints: true,
        twelveSideRails: true,
        checkpointWalkAndRespawn: true,
        sideToggleUI: true,
        noPageErrors: true,
      }),
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
