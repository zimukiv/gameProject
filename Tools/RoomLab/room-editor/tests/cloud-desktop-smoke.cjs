'use strict';
const assert = require('node:assert/strict'),
  path = require('node:path'),
  fs = require('node:fs/promises'),
  { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { format, newWorkspaceKey } = require('../src/cloud/connection.cjs');
const cloud = (p, name, data) =>
  p.evaluate(({ name, data }) => window.desktopAPI.cloud(name, data), { name, data });
async function launch() {
  const env = { ...process.env, ROOM_EDITOR_TEST: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({
      executablePath: process.env.EDITOR_EXE || require('electron'),
      args: process.env.EDITOR_EXE ? [] : [path.resolve(__dirname, '..')],
      env,
    }),
    page = await app.firstWindow();
  await page.waitForFunction(() => !!window.__ROOM_LAB__);
  return { app, page };
}
async function mode(page, value) {
  await page.locator('#open-cloud').click();
  await page.locator('#cloud-mode').selectOption(value);
  await page.waitForFunction(
    (value) => document.querySelector('#cloud-mode')?.value === value,
    value,
  );
  await page.getByRole('button', { name: '关闭', exact: true }).click();
}
async function room(page) {
  await page.getByRole('button', { name: '进入大关 →', exact: true }).click();
  await page.getByRole('button', { name: '房间列表', exact: true }).click();
  await page.getByRole('button', { name: '编辑房间', exact: true }).first().click();
}
(async () => {
  const a = await launch(),
    b = await launch(),
    errors = [];
  for (const { page } of [a, b]) page.on('pageerror', (e) => errors.push(e.message));
  try {
    const key = format({
      endpoint: 'http://127.0.0.1:18859',
      accessToken: 'local-desktop-acceptance',
      workspaceKey: newWorkspaceKey(),
    });
    for (const { page } of [a, b]) {
      await page.locator('#open-cloud').click();
      await page.locator('#cloud-key').fill(key);
      await page.locator('#cloud-connect').click();
      await page.waitForFunction(() =>
        document.querySelector('.cloud-status')?.textContent.includes('已连接'),
      );
      await page.getByRole('button', { name: '关闭', exact: true }).click();
    }
    await a.page.locator('#open-cloud').click();
    await a.page.locator('#cloud-version-name').fill('根版本');
    await a.page.locator('#cloud-sync').click();
    await a.page.waitForFunction(() =>
      document.querySelector('#cloud-graph-stage')?.textContent.includes('根版本'),
    );
    await a.page.getByRole('button', { name: '关闭', exact: true }).click();
    const sa = await cloud(a.page, 'status'),
      root = sa.history[0].id;
    await b.page.locator('#open-cloud').click();
    await b.page.locator('#cloud-remote').click();
    await b.page.locator(`[data-cloud-node="${root}"]`).click();
    await b.page.locator('#cloud-node-checkout').click();
    if (await b.page.getByRole('button', { name: '不保存并继续', exact: true }).isVisible())
      await b.page.getByRole('button', { name: '不保存并继续', exact: true }).click();
    await b.page.locator('#cloud-mode').waitFor();
    await b.page.locator(`[data-cloud-node="${root}"].current`).waitFor();
    await b.page.getByRole('button', { name: '关闭', exact: true }).click();
    for (const { page } of [a, b]) {
      await mode(page, 'live');
      await room(page);
    }
    await a.page.waitForFunction(
      () => document.getElementById('open-cloud').textContent.includes('2 端'),
      { timeout: 20000 },
    );
    await a.page.locator('[data-block-type="common.small"]').click();
    const box = await a.page.locator('#room-canvas').boundingBox();
    await a.page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.3);
    await b.page.waitForFunction(
      () =>
        window.__ROOM_LAB__
          .snapshot()
          .project.courses[0].rooms[0].objects.some((o) => o.type === 'common.small'),
      { timeout: 20000 },
    );
    assert.equal((await cloud(a.page, 'status')).history.length, 1);
    assert.equal((await cloud(b.page, 'status')).history.length, 1);
    for (const { page } of [a, b]) await mode(page, 'manual');
    for (const [label, { page }] of [
      ['A', a],
      ['B', b],
    ]) {
      await page.locator('#open-cloud').click();
      await page.locator('#cloud-version-name').fill(label + ' 子分支');
      await page.locator('#cloud-sync').click();
      await page.waitForFunction(
        (label) =>
          document.querySelector('#cloud-graph-stage')?.textContent.includes(label + ' 子分支'),
        label,
      );
      const s = await cloud(page, 'status');
      assert.equal(s.history.find((r) => r.message === label + ' 子分支').parent, root);
      await page.getByRole('button', { name: '关闭', exact: true }).click();
    }
    await a.page.locator('#open-cloud').click();
    const n = (await cloud(a.page, 'status')).history.length;
    assert.equal(await a.page.locator('#worktree-forest,.cloud-history,#cloud-fork').count(), 0);
    await a.page.locator(`[data-cloud-node="${root}"]`).click();
    await a.page.locator('#cloud-node-checkout').click();
    if (await a.page.getByRole('button', { name: '不保存并继续', exact: true }).isVisible())
      await a.page.getByRole('button', { name: '不保存并继续', exact: true }).click();
    await a.page.locator('#cloud-mode').waitFor();
    await a.page.locator(`[data-cloud-node="${root}"].current`).waitFor();
    assert.equal((await cloud(a.page, 'status')).history.length, n);
    await a.page.locator('#dialog-content').evaluate((e) => (e.scrollTop = 0));
    await fs.mkdir(path.resolve(__dirname, '../test-output'), { recursive: true });
    const png = await a.app.evaluate(async ({ BrowserWindow }) =>
      (
        await BrowserWindow.getAllWindows()[0].webContents.capturePage(undefined, {
          stayHidden: true,
        })
      ).toDataURL(),
    );
    await fs.writeFile(
      path.resolve(__dirname, '../test-output/cloud-worktrees.png'),
      Buffer.from(png.split(',')[1], 'base64'),
    );
    const status = await cloud(a.page, 'status');
    assert.ok(
      !(await fs.readFile(path.join(status.localPath, 'repository.json'), 'utf8')).includes(
        'local-desktop-acceptance',
      ),
    );
    assert.ok((await fs.readFile(path.join(status.localPath, 'connection.vault'))).length);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        ok: true,
        packaged: !!process.env.EDITOR_EXE,
        twoDesktopClients: true,
        liveUI: true,
        noAutoVersions: true,
        manualChildBranches: true,
        cloudVersionSwitch: true,
        encryptedKey: true,
        errors,
      }),
    );
  } finally {
    await a.app.close();
    await b.app.close();
  }
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
