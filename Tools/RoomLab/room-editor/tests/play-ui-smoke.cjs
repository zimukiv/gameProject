'use strict';
const assert = require('node:assert/strict'),
  path = require('node:path'),
  { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' }),
    page = await browser.newPage({ viewport: { width: 1450, height: 1040 } }),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
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
    await page.goto(
      'file:///' + path.resolve(__dirname, '../build/index.html').replace(/\\/g, '/'),
    );
    await page.getByRole('button', { name: '进入大关 →', exact: true }).click();
    await page.getByRole('button', { name: '从首房试玩', exact: true }).click();
    await walk(890);
    assert.equal((await snap()).roomId, 'ice-room');
    assert.ok((await snap()).events.some((e) => e.type === 'jet'));
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
    await page.keyboard.down('KeyW');
    await page.keyboard.press('ShiftLeft');
    await page.keyboard.up('KeyW');
    await page.waitForFunction(() =>
      window.__ROOM_LAB__.snapshot().game.events.some((e) => e.type === 'dash' && e.free),
    );
    assert.equal((await snap()).charges, 3);
    await page.locator('#play-edit').click();
    await page.getByRole('button', { name: '不保存并退出', exact: true }).click();
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        phase: 4,
        result: 'PASS',
        jet: true,
        thermalIce: true,
        acceleratedRail: true,
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
    console.error('PLAY STATE', JSON.stringify(await snap()));
    await page.screenshot({
      path: path.resolve(__dirname, '../test-output/play-failure.png'),
      fullPage: true,
    });
    throw e;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
