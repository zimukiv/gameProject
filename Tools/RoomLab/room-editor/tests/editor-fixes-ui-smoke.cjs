'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  path = require('node:path'),
  fs = require('node:fs/promises');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
let browser;
test.before(async () => {
  browser = await chromium.launch({ headless: true, channel: 'msedge' });
});
test.after(async () => browser?.close());
async function pageFor(t, room = 'jet-room') {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  t.after(() => page.close());
  await page.addInitScript(() => {
    window.drawRecords = [];
    for (const method of ['drawImage', 'strokeRect']) {
      const original = CanvasRenderingContext2D.prototype[method];
      CanvasRenderingContext2D.prototype[method] = function (...args) {
        if (this.canvas.id === 'room-canvas') {
          window.drawRecords.push({
            method,
            args: method === 'drawImage' ? args.slice(1) : args,
            src: method === 'drawImage' ? args[0].src : null,
            color: this.strokeStyle,
          });
          if (window.drawRecords.length > 1200) window.drawRecords.splice(0, 600);
        }
        return original.apply(this, args);
      };
    }
  });
  await page.goto(
    'file:///' +
      path.resolve(__dirname, '../build/index.html').replace(/\\/g, '/') +
      '?preview=room&room=' +
      room,
  );
  await page.waitForFunction(() => !!window.__ROOM_LAB__?.snapshot().state.roomView);
  return page;
}
const snapshot = (page) => page.evaluate(() => window.__ROOM_LAB__.snapshot());
async function point(page, x, y) {
  return page.evaluate(
    ({ x, y }) => {
      const c = document.getElementById('room-canvas'),
        b = c.getBoundingClientRect(),
        v = window.__ROOM_LAB__.snapshot().state.roomView;
      return {
        x: b.x + ((v.x + (x + 0.5) * 32 * v.scale) / c.width) * b.width,
        y: b.y + ((v.y + (y + 0.5) * 32 * v.scale) / c.height) * b.height,
      };
    },
    { x, y },
  );
}
async function drag(page, x0, y0, x1, y1) {
  const a = await point(page, x0, y0),
    b = await point(page, x1, y1);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 3 });
  await page.mouse.up();
}
test('rail artwork uses its actual placed cell and full block height', async (t) => {
  const page = await pageFor(t, 'rail-room');
  await page.waitForTimeout(100);
  const record = await page.evaluate(() => {
    const image = document.querySelector('[data-block-type="physics.rail"] img');
    return window.drawRecords
      .filter((r) => r.method === 'drawImage' && r.src === image.src && r.args[0] === 6 * 32)
      .at(-1);
  });
  assert.ok(record);
  assert.equal(record.args[1], 15 * 32);
  assert.equal(record.args[3], 32);
});
test('block selection does not include the empty cell above its artwork', async (t) => {
  const page = await pageFor(t, 'rail-room'),
    p = await point(page, 6, 14);
  await page.mouse.click(p.x, p.y);
  assert.notEqual((await snapshot(page)).state.selection?.id, 'rail-c');
});
test('eraser removes functional blocks and a single undo restores the entire drag stroke', async (t) => {
  const page = await pageFor(t);
  await page.locator('[data-block-type="physics.rail"]').click();
  const p = await point(page, 7, 4);
  await page.mouse.click(p.x, p.y);
  const room = () => snapshot(page).then((s) => s.project.courses[0].rooms[0]);
  assert.ok(
    (await room()).objects.some((o) => o.type === 'physics.rail' && o.x === 7 && o.y === 4),
  );
  await page.keyboard.press('KeyX');
  await page.mouse.click(p.x, p.y);
  assert.ok(!(await room()).objects.some((o) => o.x === 7 && o.y === 4));
  await page.locator('#undo').click();
  assert.ok((await room()).objects.some((o) => o.x === 7 && o.y === 4));
});
test('dragging a functional block brush fills skipped cells once and undoes in one step', async (t) => {
  const page = await pageFor(t);
  await page.locator('[data-block-type="common.coin"]').click();
  await drag(page, 2, 4, 8, 4);
  const placed = (await snapshot(page)).project.courses[0].rooms[0].objects.filter(
    (o) => o.type === 'common.coin' && o.y === 4,
  );
  assert.deepEqual(
    placed.map((o) => o.x).sort((a, b) => a - b),
    [2, 3, 4, 5, 6, 7, 8],
  );
  await page.locator('#undo').click();
  assert.equal(
    (await snapshot(page)).project.courses[0].rooms[0].objects.filter((o) => o.y === 4).length,
    0,
  );
});
test('one unified AI start block is available; legacy hollow alias stays out of the palette', async (t) => {
  const page = await pageFor(t);
  assert.equal(await page.locator('[data-block-type="common.aiStart"]').count(), 1);
  assert.equal(await page.locator('[data-block-type="common.aiStartHollow"]').count(), 0);
});
test('play viewport is comparable to editing and its backing canvas matches its visible size', async (t) => {
  const page = await pageFor(t),
    editor = await page.locator('#room-canvas').boundingBox();
  await page.locator('#play-room').click();
  await page.waitForTimeout(100);
  const play = await page.locator('#play-canvas').boundingBox(),
    dimensions = await page.locator('#play-canvas').evaluate((c) => ({
      width: c.width,
      height: c.height,
      clientWidth: c.clientWidth,
      clientHeight: c.clientHeight,
    }));
  assert.ok(play.height >= editor.height - 40, JSON.stringify({ editor, play }));
  assert.ok(play.width >= editor.width - 40);
  assert.equal(dimensions.height, Math.round(dimensions.clientHeight));
  assert.equal(dimensions.width, Math.round(dimensions.clientWidth));
  assert.equal(
    await page.evaluate(() => window.scrollY),
    0,
    'entering play keeps the header visible',
  );
  await fs.mkdir(path.resolve(__dirname, '../test-output'), { recursive: true });
  await page.screenshot({ path: path.resolve(__dirname, '../test-output/play-size-fixed.png') });
});
