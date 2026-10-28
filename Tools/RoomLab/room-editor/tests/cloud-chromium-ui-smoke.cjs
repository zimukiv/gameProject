'use strict';
const assert = require('node:assert/strict'),
  http = require('node:http'),
  path = require('node:path'),
  { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'),
  { format, newWorkspaceKey } = require('../src/cloud/connection.cjs');
(async () => {
  const workspaceKey = newWorkspaceKey(),
    accessToken = 'old-test-access-token',
    calls = [];
  const server = http.createServer((req, res) => {
    const ua = req.headers['user-agent'] || '',
      route = req.url.split('/').at(-1);
    calls.push({ route, ua, bearer: !!req.headers['oai-sites-authorization'] });
    res.setHeader('Content-Type', 'application/json');
    if (!ua.includes('Chrome')) {
      res.statusCode = 403;
      res.end(JSON.stringify({ error: 'browser network required' }));
      return;
    }
    if (route === 'health') {
      res.end(JSON.stringify({ service: 'room-lab-sync', protocol: 1, storage: true }));
      return;
    }
    if (req.headers['oai-sites-authorization']) {
      res.statusCode = 403;
      res.end(JSON.stringify({ error: 'obsolete service auth' }));
      return;
    }
    if (req.headers['x-room-workspace-key'] !== workspaceKey) {
      res.statusCode = 401;
      res.end(JSON.stringify({ error: '工作区密钥无效' }));
      return;
    }
    res.end(JSON.stringify({ branches: [], revisions: [] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const endpoint = 'http://127.0.0.1:' + server.address().port,
    env = { ...process.env, ROOM_EDITOR_TEST: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({
    executablePath: process.env.EDITOR_EXE || require('electron'),
    args: process.env.EDITOR_EXE ? [] : [path.resolve(__dirname, '..')],
    env,
  });
  try {
    const page = await app.firstWindow(),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.waitForFunction(() => window.__ROOM_LAB__);
    await page.locator('#open-cloud').click();
    await page.locator('#cloud-key').fill(format({ endpoint, workspaceKey, accessToken }));
    await page.locator('#cloud-connect').click();
    await page.waitForFunction(() =>
      document.querySelector('.cloud-status')?.textContent.includes('已连接'),
    );
    await page.locator('summary').filter({ hasText: '连接设置' }).click();
    await page.locator('#cloud-copy').click();
    const key = await app.evaluate(({ clipboard }) => clipboard.readText());
    const c = JSON.parse(Buffer.from(key.slice(8), 'base64url'));
    assert.equal(c.authMode, 'workspace');
    assert.equal(c.workspaceKey, workspaceKey);
    assert.ok(calls.some((c) => c.route === 'state' && c.bearer));
    assert.ok(calls.some((c) => c.route === 'health' && !c.bearer));
    assert.ok(calls.some((c) => c.route === 'state' && !c.bearer));
    assert.ok(calls.every((c) => c.ua.includes('Chrome')));
    await page.locator('#cloud-copy-diagnostics').click();
    await page.waitForFunction(() =>
      document.querySelector('#cloud-feedback')?.textContent.includes('诊断信息已复制'),
    );
    let text = await app.evaluate(({ clipboard }) => clipboard.readText()),
      report = JSON.parse(text);
    assert.equal(report.network.transport, 'chromium-system-network');
    assert.equal(report.network.verified, true);
    assert.equal(report.network.authMode, 'workspace');
    assert.ok(!text.includes(workspaceKey) && !text.includes(accessToken));
    await page
      .locator('#cloud-key')
      .fill(format({ endpoint, workspaceKey: newWorkspaceKey(), accessToken }));
    await page.locator('#cloud-connect').click();
    await page.waitForFunction(() =>
      document.querySelector('#cloud-feedback')?.textContent.includes('工作区密钥'),
    );
    assert.ok(
      !(await page.locator('#cloud-feedback').textContent()).includes(
        'Error invoking remote method',
      ),
    );
    await page.locator('#cloud-copy-diagnostics').click();
    await page.waitForFunction(() =>
      document.querySelector('#cloud-feedback')?.textContent.includes('诊断信息已复制'),
    );
    text = await app.evaluate(({ clipboard }) => clipboard.readText());
    report = JSON.parse(text);
    assert.equal(report.network.httpStatus, 401);
    assert.equal(report.network.responseKind, 'json');
    assert.ok(!text.includes(workspaceKey) && !text.includes(accessToken));
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        chromiumCloudUI: true,
        packaged: !!process.env.EDITOR_EXE,
        browserUserAgent: true,
        publicAuthRecovery: true,
        invalidKeyRejected: true,
        diagnosticsNoSecrets: true,
        cleanError: true,
      }),
    );
  } finally {
    await app.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
