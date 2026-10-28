'use strict';
const assert = require('node:assert/strict'),
  path = require('node:path'),
  fs = require('node:fs'),
  { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'),
  C = require('../src/cloud/codec.cjs'),
  { Remote, format, newWorkspaceKey } = require('../src/cloud/connection.cjs'),
  M = require('../src/project/model.cjs'),
  { seeds } = require('../src/assets/seeds.cjs'),
  { unzipSync } = require('fflate');
let transport;
(async () => {
  const connection = {
      endpoint: process.env.ROOM_CLOUD_PREVIEW || 'http://127.0.0.1:18859',
      workspaceKey: newWorkspaceKey(),
      accessToken: 'isolated-local-library-test',
    },
    browserTransport = process.env.ROOM_CLOUD_BROWSER_TRANSPORT
      ? await require('./browser-cloud-transport.cjs').open(connection.endpoint)
      : null,
    remote = new Remote(connection, browserTransport?.fetcher),
    seed = seeds(),
    p = M.example();
  transport = browserTransport;
  p.assets = seed.assets;
  p.courses[0].artBindings = seed.bindings;
  const revisions = [];
  for (let i = 0; i < 6; i++) {
    p.notes = 'isolated version ' + i;
    const snap = C.encode(p, seed.files),
      r = C.revision(
        snap,
        'test-device',
        i === 0 ? '初始关卡' : '关卡修改 ' + i,
        i === 0 ? null : revisions[i < 4 ? 0 : i - 1].id,
      );
    await remote.upload(snap, r, 'test/save-' + i, null);
    revisions.push(r);
  }
  const browser = await chromium.launch({ headless: true, channel: 'msedge' }),
    page = await browser.newPage({ viewport: { width: 1460, height: 1080 } }),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(connection.endpoint);
    await page.locator('#workspace-key').fill(format(connection));
    await page.getByRole('button', { name: '打开工作区', exact: true }).click();
    await page.locator('[data-version]').first().waitFor();
    assert.equal(await page.locator('[data-version]').count(), 6);
    assert.equal(await page.locator('[data-version][aria-pressed=true]').count(), 1);
    await page.locator(`[data-version="${revisions[0].id}"]`).click();
    await page.waitForFunction(
      () => document.querySelector('.detail-content h2')?.textContent === '初始关卡',
    );
    await page.locator('.project-summary strong').waitFor();
    assert.ok(
      (await page.locator('.version-meta').first().textContent()).includes(revisions[0].id),
    );
    assert.equal(await page.locator('#workspace-key').count(), 0);
    const before = await page.locator('.graph-filter>span').textContent(),
      box = await page.locator('.graph-stage').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -160);
    await page.waitForTimeout(100);
    assert.notEqual(await page.locator('.graph-filter>span').textContent(), before);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: '下载完整项目包', exact: true }).click(),
    ]);
    const file = path.resolve(__dirname, '../test-output/cloud-library-download.zip');
    await download.saveAs(file);
    const entries = unzipSync(fs.readFileSync(file));
    assert.equal(Object.keys(entries).length, 10);
    assert.equal(
      JSON.parse(Buffer.from(entries['project.json']).toString()).notes,
      'isolated version 0',
    );
    const state = await remote.state();
    assert.equal(state.branches.length, 6);
    assert.equal(state.revisions.length, 6);
    // All mutations use the random acceptance workspace created above.
    await page.locator(`[data-version="${revisions[5].id}"]`).click();
    await page.locator('#node-parent').selectOption(revisions[1].id);
    await page.locator('#apply-node-parent').click();
    await page.waitForFunction(() =>
      document.querySelector('[role=status]')?.textContent.includes('关系已更新'),
    );
    let graphState = await remote.state();
    assert.equal(
      graphState.graph.metadata.find((n) => n.id === revisions[5].id).parentId,
      revisions[1].id,
    );
    assert.equal((await remote.request('revisions/' + revisions[5].id)).parent, revisions[4].id);
    // Dragging in explicit relation mode changes parent, rather than moving files.
    await page.locator('#toggle-relation-drag').click();
    await page
      .locator(`[data-version="${revisions[5].id}"]`)
      .dragTo(page.locator(`[data-version="${revisions[2].id}"]`));
    await page.waitForFunction(() =>
      document.querySelector('[role=status]')?.textContent.includes('关系已更新'),
    );
    graphState = await remote.state();
    assert.equal(
      graphState.graph.metadata.find((n) => n.id === revisions[5].id).parentId,
      revisions[2].id,
    );
    await page.locator('#delete-cloud-node').click();
    await page.locator('#confirm-delete-cloud-node').click();
    await page.waitForFunction(() => document.querySelectorAll('[data-version]').length === 5);
    await page.locator('.cloud-trash summary').click();
    await page.locator(`[data-restore-cloud-node="${revisions[5].id}"]`).click();
    await page.waitForFunction(() => document.querySelectorAll('[data-version]').length === 6);
    await page.getByRole('button', { name: '适应全部节点', exact: true }).click();
    await page.locator(`[data-version="${revisions[0].id}"]`).click();
    await page.locator('.project-summary strong').waitFor();
    await page.screenshot({
      path: path.resolve(__dirname, '../test-output/cloud-library.png'),
      fullPage: true,
    });
    await page.getByRole('button', { name: '断开 / 更换密钥', exact: true }).click();
    assert.equal(await page.locator('[data-version]').count(), 0);
    assert.equal(await page.locator('#workspace-key').inputValue(), '');
    assert.equal(await page.evaluate(() => localStorage.length), 0);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.locator('#workspace-key').isVisible());
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 2,
    );
    assert.equal(overflow, false);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        cloudLibraryUI: true,
        nodes: 6,
        selectionHighlight: true,
        details: true,
        zoom: true,
        zipFiles: 10,
        noNewVersionsOnRead: true,
        secretNotPersisted: true,
        mobileLayout: true,
      }),
    );
  } finally {
    await browser.close();
  }
})()
  .catch((e) => {
    console.error(e.stack);
    process.exitCode = 1;
  })
  .finally(() => transport?.browser.close());
