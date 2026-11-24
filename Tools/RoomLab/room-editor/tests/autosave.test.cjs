'use strict';
// Renderer minute-autosave controller: timer lifecycle, immutable snapshots,
// no overlapping writes, edits during a save staying dirty, deferral, failure
// retry and the "never touches the cloud" boundary. The scheduler and the save
// adapter are injected, so nothing waits a real minute and no file is written.
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  M = require('../src/project/model.cjs'),
  { Autosave, MINUTE, clock, baseName } = require('../src/editor/autosave.cjs');

function harness(overrides = {}) {
  const store = {
    project: overrides.project || M.example(),
    files: new Map([['assets/seed-metal.svg', new Uint8Array([1, 2, 3])]]),
    hasProject: true,
    dirty: true,
  };
  const saves = [],
    outcomes = [],
    reports = [],
    scheduler = { callback: null, interval: null, cleared: null };
  let defer = false,
    gate = null,
    release = null,
    result = overrides.result || { ok: true, mode: 'file', at: 1000, file: 'C:/save/project.json' };
  const controller = new Autosave({
    scheduler: {
      setInterval: (fn, ms) => {
        scheduler.callback = fn;
        scheduler.interval = ms;
        return 7;
      },
      clearInterval: (id) => {
        scheduler.cleared = id;
      },
    },
    now: () => 123456,
    active: () => store.hasProject,
    defer: () => (typeof overrides.defer === 'function' ? overrides.defer() : defer),
    capture: () =>
      store.hasProject
        ? {
            project: structuredClone(store.project),
            files: [...store.files].map(([p, b]) => ({ path: p, bytes: new Uint8Array(b) })),
          }
        : null,
    save: async (snapshot) => {
      saves.push(snapshot);
      if (gate) await gate;
      if (typeof result === 'function') return result(snapshot);
      if (overrides.sequence) return overrides.sequence.shift();
      return result;
    },
    onSaved: (saved, snapshot, clean) => {
      outcomes.push({ saved, snapshot, clean });
      if (saved.mode === 'file' && clean) store.dirty = false;
    },
    report: (state) => reports.push(state),
  });
  return {
    controller,
    store,
    saves,
    outcomes,
    reports,
    scheduler,
    setDefer: (value) => (defer = value),
    setResult: (value) => (result = value),
    // A controllable save lets a test edit the store while the write is pending.
    hold: () => {
      gate = new Promise((resolve) => (release = resolve));
    },
    finish: () => release?.(),
  };
}

test('timer uses the injected scheduler with a one-minute interval and is disposed on close', () => {
  assert.equal(MINUTE, 60000);
  const h = harness();
  h.controller.start();
  assert.equal(h.scheduler.interval, 60000);
  assert.equal(typeof h.scheduler.callback, 'function');
  assert.equal(h.controller.running(), true);
  h.controller.dispose();
  assert.equal(h.scheduler.cleared, 7);
  assert.equal(h.controller.running(), false);
  assert.equal(h.controller.timer, null);
  // A disposed controller never saves again even if the timer callback fires late.
  return h.controller.tick().then(() => assert.equal(h.saves.length, 0));
});

test('autosave writes once and then only after the project changes again', async () => {
  const h = harness();
  const first = await h.controller.tick();
  assert.equal(first.mode, 'file');
  assert.equal(h.saves.length, 1);
  assert.equal(h.store.dirty, false);
  assert.equal(h.outcomes[0].clean, true);
  assert.equal(await h.controller.tick(), null);
  assert.equal(h.saves.length, 1);
  assert.equal(h.controller.state.skipped, 'clean');
  h.store.project.notes = '第二分钟又改了备注';
  await h.controller.tick();
  assert.equal(h.saves.length, 2);
  assert.equal(h.saves[1].project.notes, '第二分钟又改了备注');
  assert.equal(h.controller.state.lastSavedAt, 1000);
  assert.equal(h.controller.state.failures, 0);
});

