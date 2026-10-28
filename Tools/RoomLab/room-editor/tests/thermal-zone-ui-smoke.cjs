'use strict';
const assert = require('node:assert/strict'),
  path = require('node:path'),
  { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true }),
    p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  try {
    await p.goto(
      'file:///' +
        path.resolve(__dirname, '../build/index.html').replace(/\\/g, '/') +
        '?preview=room&room=ice-room',
    );
    await p.waitForFunction(() => window.__ROOM_LAB__.snapshot().state.roomView);
    const click = async (x, y) => {
      const q = await p.evaluate(
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
      await p.mouse.click(q.x, q.y);
    };
    await click(5.5, 14.5);
    await p.locator('[data-inspector="behavior"]').click();
    assert.equal(await p.locator('#param-zoneId').count(), 0);
    await click(3.5, 14.5);
    assert.ok((await p.locator('#thermal-target-preview').textContent()).includes('8 个冰块'));
    assert.equal(await p.locator('#thermal-bind-ice').count(), 0);
    await p.locator('#param-initialState').selectOption('cold');
    await p.locator('#apply-behavior').click();
    await p.locator('#play-room').click();
    const s = await p.evaluate(() => window.__ROOM_LAB__.snapshot());
    assert.equal(s.game.zones['cold-zone'], 'cold');
    assert.ok(
      s.project.courses[0].rooms[1].objects
        .filter((o) => o.type === 'physics.ice')
        .every((o) => !('zoneId' in o.params)),
    );
    console.log(
      JSON.stringify({ iceBindingRemoved: true, spatialScopePreview: true, coldStartup: true }),
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
