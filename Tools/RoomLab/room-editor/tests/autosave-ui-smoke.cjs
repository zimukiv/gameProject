'use strict';
// Browser renderer smoke for minute autosave: in the browser there is no project
// file, so a tick only refreshes the local draft/artwork and the visible status;
// it must never start a download and must keep the current route/view. A second
// page mocks the native IPC to check the recovery-snapshot label. Uses the built
// page only; run `node scripts/build.cjs` first.
const assert = require('node:assert/strict'),
  path = require('node:path'),
  { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = 'file:///' + path.resolve(__dirname, '../build/index.html').replace(/\\/g, '/');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const errors = [],
    downloads = [];
  try {
    // 1. Browser local draft: no desktopAPI, so autosave persists draft + artwork.
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('download', (download) => downloads.push(download.suggestedFilename()));
    await page.goto(url);
    await page.locator('#start-new').click();
    await page.locator('#graph').waitFor();
    await page.locator('#project-settings').click();
    await page.locator('#project-notes').fill('浏览器自动保存备注');
    await page.locator('#dialog-actions .primary').click();
    const before = await page.evaluate(() => window.__ROOM_LAB__.snapshot().state);
    const local = await page.evaluate(() => window.__ROOM_LAB__.autosaveTick());
    assert.equal(local.mode, 'local');
    assert.match(
      await page.locator('#autosave-status').textContent(),
      /^自动保存 \d{2}:\d{2}:\d{2}$/,
    );
    assert.match(await page.locator('#autosave-status').getAttribute('title'), /浏览器本地草稿/);
    const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('ddl-room-lab-v2')));
    assert.equal(draft.notes, '浏览器自动保存备注');
    assert.deepEqual(await page.evaluate(() => window.__ROOM_LAB__.snapshot().state), before);
    assert.equal(await page.evaluate(() => window.__ROOM_LAB__.autosaveTick()), null);
    assert.deepEqual(downloads, [], 'autosave never triggers a file download');
    await page.close();

    // 2. Recovery snapshot: a native adapter without a chosen file only reports a
    //    local recovery location, never a user file.
    const recovered = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
    await recovered.addInitScript(() => {
      window.desktopAPI = {
        autosaveProject: async () => ({
          ok: true,
          mode: 'recovery',
          at: Date.now(),
          file: 'C:/profile/RoomLabRecovery/project-1/project.json',
          conflict: false,
          warning: '尚未选择项目文件',
        }),
      };
    });
    recovered.on('pageerror', (error) => errors.push(error.message));
    await recovered.goto(url);
    await recovered.locator('#start-new').click();
    await recovered.locator('#graph').waitFor();
    await recovered.locator('#project-settings').click();
    await recovered.locator('#project-notes').fill('无文件自动保存');
    await recovered.locator('#dialog-actions .primary').click();
    const result = await recovered.evaluate(() => window.__ROOM_LAB__.autosaveTick());
    assert.equal(result.mode, 'recovery');
    const text = await recovered.locator('#autosave-status').textContent();
    assert.match(text, /^自动保存 \d{2}:\d{2}:\d{2}$/);
    assert.match(await recovered.locator('#autosave-status').getAttribute('title'), /本机恢复快照/);
    assert.match(
      await recovered.locator('#autosave-status').getAttribute('title'),
      /RoomLabRecovery/,
    );
    await recovered.close();
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        result: 'PASS',
        browserLocalDraft: true,
        noDownload: true,
        uiPreserved: true,
        recoveryLabel: true,
        errors,
      }),
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error.stack);
  process.exit(1);
});
