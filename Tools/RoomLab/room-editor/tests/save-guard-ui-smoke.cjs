'use strict';
const assert = require('node:assert/strict'),
  path = require('node:path'),
  { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true }),
    page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.saveMode = 'cancel';
    window.saved = [];
    window.opened = 0;
    window.desktopAPI = {
      saveProject: async (p) => {
        if (window.saveMode === 'cancel') return null;
        if (window.saveMode === 'fail') throw Error('模拟磁盘写入失败');
        window.saved.push(p.project);
        return { session: 'test', file: 'project.json' };
      },
      openProject: async () => {
        window.opened++;
        return null;
      },
    };
  });
  try {
    await page.goto(
      'file:///' +
        path.resolve(__dirname, '../build/index.html').replace(/\\/g, '/') +
        '?preview=room',
    );
    await page.locator('[data-block-type="common.small"]').click();
    const box = await page.locator('#room-canvas').boundingBox();
    await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.32);
    const before = await page.evaluate(() => window.__ROOM_LAB__.snapshot().project);
    await page.locator('[data-menu-trigger]', { hasText: '项目' }).click();
    await page.locator('#new-project').click();
    await page.locator('[data-new-course-kind="physics"]').click();
    assert.equal(await page.locator('#dialog').isVisible(), false);
    const appended = await page.evaluate(() => window.__ROOM_LAB__.snapshot().project);
    assert.equal(appended.courses.length, before.courses.length + 1);
    assert.deepEqual(appended.courses.slice(0, -1), before.courses);
    assert.equal(await page.evaluate(() => window.saved.length), 0);
    await page.locator('[data-menu-trigger]', { hasText: '项目' }).click();
    await page.getByRole('button', { name: '打开项目', exact: true }).click();
    await page.getByRole('button', { name: '取消', exact: true }).click();
    assert.equal(await page.evaluate(() => window.opened), 0);
    await page.locator('[data-menu-trigger]', { hasText: '项目' }).click();
    await page.locator('#open-project').click();
    await page.getByRole('button', { name: '保存后继续', exact: true }).click();
    await page.locator('#save-guard-feedback').filter({ hasText: '尚未完成保存' }).waitFor();
    assert.equal(await page.evaluate(() => window.opened), 0);
    await page.evaluate(() => (window.saveMode = 'fail'));
    await page.getByRole('button', { name: '保存后继续', exact: true }).click();
    await page.locator('#save-guard-feedback').filter({ hasText: '尚未完成保存' }).waitFor();
    assert.equal(await page.evaluate(() => window.opened), 0);
    await page.evaluate(() => (window.saveMode = 'success'));
    await page.getByRole('button', { name: '保存后继续', exact: true }).click();
    await page.waitForFunction(() => window.opened === 1);
    assert.deepEqual(await page.evaluate(() => window.saved[0]), appended);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        saveGuard: true,
        cancel: true,
        diskFailure: true,
        cancelledSave: true,
        saveBeforeContinue: true,
        newCoursePreserves: true,
        newCourseWithoutSavePrompt: true,
        errors,
      }),
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
