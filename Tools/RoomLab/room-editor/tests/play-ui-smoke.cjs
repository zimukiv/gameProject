'use strict';
const assert = require('node:assert/strict'),
  path = require('node:path'),
  { chromium, _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  let browser, electronApp, page;
  const errors = [];
  const snap = () => page.evaluate(() => window.__ROOM_LAB__.snapshot().game);
  async function walk(x) {
    const s = await snap(),
      room = s.roomId,
      right = s.player.x < x,
      key = right ? 'KeyD' : 'KeyA';
    await page.keyboard.down(key);
    await page.waitForFunction(
      ({ x, right, room }) => {
        const g = window.__ROOM_LAB__.snapshot().game;
        return (
          g.mode !== 'playing' ||
          g.roomId !== room ||
          g.deaths > 0 ||
          (right ? g.player.x >= x - 8 : g.player.x <= x + 8)
        );
      },
      { x, right, room },
      { timeout: 10000, polling: 'raf' },
    );
    await page.keyboard.up(key);
    assert.equal((await snap()).deaths, 0);
  }
  try {
    if (process.env.EDITOR_EXE) {
      const env = { ...process.env, ROOM_EDITOR_TEST: '1' };
      delete env.ELECTRON_RUN_AS_NODE;
      electronApp = await _electron.launch({
        executablePath: process.env.EDITOR_EXE,
        args: [],
        env,
        timeout: 30000,
      });
      page = await electronApp.firstWindow();
      await page.waitForFunction(() => !!window.__ROOM_LAB__);
    } else {
      browser = await chromium.launch({ headless: true, channel: 'msedge' });
      page = await browser.newPage({ viewport: { width: 1450, height: 1040 } });
      await page.goto(
        'file:///' + path.resolve(__dirname, '../build/index.html').replace(/\\/g, '/'),
      );
    }
    page.on('pageerror', (e) => errors.push(e.message));
    await page.locator('#start-new').click();
    await page.evaluate(() => window.__ROOM_LAB__.openCourseWorkspace());
    await page.getByRole('button', { name: '从首房试玩', exact: true }).click();
    await walk(890);
    assert.equal((await snap()).roomId, 'ice-room');
    assert.ok((await snap()).events.some((e) => e.type === 'jet'));
    await walk(100);
    await walk(36);
    let backtrack = await snap();
    assert.equal(backtrack.roomId, 'jet-room');
    assert.ok(
      backtrack.events.some(
        (e) =>
          e.type === 'room-backtrack' && e.entryId === 'ice-room-entry' && e.exitId === 'jet-exit',
      ),
    );
    await walk(800);
    await walk(900);
    assert.equal((await snap()).roomId, 'ice-room');
    await walk(94);
    await page.waitForFunction(() => window.__ROOM_LAB__.snapshot().game.objects['ice-5'].solid, {
      timeout: 4000,
      polling: 'raf',
    });
    await page.screenshot({
      path: path.resolve(__dirname, '../test-output/ice-play.png'),
      fullPage: true,
    });
    await walk(890);
    assert.equal((await snap()).roomId, 'rail-room');
    assert.equal((await snap()).ai.active, true);
    await walk(1090);
    const result = await snap();
    assert.equal(result.mode, 'won');
    assert.equal(result.deaths, 0);
    assert.ok(result.events.some((e) => e.type === 'rail-start'));
    assert.ok(result.events.some((e) => e.type === 'rail-end'));
    assert.ok(result.score >= 60000);
    await page.screenshot({
      path: path.resolve(__dirname, '../test-output/course-won.png'),
      fullPage: true,
    });
    await page.locator('#overlay-retry').click();
    await page.waitForFunction(() => window.__ROOM_LAB__.snapshot().game.mode === 'playing');
    assert.equal((await snap()).roomId, 'rail-room');
    await page.keyboard.press('Escape');
    const paused = await snap();
    assert.equal(paused.mode, 'paused');
    await page.waitForTimeout(150);
    assert.equal((await snap()).elapsed, paused.elapsed);
    await page.locator('#play-resume').click();
    await page.locator('#play-edit').click();
    await page.getByRole('button', { name: '不保存并退出', exact: true }).click();
    assert.equal(
      (await page.evaluate(() => window.__ROOM_LAB__.snapshot())).state.roomId,
      'rail-room',
    );
    await page.getByRole('button', { name: '试玩此房', exact: true }).click();
    await page.waitForFunction(() => window.__ROOM_LAB__.snapshot().game?.developerMode === true);
    assert.equal(await page.locator('#play-paid').textContent(), '○');
    assert.equal(await page.locator('.developer-mode').count(), 1);
    await page.locator('#play-help').click();
    assert.match(await page.locator('#dialog-content').textContent(), /左右冲刺/);
    await page.getByRole('button', { name: '知道了', exact: true }).click();
    await page.keyboard.down('KeyD');
    await page.keyboard.press('ShiftLeft');
    await page.keyboard.up('KeyD');
    await page.waitForFunction(() =>
      window.__ROOM_LAB__.snapshot().game.events.some((e) => e.type === 'dash' && e.free),
    );
    assert.equal((await snap()).charges, 0);
    await page.locator('#play-edit').click();
    await page.getByRole('button', { name: '不保存并退出', exact: true }).click();
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        phase: 4,
        result: 'PASS',
        packaged: !!process.env.EDITOR_EXE,
        jet: true,
        thermalIce: true,
        acceleratedRail: true,
        entryBacktrack: true,
        aiInherits: true,
        checkpointRetry: true,
        freeDash: true,
        pause: true,
        score: result.score,
        deaths: result.deaths,
        errors,
      }),
    );
  } catch (e) {
    if (page) {
      console.error('PLAY STATE', JSON.stringify(await snap()));
      await page.screenshot({
        path: path.resolve(__dirname, '../test-output/play-failure.png'),
        fullPage: true,
      });
    }
    throw e;
  } finally {
    if (electronApp) await electronApp.close();
    if (browser) await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
