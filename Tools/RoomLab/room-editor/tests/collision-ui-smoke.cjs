'use strict';
const assert = require('node:assert/strict'),
  path = require('node:path'),
  { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true }),
    p = await b.newPage({ viewport: { width: 1600, height: 1000 } }),
    errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.addInitScript(() => {
    window.dashed = [];
    const old = CanvasRenderingContext2D.prototype.strokeRect;
    CanvasRenderingContext2D.prototype.strokeRect = function (...args) {
      if (this.canvas.id === 'room-canvas' && this.getLineDash().length)
        window.dashed.push({ args, dash: this.getLineDash() });
      if (window.dashed.length > 1000) window.dashed.splice(0, 500);
      return old.apply(this, args);
    };
  });
  try {
    await p.goto(
      'file:///' +
        path.resolve(__dirname, '../build/index.html').replace(/\\/g, '/') +
        '?preview=room&room=ice-room',
    );
    await p.waitForFunction(() => window.__ROOM_LAB__.snapshot().state.roomView);
    assert.equal(await p.locator('[data-block-type="common.aiStart"]').count(), 1);
    assert.equal(await p.locator('[data-block-type="common.aiStartHollow"]').count(), 0);
    const click = async (x, y) => {
      const v = await p.evaluate(
        ({ x, y }) => {
          const c = document.getElementById('room-canvas'),
            b = c.getBoundingClientRect(),
            v = window.__ROOM_LAB__.snapshot().state.roomView;
          return {
            x: b.x + ((v.x + x * 32 * v.scale) / c.width) * b.width,
            y: b.y + ((v.y + y * 32 * v.scale) / c.height) * b.height,
          };
        },
        { x, y },
      );
      await p.mouse.click(v.x, v.y);
    };
    await click(1.5, 14.5);
    await p.locator('[data-inspector="base"]').click();
    assert.equal(await p.locator('#object-collision').isChecked(), true);
    await p.locator('#object-collision').uncheck();
    let s = await p.evaluate(() => window.__ROOM_LAB__.snapshot());
    assert.equal(
      s.project.courses[0].rooms[1].objects.find((o) => o.id === 'wake-b').collision,
      false,
    );
    await p.waitForFunction(() =>
      window.dashed.some(
        (d) => Math.abs(d.args[0] - 33.5) < 0.01 && Math.abs(d.args[1] - 449.5) < 0.01,
      ),
    );
    await p.locator('#undo').click();
    assert.equal(
      (
        await p.evaluate(() => window.__ROOM_LAB__.snapshot())
      ).project.courses[0].rooms[1].objects.find((o) => o.id === 'wake-b').collision,
      undefined,
    );
    await click(0.5, 15.5);
    await p.locator('#object-collision').uncheck();
    assert.equal(
      (
        await p.evaluate(() => window.__ROOM_LAB__.snapshot())
      ).project.courses[0].rooms[1].tiles.find((t) => t.x === 0 && t.y === 15).collision,
      false,
    );
    await p.screenshot({ path: path.resolve(__dirname, '../test-output/collision-ghost.png') });
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        collisionUI: true,
        terrainAndFunction: true,
        dashedActualCanvas: true,
        oneAIBlock: true,
        undo: true,
        errors,
      }),
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
