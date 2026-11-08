'use strict';
const assert = require('node:assert/strict'),
  http = require('node:http'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { format, newWorkspaceKey } = require('../src/cloud/connection.cjs'),
  M = require('../src/project/model.cjs');
(async () => {
  const { storageFixture } = await import('../../room-cloud/tests/storage-fixture.mjs'),
    { handle } = await import('../../room-cloud/lib/sync-handler.mjs');
  const storage = storageFixture();
  const server = http.createServer(async (req, res) => {
    try {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const b = Buffer.concat(chunks);
      const response = await handle(
        new Request('http://localhost' + req.url, {
          method: req.method,
          headers: req.headers,
          ...(b.length ? { body: b } : {}),
        }),
        storage,
      );
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (e) {
      res.writeHead(500).end(String(e));
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const key = format({
      endpoint: 'http://127.0.0.1:' + server.address().port,
      workspaceKey: newWorkspaceKey(),
      accessToken: 'test-room-library',
    }),
    apps = [],
    errors = [];
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'room-lib-ui-')), 'level.json');
  fs.writeFileSync(file, JSON.stringify(M.themedExample()));
  const api = (page, name, data = {}) =>
    page.evaluate(({ name, data }) => window.desktopAPI.cloud(name, data), { name, data });
  try {
    for (let i = 0; i < 2; i++) {
      const env = { ...process.env, ROOM_EDITOR_TEST: '1' };
      delete env.ELECTRON_RUN_AS_NODE;
      const app = await _electron.launch({
        executablePath: process.env.EDITOR_EXE || require('electron'),
        args: process.env.EDITOR_EXE ? [] : [path.resolve(__dirname, '..')],
        env,
      });
      apps.push(app);
      const page = await app.firstWindow();
      page.on('pageerror', (e) => errors.push(e.message));
      await page.waitForFunction(() => !!window.__ROOM_LAB__);
      await page.locator('#project-file').setInputFiles(file);
      await api(page, 'connect', { key });
      await page.locator('[data-enter="physics"]').click();
      await page.locator('[data-tab="rooms"]').click();
      await page.locator('[data-room]').first().click();
    }
    const a = await apps[0].firstWindow(),
      b = await apps[1].firstWindow(),
      snap = (p) => p.evaluate(() => window.__ROOM_LAB__.snapshot());
    const beforeA = await snap(a),
      beforeB = await snap(b),
      statusA = await api(a, 'status');
    const open = async (p) => {
      await p.locator('[aria-controls="menu-project"]').click();
      await p.locator('#cloud-room-library').click();
      await p.locator('#room-cloud-refresh:not([disabled])').waitFor();
    };
    await open(a);
    await a.locator('#room-cloud-upload').click();
    await a.locator('#room-cloud-import').waitFor();
    assert.equal(await a.locator('[data-library-room]').count(), 1);
    const uploadedState = await snap(a);
    assert.deepEqual(uploadedState.project, beforeA.project);
    assert.equal(uploadedState.state.route, 'room');
    assert.equal(uploadedState.state.roomId, beforeA.state.roomId);
    const after = await api(a, 'status');
    assert.equal(after.current, statusA.current);
    assert.equal(after.history.length, statusA.history.length);
    await open(b);
    await b.locator('[data-library-room]').click();
    await b.locator('#room-cloud-import').waitFor();
    await b.screenshot({
      path: path.resolve(__dirname, '../test-output/room-library-build19.png'),
    });
    const graph = b.locator('#room-cloud-graph'),
      box = await graph.boundingBox();
    await b.mouse.move(box.x + 20, box.y + 20);
    await b.mouse.wheel(0, -200);
    assert.equal(await b.locator('[data-library-room]').count(), 1);
    await b.locator('#room-cloud-import').click();
    await b.locator('[data-room-import-mode]').selectOption('independent');
    await b.getByRole('button', { name: '导入到大关', exact: true }).click();
    await b.waitForFunction(
      (n) => window.__ROOM_LAB__.snapshot().project.courses[0].rooms.length === n,
      beforeB.project.courses[0].rooms.length + 1,
    );
    const imported = await snap(b);
    assert.equal(imported.project.courses[0].rooms[0].id, beforeB.project.courses[0].rooms[0].id);
    assert.equal(
      new Set(imported.project.courses[0].rooms.map((r) => r.id)).size,
      imported.project.courses[0].rooms.length,
    );
    assert.equal((await api(b, 'status')).history.length, 0);
    assert.deepEqual(errors, []);
    console.log(
      'PASS two packaged clients: upload, same-key room graph, pan/zoom, preview, independent import, no version/tree/navigation changes',
    );
  } finally {
    for (const app of apps) await app.close();
    await new Promise((r) => server.close(r));
    storage.close();
  }
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
