'use strict';
const assert = require('node:assert/strict'),
  path = require('node:path'),
  fs = require('node:fs'),
  { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'),
  M = require('../src/project/model.cjs'),
  C = require('../src/cloud/codec.cjs'),
  { Remote, format, newWorkspaceKey } = require('../src/cloud/connection.cjs'),
  Archive = require('../src/project/archive.cjs');
const call = (p, name, data) =>
  p.evaluate(({ name, data }) => window.desktopAPI.cloud(name, data), { name, data });
(async () => {
  const connection = {
      endpoint: 'http://127.0.0.1:18859',
      workspaceKey: newWorkspaceKey(),
      accessToken: 'isolated-graph-desktop',
    },
    remote = new Remote(connection),
    p = M.example(),
    rs = [];
  for (let i = 0; i < 3; i++) {
    p.notes = 'desktop graph ' + i;
    const s = C.encode(p, new Map()),
      r = C.revision(s, 'desktop-graph', '设计 ' + i, i ? rs[0].id : null);
    await remote.upload(s, r, 'graph-' + i, null);
    rs.push(r);
  }
  const env = { ...process.env, ROOM_EDITOR_TEST: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({
      executablePath: process.env.EDITOR_EXE || require('electron'),
      args: process.env.EDITOR_EXE ? [] : [path.resolve(__dirname, '..')],
      env,
    }),
    page = await app.firstWindow(),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.waitForFunction(() => window.__ROOM_LAB__);
    await page.locator('#open-cloud').click();
    await page.locator('#cloud-key').fill(format(connection));
    await page.locator('#cloud-connect').click();
    await page.locator('[data-cloud-node]').first().waitFor();
    assert.equal(await page.locator('[data-cloud-node]').count(), 3);
    for (const revision of rs) {
      const node = page.locator(`[data-cloud-node="${revision.id}"]`);
      assert.equal(await node.locator('text').nth(1).textContent(), revision.message);
      assert.equal(await node.getAttribute('aria-label'), revision.message);
    }
    assert.equal(await page.locator('#cloud-branches').count(), 0);
    const sections = await page.locator('.cloud-section>h3').allTextContents();
    assert.deepEqual(sections, [
      '① 导出 / 导入连接密钥',
      '② 云端工作树预览与切换',
      '③ 新建云端分支',
    ]);
    assert.equal(
      await page
        .locator('#worktree-forest,#cloud-tree-name,.cloud-history,.cloud-local-path')
        .count(),
      0,
    );
    assert.equal(await page.locator('#cloud-sync').textContent(), '新建云端分支');
    await page.locator(`[data-cloud-node="${rs[0].id}"]`).click();
    await page.locator('[data-cloud-room]').first().waitFor();
    assert.equal(await page.locator('.cloud-project-name').textContent(), p.name);
    assert.equal(await page.locator('[data-cloud-room]').count(), 3);
    assert.ok((await page.locator('#cloud-node-detail').textContent()).includes(rs[0].id));
    assert.equal(await page.locator('#cloud-node-detail .danger').count(), 0);
    await page.locator('#cloud-node-checkout').click();
    if (await page.getByRole('button', { name: '不保存并继续', exact: true }).isVisible())
      await page.getByRole('button', { name: '不保存并继续', exact: true }).click();
    await page.locator('#cloud-graph-stage .current').waitFor();
    let s = await call(page, 'status');
    assert.equal(s.trees.find((t) => t.id === s.current).readRevision, rs[0].id);
    await page.locator(`[data-cloud-node="${rs[1].id}"]`).click();
    await page.locator('#cloud-version-name').fill('明确选择父节点');
    await page.locator('#cloud-node-upload').click();
    await page.waitForFunction(() => document.querySelectorAll('[data-cloud-node]').length === 4);
    let state = await remote.state();
    assert.equal(state.revisions.find((r) => r.message === '明确选择父节点').parent, rs[1].id);
    await page.locator('#cloud-clear-selection').click();
    await page.locator('#cloud-version-name').fill('默认读取来源');
    await page.locator('#cloud-sync').click();
    await page.waitForFunction(() => document.querySelectorAll('[data-cloud-node]').length === 5);
    state = await remote.state();
    assert.equal(state.revisions.find((r) => r.message === '默认读取来源').parent, rs[0].id);
    await page.locator('#cloud-graph-stage').scrollIntoViewIfNeeded();
    const n = await page.locator('#cloud-graph-stage svg>g').getAttribute('transform'),
      b = await page.locator('#cloud-graph-stage').boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.wheel(0, -120);
    await page.waitForFunction(
      (n) => document.querySelector('#cloud-graph-stage svg>g')?.getAttribute('transform') !== n,
      n,
    );
    await page.locator('#cloud-graph-fit').click();
    await page.locator(`[data-cloud-node="${rs[0].id}"]`).click();
    await page.locator('#cloud-preview').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.resolve(__dirname, '../test-output/cloud-graph-editor.png'),
    });
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await page.getByRole('button', { name: '进入大关 →', exact: true }).click();
    await page.getByRole('button', { name: '房间列表', exact: true }).click();
    await page.getByRole('button', { name: '编辑房间', exact: true }).first().click();
    assert.equal(await page.locator('#export-room').isEnabled(), true);
    const file = path.resolve(__dirname, '../test-output/单房间导出-UI.zip');
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, file);
    await page.locator('#export-room').click();
    await page.waitForFunction(() =>
      document.querySelector('#status')?.textContent.includes('单房间项目包已导出'),
    );
    const exported = Archive.unpack(fs.readFileSync(file));
    assert.equal(exported.project.courses[0].rooms.length, 1);
    assert.equal(exported.project.courses[0].rooms[0].id, 'jet-room');
    await page.locator('#back-course').click();
    await page.getByRole('button', { name: '缩略接线板', exact: true }).click();
    // Select a room node through the same hit testing used by the designer.
    await page.locator('#graph-fit').click();
    const snap = await page.evaluate(() => window.__ROOM_LAB__.snapshot()),
      canvas = page.locator('#graph'),
      box = await canvas.boundingBox();
    const dims = await canvas.evaluate((c) => ({ w: c.width, h: c.height }));
    const view = snap.state.graphView || { scale: 1, x: 0, y: 0 };
    const r = snap.project.courses[0].rooms[1],
      card = require('../src/editor/graph-layout.cjs').card(r);
    await page.mouse.click(
      box.x + ((view.x + (r.graph.x + card.width / 2) * view.scale) * box.width) / dims.w,
      box.y + ((view.y + (r.graph.y + card.height / 2) * view.scale) * box.height) / dims.h,
    );
    await page.locator('#graph-export-room').waitFor();
    assert.equal(await page.locator('#export-room').isEnabled(), true);
    await page.locator('#graph-export-room').click();
    await page.waitForFunction(() =>
      document.querySelector('#status')?.textContent.includes('单房间项目包已导出'),
    );
    assert.equal(Archive.unpack(fs.readFileSync(file)).project.courses[0].rooms[0].id, 'ice-room');
    const beforePartialStatus = await call(page, 'status'),
      beforePartial = beforePartialStatus.trees.find((t) => t.id === beforePartialStatus.current);
    await page.locator('#open-cloud').click();
    await page.locator(`[data-cloud-node="${rs[1].id}"]`).click();
    await page.locator('[data-cloud-room]').first().waitFor();
    await page.locator('[data-cloud-room]').nth(0).check();
    await page.locator('[data-cloud-room]').nth(1).check();
    await page.locator('#cloud-node-import').click();
    await page.locator('#room-import-choice').waitFor();
    assert.equal(await page.locator('[data-room-import-index]:checked').count(), 2);
    await page.getByRole('button', { name: '导入到大关', exact: true }).click();
    await page.waitForFunction(
      () => window.__ROOM_LAB__.snapshot().project.courses[0].rooms.length === 5,
    );
    const afterPartial = await call(page, 'status');
    assert.equal(
      afterPartial.trees.find((t) => t.id === afterPartial.current).readRevision,
      beforePartial.readRevision,
    );
    assert.equal((await remote.state()).revisions.length, 5);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        desktopGraph: true,
        packaged: !!process.env.EDITOR_EXE,
        sections: true,
        details: true,
        readOnlyGraph: true,
        switch: true,
        selectedParent: true,
        defaultParent: true,
        zoom: true,
        singleRoomZIP: true,
        projectNamesAndRoomDetails: true,
        cloudMultiRoomImport: true,
        partialImportDoesNotCheckout: true,
      }),
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
