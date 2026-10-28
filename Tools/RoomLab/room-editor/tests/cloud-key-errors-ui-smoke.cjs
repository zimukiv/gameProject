'use strict';
const assert = require('node:assert/strict'),
  path = require('node:path'),
  { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const env = { ...process.env, ROOM_EDITOR_TEST: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({
    executablePath: process.env.EDITOR_EXE || require('electron'),
    args: process.env.EDITOR_EXE ? [] : [path.resolve(__dirname, '..')],
    env,
  });
  try {
    const p = await app.firstWindow();
    await p.waitForFunction(() => window.__ROOM_LAB__);
    await p.locator('#open-cloud').click();
    assert.equal(await p.locator('#cloud-copy').isDisabled(), true);
    await p.locator('#cloud-key').fill('rlsync1.bnVsbA');
    await p.locator('#cloud-connect').click();
    await p.waitForFunction(() =>
      document.getElementById('cloud-feedback')?.textContent.includes('内容无效'),
    );
    assert.equal(
      await p.locator('#cloud-copy').isDisabled(),
      true,
      'failed import must not enable the copy button',
    );
    const box = await p.locator('#cloud-feedback').boundingBox();
    const status = await p.locator('.cloud-status').boundingBox();
    assert.ok(
      box.y >= status.y && box.y < status.y + status.height + 130,
      'connection error must remain visible near status',
    );
    assert.ok((await p.locator('#cloud-feedback').textContent()).includes('密钥'));
    console.log(
      JSON.stringify({
        cloudKeyFailureUI: true,
        packaged: !!process.env.EDITOR_EXE,
        copyRemainsDisabled: true,
        errorVisibleAtTop: true,
      }),
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
