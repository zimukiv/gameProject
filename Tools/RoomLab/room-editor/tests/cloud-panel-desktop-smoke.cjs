'use strict';
const assert = require('node:assert/strict'),
  http = require('node:http'),
  path = require('node:path'),
  { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'),
  { format, newWorkspaceKey } = require('../src/cloud/connection.cjs'),
  M = require('../src/project/model.cjs');

(async () => {
  const workspaceKey = newWorkspaceKey(),
    calls = [],
    branches = new Map(),
    chunks = new Map(),
    revisions = new Map([['a'.repeat(64), { id: 'a'.repeat(64), message: '测试版本' }]]);
  let blocked = false;
  const server = http.createServer(async (req, res) => {
    const parts = req.url.split('/'),
      route = parts.at(-1);
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
    if (route === 'state')
      return res.end(
        JSON.stringify({
          branches: [...branches].map(([name, head]) => ({ name, head })),
          revisions: [...revisions.values()],
        }),
      );
    if (parts.at(-2) === 'revisions') return res.end(JSON.stringify(revisions.get(route) || {}));
    if (parts.at(-2) === 'chunks' && req.method === 'GET') {
      res.setHeader('Content-Type', 'application/octet-stream');
      return res.end(chunks.get(route));
    }
    const data = [];
    for await (const bytes of req) data.push(bytes);
    const body = Buffer.concat(data);
    if (parts.at(-2) === 'chunks') {
      chunks.set(route, body);
      return res.end('{}');
    }
    const json = JSON.parse(body.toString());
    if (route === 'missing')
      return res.end(JSON.stringify({ missing: json.hashes.filter((hash) => !chunks.has(hash)) }));
    if (route === 'commit') {
      if ((branches.get(json.branch) || null) !== json.base) {
        res.statusCode = 409;
        return res.end('{}');
      }
      branches.set(json.branch, json.revision.id);
      revisions.set(json.revision.id, json.revision);
      return res.end('{}');
    }
    res.writeHead(404).end('{}');
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
    await page.locator('#start-new').click();
    await page.locator('#open-cloud').click();
    await page.locator('#cloud-version-name').fill('首次上传');
    await page.locator('#cloud-sync').click();
    const current = page.locator('[data-cloud-node].current');
    await current.filter({ hasText: '首次上传' }).waitFor();
    assert.equal(branches.size, 1);
    const [branch, first] = [...branches][0];
    await close();
    await page.locator('#project-settings').click();
    await page.locator('#project-notes').fill('普通保存推进当前分支');
    await page.locator('#dialog-actions .primary').click();
    await page.locator('#save-project').click();
    await page.locator('#status').filter({ hasText: '已保存到当前云端分支' }).waitFor();
    assert.equal(branches.size, 1);
    assert.notEqual(branches.get(branch), first);
    assert.equal(revisions.get(branches.get(branch)).parent, first);
    console.log(
      'PASS: panel retry, uploaded branch becomes current, regular Save advances the same cloud branch',
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
