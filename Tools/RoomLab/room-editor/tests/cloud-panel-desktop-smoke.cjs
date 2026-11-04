'use strict';
const assert = require('node:assert/strict'),
  http = require('node:http'),
  path = require('node:path'),
  { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'),
  { format, newWorkspaceKey } = require('../src/cloud/connection.cjs'),
  M = require('../src/project/model.cjs');

(async () => {
  const workspaceKey = newWorkspaceKey(),
    calls = [];
  let blocked = false;
  const server = http.createServer((req, res) => {
    const route = req.url.split('/').at(-1);
    calls.push([req.method, route]);
    if (blocked) {
      res.writeHead(403, { 'Content-Type': 'text/html' });
      return res.end('<html><title>Blocked</title></html>');
    }
    res.setHeader('Content-Type', 'application/json');
    if (route === 'health')
      return res.end(JSON.stringify({ service: 'room-lab-sync', protocol: 1, storage: true }));
    if (req.headers['x-room-workspace-key'] !== workspaceKey) {
      res.statusCode = 401;
      return res.end(JSON.stringify({ error: '工作区密钥无效' }));
    }
    res.end(
      JSON.stringify({ branches: [], revisions: [{ id: 'a'.repeat(64), message: '测试版本' }] }),
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const env = { ...process.env, ROOM_EDITOR_TEST: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({
    executablePath: process.env.EDITOR_EXE || require('electron'),
    args: process.env.EDITOR_EXE ? [] : [path.resolve(__dirname, '..')],
    env,
  });
  try {
    const page = await app.firstWindow(),
      project = M.example(),
      missing = { id: 'missing-custom', path: 'assets/missing.svg', name: '测试自定义素材' };
    await page.locator('#start-new').waitFor();
    project.assets = [missing];
    await page.evaluate((p) => localStorage.setItem('ddl-room-lab-v2', JSON.stringify(p)), project);
    await page.reload();
    await page.locator('#status').filter({ hasText: '备份缺少素材' }).waitFor();
    await page.locator('#open-cloud').click();
    await page.locator('#cloud-diagnose').waitFor({ timeout: 4000 });
    await page.locator('#cloud-key').fill(
      format({
        endpoint: 'http://127.0.0.1:' + server.address().port,
        workspaceKey,
        accessToken: 'test-panel-access-token',
      }),
    );
    await page.locator('#cloud-connect').click();
    await page.locator('[data-cloud-node]').waitFor();
    const close = () => page.getByRole('button', { name: '关闭', exact: true }).click();
    await close();
    blocked = true;
    await page.locator('#open-cloud').click();
    await page.locator('#cloud-diagnose').waitFor();
    await page.locator('#cloud-feedback').filter({ hasText: 'HTTP 403' }).waitFor();
    assert.equal(await page.locator('#cloud-remote').isEnabled(), true);
    blocked = false;
    await page.locator('#cloud-remote').click();
    await page.locator('[data-cloud-node]').waitFor();
    assert.ok(calls.some(([method, route]) => method === 'GET' && route === 'state'));
    assert.ok(calls.every(([method]) => method === 'GET'));
    await close();
    await page.evaluate(() => localStorage.removeItem('ddl-room-lab-v2'));
    await page.reload();
    await page.locator('#start-new').waitFor();
    console.log(
      'PASS: missing local assets do not block cloud panel; HTTP 403 shows in panel and retry restores graph',
    );
  } finally {
    // This is the isolated test window; it may intentionally still contain a broken draft.
    await app
      .evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.destroy()))
      .catch(() => {});
    await app.close().catch(() => {});
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
