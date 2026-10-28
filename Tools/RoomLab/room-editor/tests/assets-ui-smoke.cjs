'use strict';
const assert = require('node:assert/strict'),
  path = require('node:path'),
  fs = require('node:fs/promises'),
  { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' }),
    page = await browser.newPage({ viewport: { width: 1500, height: 1080 } }),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const snap = () => page.evaluate(() => window.__ROOM_LAB__.snapshot());
  try {
    await page.goto(
      'file:///' + path.resolve(__dirname, '../build/index.html').replace(/\\/g, '/'),
    );
    await page.getByRole('button', { name: '素材库', exact: true }).click();
    assert.equal((await snap()).project.assets.length, 9);
    await page.locator('[data-asset-group="mechanism"]').click();
    await page.locator('[data-asset-sub="physics.jet"]').click();
    const bytes = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#ec8045"/></svg>',
    );
    await page
      .locator('#asset-files')
      .setInputFiles({ name: '测试素材.svg', mimeType: 'image/svg+xml', buffer: bytes });
    await page.waitForFunction(() => window.__ROOM_LAB__.snapshot().project.assets.length === 10);
    const imported = (await snap()).project.assets.at(-1);
    assert.equal(imported.width, 64);
    await page.getByRole('button', { name: '项目', exact: true }).click();
    await page.getByRole('button', { name: '进入大关 →', exact: true }).click();
    await page.getByRole('button', { name: '本关美术绑定', exact: true }).click();
    await page
      .locator('select[data-bind-type="physics.jet"][data-slot="idle"]')
      .selectOption(imported.id);
    assert.equal((await snap()).project.courses[0].artBindings['physics.jet'].idle, imported.id);
    await page.getByRole('button', { name: '房间列表', exact: true }).click();
    await page.getByRole('button', { name: '编辑房间', exact: true }).first().click();
    const point = await page.evaluate(() => {
      const s = window.__ROOM_LAB__.snapshot(),
        c = document.getElementById('room-canvas'),
        b = c.getBoundingClientRect(),
        v = s.state.roomView;
      return {
        x: b.x + ((v.x + 10.5 * 32 * v.scale) / c.width) * b.width,
        y: b.y + ((v.y + 14.5 * 32 * v.scale) / c.height) * b.height,
      };
    });
    await page.mouse.click(point.x, point.y);
    await page.getByRole('button', { name: '外观', exact: true }).click();
    await page.locator('select[data-object-slot="idle"]').selectOption('seed-jet-idle');
    const current = (await snap()).project.courses[0].rooms[0].objects.find(
      (o) => o.id === 'jet-a',
    );
    assert.equal(current.assetOverrides.idle, 'seed-jet-idle');
    await page.getByRole('button', { name: '素材库', exact: true }).click();
    await page.locator('button[data-replace="' + imported.id + '"]').click();
    await page.locator('#asset-files').setInputFiles({
      name: '替换.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(bytes.toString().replace('#ec8045', '#47bdc9')),
    });
    await page.waitForFunction(
      (path) => window.__ROOM_LAB__.snapshot().project.assets.at(-1).path !== path,
      imported.path,
    );
    const latest = await snap();
    assert.equal(latest.project.assets.at(-1).id, imported.id);
    assert.equal(latest.project.courses[0].artBindings['physics.jet'].idle, imported.id);
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出项目包', exact: true }).click();
    const download = await downloadEvent,
      zipPath = path.resolve(__dirname, '../test-output/asset-project.zip');
    await download.saveAs(zipPath);
    await page.getByRole('button', { name: '新建大关', exact: true }).click();
    await page.getByRole('button', { name: '不保存并继续', exact: true }).click();
    await page.waitForFunction(() => window.__ROOM_LAB__.snapshot().project.courses.length === 2);
    await page.locator('#project-file').setInputFiles(zipPath);
    await page.waitForFunction(
      () =>
        window.__ROOM_LAB__.snapshot().project.assets.length === 10 &&
        window.__ROOM_LAB__.snapshot().project.courses.length === 1,
    );
    assert.equal((await snap()).project.courses[0].artBindings['physics.jet'].idle, imported.id);
    await page.getByRole('button', { name: '功能块', exact: true }).click();
    await page.locator('#param-launchY').fill('-1200');
    await page.getByRole('button', { name: '保存默认定义', exact: true }).click();
    assert.equal((await snap()).project.blockDefaults['physics.jet'].params.launchY, -1200);
    assert.equal(
      (await snap()).project.courses[0].rooms[0].objects.find((o) => o.id === 'jet-a').params
        .launchY,
      -900,
    );
    await page.getByRole('button', { name: '素材库', exact: true }).click();
    await page.screenshot({
      path: path.resolve(__dirname, '../test-output/phase3.png'),
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        phase: 3,
        result: 'PASS',
        imageImport: true,
        courseBinding: true,
        instanceOverride: true,
        replaceKeepsID: true,
        projectZipRoundtrip: true,
        definitionDefaults: true,
        errors,
      }),
    );
  } catch (e) {
    console.error('ASSET STATE', JSON.stringify((await snap()).state));
    await page.screenshot({
      path: path.resolve(__dirname, '../test-output/asset-failure.png'),
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
