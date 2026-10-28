'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  { Remote, parse, format } = require('../src/cloud/connection.cjs');
const connection = () => ({
  endpoint: 'https://test.chatgpt.site',
  workspaceKey: 'a'.repeat(43),
  accessToken: 'old-service-token-for-compatibility',
});
test('verified import can repair an unreadable vault with the real remote client', async () => {
  const { Service } = require('../src/cloud/service.cjs');
  let saved = null;
  const repo = {
      data: { trees: [], device: 'test' },
      save() {},
      status: () => ({ trees: [], history: [] }),
    },
    vault = {
      load() {
        if (!saved) throw Error('unreadable old vault');
        return saved;
      },
      save(v) {
        saved = v;
      },
    };
  const svc = new Service(repo, vault, {
    fetcher: async () => Response.json({ branches: [], revisions: [] }),
  });
  const state = await svc.action('connect', { key: format(connection()) });
  assert.equal(state.configured, true);
  assert.equal(saved.workspaceKey, connection().workspaceKey);
});
test('a public relay can connect when obsolete service auth is rejected; subsequent writes retain workspace auth', async () => {
  const c = connection(),
    calls = [],
    remote = new Remote(c, async (url, init) => {
      calls.push({ url, init });
      if (init.headers['OAI-Sites-Authorization'])
        return Response.json({ error: 'platform denied' }, { status: 403 });
      return Response.json(
        url.endsWith('/state')
          ? { branches: [], revisions: [] }
          : url.endsWith('/health')
            ? { service: 'room-lab-sync', protocol: 1 }
            : { ok: true },
      );
    });
  const state = await remote.state();
  assert.deepEqual(state.branches, []);
  assert.equal(c.authMode, 'workspace');
  await remote.request('commit', { test: true });
  assert.equal(calls.length, 4);
  assert.equal(calls[3].init.headers['X-Room-Workspace-Key'], c.workspaceKey);
  assert.equal(calls[3].init.headers['OAI-Sites-Authorization'], undefined);
  assert.equal(parse(format(c)).authMode, 'workspace');
});
test('private denial and unrelated HTTP 200 pages cannot enable public workspace access', async () => {
  for (const fallback of [
    Response.json({ error: 'private access denied' }, { status: 403 }),
    new Response('<html>network sign in</html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    }),
  ]) {
    let n = 0;
    const c = connection(),
      remote = new Remote(c, async () =>
        ++n === 1 ? Response.json({ error: 'denied' }, { status: 403 }) : fallback,
      );
    await assert.rejects(remote.state(), /403/);
    assert.notEqual(c.authMode, 'workspace');
  }
});
test('mutating requests are never automatically retried after authorization or network failure', async () => {
  let count = 0;
  const remote = new Remote(connection(), async () => {
    count++;
    return Response.json({ error: 'denied' }, { status: 403 });
  });
  await assert.rejects(remote.request('commit', {}));
  assert.equal(count, 1);
});
