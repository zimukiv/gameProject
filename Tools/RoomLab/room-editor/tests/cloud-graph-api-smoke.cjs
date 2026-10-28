'use strict';
const assert = require('node:assert/strict'),
  C = require('../src/cloud/codec.cjs'),
  M = require('../src/project/model.cjs'),
  { Remote, newWorkspaceKey } = require('../src/cloud/connection.cjs');
(async () => {
  const remote = new Remote({
      endpoint: process.env.ROOM_CLOUD_PREVIEW || 'http://127.0.0.1:18859',
      workspaceKey: newWorkspaceKey(),
      accessToken: 'isolated-graph-management',
    }),
    p = M.example(),
    rs = [];
  for (let i = 0; i < 4; i++) {
    p.notes = 'graph ' + i;
    const s = C.encode(p, new Map()),
      r = C.revision(s, 'graph-test', '节点 ' + i, i ? rs[i - 1].id : null);
    await remote.upload(s, r, 'graph-' + i, null);
    rs.push(r);
  }
  const before = JSON.stringify(await remote.request('revisions/' + rs[1].id));
  const initial = (await remote.state()).graph.generation;
  const edit = (action, id, parentId, expectedVersion) =>
    remote.request('graph/edit', { action, id, parentId, expectedVersion });
  await assert.rejects(edit('move', rs[0].id, rs[3].id, initial), /后代/);
  const results = await Promise.allSettled([
    edit('move', rs[3].id, rs[0].id, initial),
    edit('move', rs[2].id, rs[0].id, initial),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter((r) => r.status === 'rejected' && r.reason.status === 409).length, 1);
  let state = await remote.state();
  assert.equal(state.graph.generation, initial + 1);
  await edit('delete', rs[1].id, null, initial + 1);
  state = await remote.state();
  assert.equal(
    state.branches.some((b) => b.head === rs[1].id),
    false,
  );
  assert.equal(JSON.stringify(await remote.request('revisions/' + rs[1].id)), before);
  await assert.rejects(edit('move', 'f'.repeat(64), null, initial + 2), /不属于/);
  const blocked = C.encode(p, new Map()),
    blockedRev = C.revision(blocked, 'graph-test', 'deleted parent', rs[1].id);
  await assert.rejects(remote.upload(blocked, blockedRev, 'blocked', null), /删除/);
  await edit('restore', rs[1].id, null, initial + 2);
  state = await remote.state();
  assert.equal(state.branches.length, 4);
  assert.equal(state.graph.generation, initial + 3);
  const other = new Remote({ ...remote.c, workspaceKey: newWorkspaceKey() });
  assert.equal((await other.state()).revisions.length, 0);
  await assert.rejects(
    other.request('graph/edit', { action: 'delete', id: rs[0].id, expectedVersion: 0 }),
    /不属于/,
  );
  console.log(
    JSON.stringify({
      graphAPI: true,
      isolatedWorkspace: true,
      cycleGuard: true,
      concurrentCAS: true,
      immutableSource: true,
      recycleRestore: true,
      workspaceIsolation: true,
    }),
  );
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