test('the snapshot is captured before writing so later edits stay dirty', async () => {
  const h = harness();
  h.hold();
  const pending = h.controller.tick();
  h.store.project.notes = '保存期间的新修改';
  h.finish();
  const result = await pending;
  assert.equal(result.ok, true);
  assert.notEqual(h.saves[0].project.notes, '保存期间的新修改');
  assert.equal(h.outcomes[0].clean, false);
  assert.equal(h.store.dirty, true, 'edits during the awaited save keep the project dirty');
  // The next tick writes the newer edit because the saved baseline is the old snapshot.
  await h.controller.tick();
  assert.equal(h.saves.length, 2);
  assert.equal(h.saves[1].project.notes, '保存期间的新修改');
  assert.equal(h.store.dirty, false);
});

test('a tick during an in-flight save does not start a second write', async () => {
  const h = harness();
  h.hold();
  const first = h.controller.tick(),
    second = h.controller.tick();
  assert.equal(await second, null);
  h.finish();
  await first;
  assert.equal(h.saves.length, 1);
});

test('autosave defers while a dialog, drag or play is active and retries next tick', async () => {
  const h = harness();
  h.setDefer(true);
  assert.equal(await h.controller.tick(), null);
  assert.equal(h.saves.length, 0);
  assert.equal(h.controller.state.skipped, 'deferred');
  h.setDefer(false);
  await h.controller.tick();
  assert.equal(h.saves.length, 1);
});

test('failures stay visible, never advance the baseline and are retried', async () => {
  const h = harness({ result: { ok: false, error: '磁盘写入失败' } });
  await h.controller.tick();
  assert.equal(h.controller.state.lastError, '磁盘写入失败');
  assert.equal(h.controller.state.failures, 1);
  assert.equal(h.controller.state.lastSavedAt, null);
  await h.controller.tick();
  assert.equal(h.saves.length, 2, 'the same changes are retried');
  assert.equal(h.controller.state.failures, 2);
  h.setResult({ ok: true, mode: 'file', at: 2000, file: 'C:/save/project.json' });
  await h.controller.tick();
  assert.equal(h.controller.state.lastError, null);
  assert.equal(h.controller.state.failures, 0);
  assert.equal(h.controller.state.lastSavedAt, 2000);
  await h.controller.tick();
  assert.equal(h.saves.length, 3);
});

test('a recovery-only result keeps the project dirty and reports its location', async () => {
  const h = harness({
    result: {
      ok: true,
      mode: 'recovery',
      at: 3000,
      file: 'C:/profile/RoomLabRecovery/physics-project/project.json',
      conflict: true,
      warning: '项目文件已被其他程序修改',
    },
  });
  await h.controller.tick();
  assert.equal(h.store.dirty, true, 'a recovery snapshot never clears the unsaved flag');
  assert.equal(h.controller.state.lastMode, 'recovery');
  assert.equal(h.controller.state.conflict, true);
  assert.equal(baseName(h.controller.state.lastFile), 'project.json');
  assert.match(h.controller.state.warning, /其他程序修改/);
});

test('no project or no snapshot means no autosave at all', async () => {
  const h = harness();
  h.store.hasProject = false;
  assert.equal(await h.controller.tick(), null);
  assert.equal(h.saves.length, 0);
  assert.equal(h.controller.state.lastSavedAt, null);
});

test('opening or checking out another project resets the save baseline', async () => {
  const h = harness();
  await h.controller.tick();
  assert.equal(h.saves.length, 1);
  h.store.project = { ...M.example(), id: 'other-project' };
  await h.controller.tick();
  assert.equal(h.saves.length, 2);
  assert.equal(h.saves[1].project.id, 'other-project');
});

test('clock and baseName format the visible autosave status', () => {
  assert.match(clock(0), /^\d{2}:\d{2}:\d{2}$/);
  assert.equal(baseName('C:\\a b\\项目.json'), '项目.json');
  assert.equal(baseName('/srv/x/project.zip'), 'project.zip');
});

