'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  { Service } = require('../src/cloud/service.cjs'),
  Conn = require('../src/cloud/connection.cjs');
const repo = { status: () => ({ trees: [], history: [] }) };
test('relay key failures are distinguished from platform access failures', async () => {
  const c = {
    endpoint: 'https://test.chatgpt.site',
    accessToken: 'test-only',
    workspaceKey: 'a'.repeat(43),
  };
  await assert.rejects(
    new Conn.Remote(c, async () =>
      Response.json({ error: '工作区密钥无效' }, { status: 401 }),
    ).state(),
    /工作区密钥/,
  );
  await assert.rejects(
    new Conn.Remote(c, async () =>
      Response.json({ error: 'platform denied' }, { status: 403 }),
    ).state(),
    /网站访问授权|平台/,
  );
});
test('missing connection cannot be encoded or copied as a null key', async () => {
  assert.throws(() => Conn.format(null), /密钥/);
  const svc = new Service(repo, { load: () => null });
  await assert.rejects(svc.action('copyKey'), /密钥|连接/);
});
test('invalid key payloads show a meaningful error without exposing decoded content', () => {
  for (const value of [null, {}, [], { endpoint: 'bad', workspaceKey: 'x', accessToken: 's' }]) {
    const text = 'rlsync1.' + Buffer.from(JSON.stringify(value)).toString('base64url');
    assert.throws(() => Conn.parse(text), /连接密钥|完整密钥/);
  }
});
test('status distinguishes a missing key from an unreadable saved configuration', () => {
  const missing = new Service(repo, { load: () => null }).status();
  assert.equal(missing.connectionState, 'missing');
  const failed = new Service(repo, {
    load: () => {
      throw Error('decrypt failure');
    },
  }).status();
  assert.equal(failed.connectionState, 'unreadable');
  assert.equal(failed.configured, false);
  assert.ok(failed.connectionError);
});
