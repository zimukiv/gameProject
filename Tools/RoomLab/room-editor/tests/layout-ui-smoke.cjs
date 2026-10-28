'use strict';
const assert = require('node:assert/strict'),
  path = require('node:path'),
  fs = require('node:fs/promises');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'),
  D = require('../src/editor/draw.cjs');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' }),
    page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const snap = () => page.evaluate(() => window.__ROOM_LAB__.snapshot());
  const screen = async (name) => {
    await fs.mkdir(path.resolve(__dirname, '../test-output'), { recursive: true });
    await page.screenshot({
      path: path.resolve(__dirname, '../test-output/' + name + '.png'),
      fullPage: true,
    });
  };
  const grid = async (x, y) =>
    page.evaluate(
      ({ x, y }) => {
        const s = window.__ROOM_LAB__.snapshot(),
          c = document.getElementById('room-canvas'),
          r = c.getBoundingClientRect(),
          v = s.state.roomView;
        return {
          x: r.x + ((v.x + (x + 0.5) * 32 * v.scale) / c.width) * r.width,
          y: r.y + ((v.y + (y + 0.5) * 32 * v.scale) / c.height) * r.height,
        };
      },
      { x, y },
    );
  try {
    await page.goto(
      'file:///' +
        path.resolve(__dirname, '../build/index.html').replace(/\\/g, '/') +
        '?preview=room&room=ice-room',
    );
    await page.waitForFunction(() => !!window.__ROOM_LAB__?.snapshot().state.roomView);
    await page.waitForTimeout(250);
    const canvas = await page.locator('#room-canvas').boundingBox(),
      tabs = await page.locator('.room-tabs').boundingBox();
    assert.ok(tabs.y + tabs.height < canvas.y);
    assert.ok(canvas.height > 500);
    assert.ok(canvas.width > 1200);
    await screen('room-layout-preview');
    await page.locator('#room-help').click();
    assert.equal(await page.locator('#dialog').evaluate((d) => d.open), true);
    await page.getByRole('button', { name: '知道了', exact: true }).click();
    await page.locator('[data-block-type="physics.ice"]').click();
    assert.equal(
      await page.locator('[data-block-type="physics.ice"]').getAttribute('aria-pressed'),
      'true',
    );
    for (const x of [10, 11]) {
      const p = await grid(x, 6);
      await page.mouse.click(p.x, p.y);
    }
    assert.ok(
      (await snap()).project.courses[0].rooms[1].objects.filter(
        (o) => o.type === 'physics.ice' && o.y === 6,
      ).length === 2,
    );
    await page.locator('#toggle-inspector').click();
    await page.waitForTimeout(100);
    assert.ok((await page.locator('#room-canvas').boundingBox()).width > canvas.width + 200);
    await page.locator('[data-nav-room="jet-room"]').click();
    assert.equal((await snap()).state.roomId, 'jet-room');
    await page.locator('#toggle-inspector').click();
    await page.getByRole('button', { name: '素材库', exact: true }).click();
    assert.equal(await page.locator('[data-asset-group]').count(), 6);
    assert.equal(await page.locator('.asset-card').count(), 0);
    await screen('asset-categories-preview');
    await page.locator('[data-asset-group="mechanism"]').click();
    assert.equal(await page.locator('.asset-card').count(), 0);
    await page.locator('[data-asset-sub="physics.ice"]').click();
    assert.equal(await page.locator('.asset-card').count(), 2);
    await screen('asset-subcategory-preview');
    await page.getByRole('button', { name: '物理', exact: true }).click();
    await page.getByRole('button', { name: '本关美术绑定', exact: true }).click();
    const eligible = await page
      .locator('select[data-bind-type="physics.ice"][data-slot="solid"] option')
      .evaluateAll((list) => list.map((o) => o.value));
    assert.deepEqual(eligible, ['', 'seed-ice-solid', 'seed-ice-cracked']);
    await page.getByRole('button', { name: '缩略接线板', exact: true }).click();
    const graph = await page.locator('#graph').boundingBox(),
      state = await snap(),
      c = state.project.courses[0],
      positions = JSON.stringify(c.rooms.map((r) => r.graph));
    await page.mouse.move(graph.x + graph.width * 0.55, graph.y + graph.height * 0.45);
    await page.mouse.wheel(0, -350);
    const zoom = (await snap()).state.graphView;
    assert.ok(zoom.scale > 1);
    assert.equal(
      JSON.stringify((await snap()).project.courses[0].rooms.map((r) => r.graph)),
      positions,
    );
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(graph.x + graph.width * 0.55 + 40, graph.y + graph.height * 0.45 + 25);
    await page.mouse.up({ button: 'middle' });
    assert.ok((await snap()).state.graphView.x > zoom.x);
    const point = (p) => ({
      x: graph.x + ((p.x * view.scale + view.x) / 1120) * graph.width,
      y: graph.y + ((p.y * view.scale + view.y) / 650) * graph.height,
    });
    await page.locator('#graph-fit').click();
    let view = (await snap()).state.graphView;
    const from = D.graphPorts(c.rooms[0]).exits[0],
      to = D.graphPorts(c.rooms[2]).entries[0];
    let a = point(from),
      b = point(to);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 12 });
    await page.mouse.up();
    assert.equal(
      (await snap()).project.courses[0].connections.find((e) => e.from.exitId === 'jet-exit').to
        .roomId,
      'rail-room',
    );
    await page.locator('#graph-fit').click();
    const updated = await snap(),
      wire = updated.project.courses[0].connections.find((e) => e.from.exitId === 'jet-exit'),
      curve = D.graphCurve(c, from, to);
    view = updated.state.graphView;
    const midpoint = {
        x: (from.x + 3 * curve.c1.x + 3 * curve.c2.x + to.x) / 8,
        y: (from.y + 3 * curve.c1.y + 3 * curve.c2.y + to.y) / 8,
      },
      wireClick = point(midpoint);
    await page.mouse.click(wireClick.x, wireClick.y);
    assert.equal((await snap()).state.graphSelection.id, wire.id);
    await screen('wiring-layout-preview');
    await page.setViewportSize({ width: 1100, height: 760 });
    await page.getByRole('button', { name: '房间列表', exact: true }).click();
    await page.getByRole('button', { name: '编辑房间', exact: true }).first().click();
    await page.waitForTimeout(100);
    const narrow = await page.locator('#room-canvas').boundingBox();
    assert.ok(narrow.width > 650 && narrow.height > 230);
    assert.ok(narrow.y + narrow.height <= 765);
    await screen('room-layout-narrow');
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        result: 'PASS',
        roomTabs: true,
        largeCanvas: true,
        oneClickPalette: true,
        helpDialog: true,
        assetHierarchy: true,
        categoryFiltering: true,
        graphZoomPan: true,
        scaledWiring: true,
        narrowViewport: true,
        errors,
      }),
    );
  } catch (e) {
    await screen('layout-failure');
    throw e;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