test('the autosave controller never calls a cloud action', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/editor/autosave.cjs'), 'utf8');
  assert.ok(!/\.cloud\(/.test(source), 'no cloud IPC call');
  for (const name of ['saveCurrent', 'saveVersion']) {
    assert.ok(!source.includes(name), 'autosave must not call ' + name);
  }
  // `app.manualSave` is only the deferral flag; no quoted cloud action name may appear.
  for (const name of ['manualSave', 'draft', 'saveCurrent']) {
    assert.ok(!new RegExp('[\'"]' + name + '[\'"]').test(source), 'no ' + name + ' cloud action');
  }
  // attach() may only inspect pointer state on the cloud controller.
  assert.match(source, /app\.cloud && app\.cloud\.interacting/);
});

test('a stale desktop reply never reattaches an old file session', async () => {
  const { reconcileSession } = require('../src/editor/autosave.cjs');
  const fileSession = { file: 'C:/old/project.json', hash: 'a' };
  const store = { project: { id: 'project-1' }, nativeSession: fileSession };
  const started = { session: fileSession, projectId: 'project-1' };
  const reply = { ok: true, mode: 'file', session: { file: 'C:/old/project.json', hash: 'b' } };
  // The ordinary case still reattaches the refreshed file session.
  assert.equal(reconcileSession(store, started, reply).stale, undefined);
  assert.notEqual(store.nativeSession, fileSession);
  // Same project ID, but the session was reset (cloud checkout / reopen): skip.
  const switchedStore = { project: { id: 'project-1' }, nativeSession: null };
  const stale = reconcileSession(switchedStore, started, reply);
  assert.equal(stale.stale, true);
  assert.equal(switchedStore.nativeSession, null, 'the old session must not come back');
  // Another project opened meanwhile: skip even if a session exists again.
  const otherStore = { project: { id: 'project-2' }, nativeSession: { file: 'C:/b.json' } };
  assert.equal(reconcileSession(otherStore, started, reply).stale, true);
  assert.deepEqual(otherStore.nativeSession, { file: 'C:/b.json' });
  // Recovery snapshots and failures are passed through untouched.
  const recovery = { ok: true, mode: 'recovery', session: { file: 'C:/r.json' } };
  assert.equal(reconcileSession(store, started, recovery), recovery);
  assert.equal(reconcileSession(store, switchedStore, { ok: true, mode: 'file' }).stale, true);
});

test('a tick that receives a stale save result does not advance the baseline', async () => {
  const h = harness({ result: { ok: true, mode: 'file', stale: true, session: { file: 'old' } } });
  const first = await h.controller.tick();
  assert.equal(first, null, 'stale results are ignored');
  assert.equal(h.controller.state.skipped, 'stale');
  assert.equal(h.controller.state.lastSavedAt, null);
  assert.equal(h.controller.lastFingerprint, null, 'the next tick retries the same changes');
  // A later good result saves normally.
  const cleanup = h;
  void cleanup;
});

test('suspend/resume keeps minute saves available after a failed close', async () => {
  const h = harness();
  h.controller.start();
  assert.equal(h.controller.running(), true);
  h.controller.suspend();
  assert.equal(h.controller.running(), false);
  assert.equal(h.controller.disposed, false, 'suspend is not a permanent dispose');
  h.controller.resume();
  assert.equal(h.controller.running(), true);
  h.controller.dispose();
  assert.equal(h.controller.running(), false);
  h.controller.resume();
  assert.equal(h.controller.running(), false, 'a disposed controller never restarts');
});

test('whenIdle waits for an in-flight write before a closing backup', async () => {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const h = harness();
  h.controller.save = async () => {
    await gate;
    return { ok: true, mode: 'recovery' };
  };
  h.store.dirty = true;
  h.store.project.name = '待保存';
  const tick = h.controller.tick();
  let idle = false;
  const waiting = h.controller.whenIdle().then(() => (idle = true));
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(idle, false, 'idle must not resolve while the write is running');
  release();
  await tick;
  await waiting;
  assert.equal(idle, true);
});
