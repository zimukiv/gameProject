'use strict';
const assert = require('node:assert/strict'),
  path = require('node:path'),
  fs = require('node:fs/promises');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' }),
    page = await browser.newPage({ viewport: { width: 1500, height: 1050 } }),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const snap = () => page.evaluate(() => window.__ROOM_LAB__.snapshot());
  const grid = async (x, y) => {
    const data = await page.evaluate(() => ({
      view: window.__ROOM_LAB__.snapshot().state.roomView,
      rect: {
        x: document.getElementById('room-canvas').getBoundingClientRect().x,
        y: document.getElementById('room-canvas').getBoundingClientRect().y,
        w: document.getElementById('room-canvas').getBoundingClientRect().width,
        h: document.getElementById('room-canvas').getBoundingClientRect().height,
      },
      width: document.getElementById('room-canvas').width,
      height: document.getElementById('room-canvas').height,
    }));
    return {
      x:
        data.rect.x + ((data.view.x + (x + 0.5) * 32 * data.view.scale) / data.width) * data.rect.w,
      y:
        data.rect.y +
        ((data.view.y + (y + 0.5) * 32 * data.view.scale) / data.height) * data.rect.h,
    };
  };
  const clickCell = async (x, y) => {
    const p = await grid(x, y);
    await page.mouse.click(p.x, p.y);
  };
  try {
    await page.goto(
      'file:///' + path.resolve(__dirname, '../build/index.html').replace(/\\/g, '/'),
    );
    assert.equal((await snap()).project.courses.length, 1);
    await page.getByRole('button', { name: '进入大关 →', exact: true }).click();
    const rect = await page.locator('#graph').boundingBox();
    const point = (x, y) => ({
      x: rect.x + (x / 1120) * rect.width,
      y: rect.y + (y / 650) * rect.height,
    });
    let a = point(100, 110),
      b = point(135, 135);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 5 });
    await page.mouse.up();
    assert.ok((await snap()).project.courses[0].rooms[0].graph.x > 30);
    // Relink room A directly to room C through a real output→input drag.
    const state = await snap(),
      r = state.project.courses[0].rooms[0];
    const D = require('../src/editor/draw.cjs'),
      out = D.graphPorts(r).exits[0],
      entry = D.graphPorts(state.project.courses[0].rooms[2]).entries[0];
    a = point(out.x, out.y);
    b = point(entry.x, entry.y);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 8 });
    await page.mouse.up();
    assert.equal(
      (await snap()).project.courses[0].connections.find((e) => e.from.roomId === 'jet-room').to
        .roomId,
      'rail-room',
    );
    await page.getByRole('button', { name: '房间列表', exact: true }).click();
    await page.getByRole('button', { name: '编辑房间', exact: true }).first().click();
    await page.locator('#room-name').fill('喷气测试房');
    await page.locator('#room-notes').fill('维护备注：确认喷气后跳到上层');
    await page.locator('#room-cols').fill('34');
    await page.getByRole('button', { name: '应用房间设置', exact: true }).click();
    assert.equal((await snap()).project.courses[0].rooms[0].cols, 34);
    assert.equal((await snap()).project.courses[0].rooms[0].name, '喷气测试房');
    const original = (await snap()).project.courses[0].rooms[0].tiles.length;
    await page.getByRole('button', { name: '▦ 地形', exact: true }).click();
    await clickCell(7, 4);
    assert.equal((await snap()).project.courses[0].rooms[0].tiles.length, original + 1);
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    assert.equal((await snap()).project.courses[0].rooms[0].tiles.length, original);
    await page.locator('#room-cols').fill('16');
    await page.getByRole('button', { name: '应用房间设置', exact: true }).click();
    await page.getByRole('button', { name: '保留越界并应用', exact: true }).click();
    const shrunk = await snap();
    assert.equal(shrunk.project.courses[0].rooms[0].cols, 16);
    assert.equal(shrunk.project.courses[0].rooms[0].exits[0].x, 28);
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    assert.equal((await snap()).project.courses[0].rooms[0].cols, 34);
    await page.getByRole('button', { name: '↖ 选择', exact: true }).click();
    await clickCell(10, 14);
    await page.getByRole('button', { name: '行为', exact: true }).click();
    await page.locator('#param-launchY').fill('-1000');
    await page.getByRole('button', { name: '应用行为', exact: true }).click();
    assert.equal(
      (await snap()).project.courses[0].rooms[0].objects.find((o) => o.id === 'jet-a').params
        .launchY,
      -1000,
    );
    await page.reload();
    const reopened = await snap();
    assert.equal(reopened.project.courses[0].rooms[0].name, '喷气测试房');
    assert.equal(reopened.project.courses[0].rooms[0].cols, 34);
    await page.getByRole('button', { name: '进入大关 →', exact: true }).click();
    await page.screenshot({
      path: path.resolve(__dirname, '../test-output/phase2.png'),
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        phase: 2,
        result: 'PASS',
        graphDrag: true,
        wiring: true,
        roomNamesNotes: true,
        resize: true,
        outsidePreserved: true,
        paintUndo: true,
        parameterSchema: true,
        draftReload: true,
        errors,
      }),
    );
  } catch (e) {
    console.error('UI STATE', JSON.stringify((await snap()).state));
    await page.screenshot({
      path: path.resolve(__dirname, '../test-output/failure.png'),
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
