'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  path = require('node:path'),
  fs = require('node:fs/promises'),
  { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
let browser;
test.before(async () => {
  browser = await chromium.launch({ headless: true, channel: 'msedge' });
});
test.after(async () => browser?.close());
async function open(t, room = 'rail-room') {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  t.after(() => page.close());
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.addInitScript(() => {
    window.nodeLabels = [];
    window.nodeMetrics = [];
    const old = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
      if (this.canvas.id === 'room-canvas' && /^(0|[IVXLCDM]+)$/.test(text)) {
        window.nodeLabels.push(text);
        window.nodeMetrics.push({ text, font: this.font, scale: this.getTransform().a });
        if (window.nodeMetrics.length > 300) window.nodeMetrics.splice(0, 100);
        if (window.nodeLabels.length > 300) window.nodeLabels.splice(0, 100);
      }
      return old.call(this, text, ...args);
    };
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
const snap = (page) => page.evaluate(() => window.__ROOM_LAB__.snapshot());
test('thermal initial temperature can be configured in the UI and applied at play start', async (t) => {
  const page = await open(t, 'ice-room');
  await click(page, 3.5, 14.5);
  await page.locator('[data-inspector="behavior"]').click();
  assert.equal(await page.locator('#param-initialState').count(), 1);
  await page.locator('#param-initialState').selectOption('cold');
  await page.locator('#apply-behavior').click();
  await page.locator('#play-room').click();
  assert.equal((await snap(page)).game.zones['cold-zone'], 'cold');
});
async function point(page, x, y) {
  return page.evaluate(
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
}
async function click(page, x, y) {
  const p = await point(page, x, y);
  await page.mouse.click(p.x, p.y);
}
async function drag(page, x, y, xx, yy) {
  const a = await point(page, x, y),
    b = await point(page, xx, yy);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
}
test('node graph manages ordered children with exact coordinates, reorder, and Roman labels', async (t) => {
  const page = await open(t);
  await click(page, 6.5, 15.5);
  assert.equal(await page.locator('[data-inspector="nodes"]').count(), 1);
  await page.locator('[data-inspector="nodes"]').click();
  assert.equal(await page.locator('[data-node-id]').count(), 2);
  assert.equal(await page.locator('#rail-node-preview').count(), 1);
  await page.locator('[data-node-id]').nth(1).click();
  await page.locator('#rail-node-x').fill('16.25');
  await page.locator('#rail-node-y').fill('12.75');
  await page.locator('#rail-node-apply').click();
  let s = await snap(page),
    o = s.project.courses[0].rooms[2].objects[0];
  assert.equal(o.params.path[1].x, 16.25);
  assert.equal(o.params.path[1].y, 12.75);
  const id = o.params.path[1].id;
  await page.locator('#rail-node-up').click();
  assert.equal((await snap(page)).project.courses[0].rooms[2].objects[0].params.path[0].id, id);
  await page.locator('#rail-node-add').click();
  assert.equal(await page.locator('[data-node-id]').count(), 3);
  await page.waitForFunction(() => window.nodeLabels.includes('II'));
  await page.locator('#rail-node-place').click();
  await click(page, 12.5, 10);
  assert.equal(await page.locator('[data-node-id]').count(), 4);
  await page.waitForFunction(() => window.nodeLabels.includes('III'));
  await fs.mkdir(path.resolve(__dirname, '../test-output'), { recursive: true });
  await page.screenshot({ path: path.resolve(__dirname, '../test-output/rail-node-manager.png') });
});
test('child nodes drag after zoom, undo as one change, and follow their owner', async (t) => {
  const page = await open(t);
  await click(page, 6.5, 15.5);
  assert.equal(await page.locator('[data-inspector="nodes"]').count(), 1);
  await page.locator('[data-inspector="nodes"]').click();
  const canvas = await page.locator('#room-canvas').boundingBox();
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  await page.mouse.wheel(0, -160);
  await drag(page, 17.5, 15, 16, 12);
  let o = (await snap(page)).project.courses[0].rooms[2].objects[0];
  assert.equal(o.params.path[1].x, 16);
  assert.equal(o.params.path[1].y, 12);
  await page.locator('#undo').click();
  o = (await snap(page)).project.courses[0].rooms[2].objects[0];
  assert.equal(o.params.path[1].x, 17.5);
  await page.locator('[data-inspector="base"]').click();
  await page.locator('#object-x').fill('7');
  await page.locator('#apply-object').click();
  o = (await snap(page)).project.courses[0].rooms[2].objects[0];
  assert.equal(o.params.path[0].x, 7.5);
  assert.equal(o.params.path[1].x, 18.5);
});
test('inline key hints toggle beside help and do not modify the project', async (t) => {
  const page = await open(t);
  assert.equal(await page.locator('#room-hints').count(), 1);
  const before = (await snap(page)).project;
  assert.ok(await page.locator('[data-tool="select"] .key-hint').isVisible());
  await page.locator('#room-hints').click();
  assert.ok(!(await page.locator('[data-tool="select"] .key-hint').isVisible()));
  await page.locator('#room-hints').click();
  assert.ok(await page.locator('#undo .key-hint').isVisible());
  assert.deepEqual((await snap(page)).project, before);
});
test('thermal zone corners resize in the canvas and undo preserves thermal associations', async (t) => {
  const page = await open(t, 'ice-room');
  await click(page, 9.5, 9.5);
  assert.equal((await snap(page)).state.selection.kind, 'zones');
  const a = await point(page, 4, 8);
  await page.mouse.move(a.x, a.y);
  assert.equal(await page.locator('#room-canvas').evaluate((c) => c.style.cursor), 'nwse-resize');
  await drag(page, 4, 8, 2, 6);
  let r = (await snap(page)).project.courses[0].rooms[1];
  assert.deepEqual([r.zones[0].x, r.zones[0].y, r.zones[0].w, r.zones[0].h], [2, 6, 12, 11]);
  assert.equal(r.objects.find((o) => o.type === 'physics.thermal').params.zoneId, r.zones[0].id);
  await page.screenshot({
    path: path.resolve(__dirname, '../test-output/zone-resize-handles.png'),
  });
  await page.locator('#undo').click();
  r = (await snap(page)).project.courses[0].rooms[1];
  assert.deepEqual([r.zones[0].x, r.zones[0].y, r.zones[0].w, r.zones[0].h], [4, 8, 10, 9]);
});

test('node zero and Roman markers scale their visible text with the room zoom', async (t) => {
  const page = await open(t);
  await page.waitForFunction(() => window.nodeMetrics.some((n) => n.text === '0'));
  const before = await page.evaluate(() => window.nodeMetrics.filter((n) => n.text === '0').at(-1));
  const c = await page.locator('#room-canvas').boundingBox();
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
  await page.mouse.wheel(0, -350);
  await page.waitForFunction(
    (scale) => window.nodeMetrics.filter((n) => n.text === '0').at(-1)?.scale > scale,
    before.scale,
  );
  const after = await page.evaluate(() => window.nodeMetrics.filter((n) => n.text === '0').at(-1));
  assert.equal(before.font, after.font);
  assert.ok(after.scale > before.scale * 1.3);
});

test('thermal zone remains available beside the controller and creates a resizable region', async (t) => {
  const page = await open(t, 'ice-room'),
    button = page.locator('[data-tool="zone"]');
  const box = await button.boundingBox(),
    viewport = page.viewportSize();
  assert.ok(box.x >= 0 && box.x + box.width < viewport.width);
  const before = (await snap(page)).project.courses[0].rooms[1].zones.length;
  await button.click();
  await drag(page, 18.5, 3.5, 21.5, 6.5);
  const r = (await snap(page)).project.courses[0].rooms[1];
  assert.equal(r.zones.length, before + 1);
  assert.equal(r.zones.at(-1).w, 4);
});
