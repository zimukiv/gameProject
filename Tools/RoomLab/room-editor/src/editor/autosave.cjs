'use strict';
// Minute autosave controller. The timer only decides *when* to try; the actual
// write is injected so the desktop path (project file + recovery snapshot) and
// the browser path (local draft + IndexedDB artwork) share one tested state
// machine: 60 s interval, immutable snapshot, no overlap, edits during a save
// stay dirty, deferral while a dialog/drag/play is active, failures retried on
// the next tick.
//
// `Autosave` is deliberately DOM-free and cloud-free so `node --test` can drive
// `tick()` directly with an injected scheduler instead of waiting a real minute.
const MINUTE = 60000;
const pad = (value) => String(value).padStart(2, '0');
function clock(at) {
  const d = new Date(at);
  return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}
function baseName(file) {
  return String(file || '')
    .split(/[\\/]/)
    .pop();
}
class Autosave {
  constructor(options = {}) {
    this.interval = Number(options.interval) > 0 ? Number(options.interval) : MINUTE;
    this.now = options.now || (() => Date.now());
    this.capture = options.capture || (() => null);
    this.save = options.save || (async () => ({ ok: false, error: '未配置自动保存。' }));
    this.report = options.report || (() => {});
    this.defer = options.defer || (() => false);
    this.active = options.active || (() => true);
    this.onSaved = options.onSaved || (() => {});
    this.scheduler =
      options.scheduler ||
      (globalThis.setInterval
        ? {
            setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
            clearInterval: (id) => globalThis.clearInterval(id),
          }
        : { setInterval: () => null, clearInterval: () => {} });
    this.projectId = null;
    this.lastFingerprint = null;
    this.inflight = false;
    this.disposed = false;
    this.timer = null;
    this.idleResolvers = [];
    this.state = {
      saving: false,
      lastSavedAt: null,
      lastMode: null,
      lastFile: null,
      conflict: false,
      warning: '',
      lastError: null,
      lastErrorAt: null,
      failures: 0,
      skipped: null,
    };
  }
  fingerprint(snapshot) {
    return JSON.stringify(snapshot?.project ?? null);
  }
  start() {
    if (this.disposed || this.timer) return this;
    this.timer = this.scheduler.setInterval(() => {
      this.tick().catch(() => {});
    }, this.interval);
    return this;
  }
  dispose() {
    this.disposed = true;
    if (this.timer) this.scheduler.clearInterval(this.timer);
    this.timer = null;
    return this;
  }
  // Temporarily stop the timer without giving up the controller: used when the
  // window starts closing but the exit backup may still fail and leave the
  // editor open (minute autosave must keep working then).
  suspend() {
    if (this.timer) this.scheduler.clearInterval(this.timer);
    this.timer = null;
    return this;
  }
  resume() {
    if (this.disposed) return this;
    return this.start();
  }
  // Resolves when an in-flight write settled, so a closing backup never races one.
  whenIdle() {
    if (!this.inflight) return Promise.resolve();
    return new Promise((resolve) => this.idleResolvers.push(resolve));
  }
  running() {
    return !!this.timer && !this.disposed;
  }
  update(patch) {
    this.state = { ...this.state, ...patch };
    this.report(this.state);
    return this.state;
  }
  // One timer tick. Returns the save result, or null when nothing was written:
  // no project, no changes since the last autosave, a deferred moment, or an
  // already running save. Deferrals and clean ticks are retried/resumed next time.
  async tick() {
    if (this.disposed || this.inflight) return null;
    if (!this.active()) return null;
    if (this.defer()) {
      if (this.state.skipped !== 'deferred') this.update({ skipped: 'deferred' });
      return null;
    }
    const snapshot = this.capture();
    if (!snapshot?.project) return null;
    // Switching/opening/importing a project resets the baseline so the new one is
    // snapshotted on its own; a new project never reuses the old file association.
    if (snapshot.project.id !== this.projectId) {
      this.projectId = snapshot.project.id;
      this.lastFingerprint = null;
    }
    const fingerprint = this.fingerprint(snapshot);
    if (fingerprint === this.lastFingerprint) {
      if (this.state.skipped !== 'clean') this.update({ skipped: 'clean' });
      return null;
    }
    this.inflight = true;
    this.update({ saving: true, skipped: null });
    try {
      const result = await this.save(snapshot);
      // A write that started before a project switch (or a cloud checkout that
      // replaced the file session) must not update the baseline of the project
      // now open; the new project is snapshotted on its own next tick.
      if (result?.stale) {
        this.update({ saving: false, skipped: 'stale' });
        return null;
      }
      if (!result || result.ok === false) {
        // Keep lastFingerprint unchanged: the same changes are retried next tick.
        const error = result?.error || '自动保存未完成。';
        this.update({
          saving: false,
          lastError: error,
          lastErrorAt: this.now(),
          failures: this.state.failures + 1,
          warning: result?.warning || '',
          conflict: !!result?.conflict,
          lastFile: result?.file || null,
          lastMode: result?.mode || null,
        });
        return result || { ok: false, error };
      }
      // The saved baseline is the snapshot that was actually written; edits made
      // while the write was in flight keep the project dirty and are saved later.
      this.lastFingerprint = fingerprint;
      const current = this.capture();
      const clean = !current?.project || this.fingerprint(current) === fingerprint;
      const at = result.at || this.now();
      this.update({
        saving: false,
        lastSavedAt: at,
        lastMode: result.mode || null,
        lastFile: result.file || null,
        conflict: !!result.conflict,
        warning: result.warning || '',
        lastError: null,
        failures: 0,
      });
      this.onSaved(result, snapshot, clean);
      return result;
    } catch (error) {
      this.update({
        saving: false,
        lastError: String(error?.message || error),
        lastErrorAt: this.now(),
        failures: this.state.failures + 1,
      });
      return { ok: false, error: String(error?.message || error) };
    } finally {
      this.inflight = false;
      for (const resolve of this.idleResolvers.splice(0)) resolve();
    }
  }
}
// Desktop autosave replies arrive asynchronously, so a file session may only be
// reattached when the project *and* the file session are still the ones the
// write started from (same project ID after a cloud checkout still counts as a
// switch, because the file association was reset). Recovery snapshots never
// become the session target; a stale reply is flagged so the caller can skip it.
function reconcileSession(store, started, result) {
  if (!result || result.ok !== true || result.mode !== 'file') return result;
  if (store.nativeSession !== started.session || store.project?.id !== started.projectId)
    return { ...result, stale: true };
  if (result.session) store.nativeSession = result.session;
  return result;
}
// Renderer wiring: native desktop saves the opened/associated file (or a local
// recovery snapshot), the browser only refreshes its local draft and artwork.
function attach(app) {
  const api = typeof window !== 'undefined' ? window.desktopAPI : null;
  const $ = (id) => (typeof document !== 'undefined' ? document.getElementById(id) : null);
  const capture = () => {
    const project = app.store.project,
      known = new Set(project.assets.map((a) => a.path));
    return {
      project: app.store.snapshot(),
      files: [...app.store.assetFiles]
        .filter(([path]) => known.has(path))
        .map(([path, bytes]) => ({ path, bytes: new Uint8Array(bytes) })),
    };
  };
  const controller = new Autosave({
    active: () => !!app.store.hasProject,
    defer: () =>
      !!$('dialog')?.open ||
      !!app.game ||
      !!app.manualSave ||
      !!(app.cloud && app.cloud.interacting),
    capture,
    save: async (snapshot) => {
      if (typeof api?.autosaveProject !== 'function') {
        // Browser: keep the existing local draft and artwork, never download files.
        app.store.persist();
        await Promise.all(
          snapshot.files.map((file) =>
            require('../assets/manager.cjs').putBlob(file.path, file.bytes),
          ),
        );
        return { ok: true, mode: 'local', at: Date.now(), file: null };
      }
      // Remember the file session and project this write started from. The
      // reply is asynchronous: the user may have opened another project,
      // switched files or checked out a cloud revision (even one with the same
      // project ID) in the meantime. Reattaching the old session then would make
      // the next save overwrite the wrong file, so a stale reply is discarded
      // and reported as `stale` instead of updating the session/dirty state.
      const started = { session: app.store.nativeSession, projectId: snapshot.project.id };
      const result = await api.autosaveProject({
        session: started.session,
        project: snapshot.project,
        files: snapshot.files,
      });
      if (!result) return { ok: false, error: '自动保存没有返回结果。' };
      return reconcileSession(app.store, started, result);
    },
    onSaved: (result, snapshot, clean) => {
      // Only a real project-file write clears the unsaved flag; a recovery draft
      // or a conflicting file never does.
      if (result.mode === 'file' && clean) app.store.dirty = false;
      // A conflict needs a visible warning; the routine "recovery snapshot" note
      // lives in the autosave status element so it does not replace #status.
      if (result.warning && result.conflict) app.message(result.warning, true);
    },
  });
  controller.renderStatus = () => {
    const node = $('autosave-status');
    if (!node) return;
    const state = controller.state,
      active = !!app.store.hasProject;
    node.hidden = !active;
    if (!active) {
      node.textContent = '';
      node.removeAttribute('title');
      return;
    }
    let tone = 'idle';
    if (state.saving) tone = 'saving';
    else if (state.conflict) tone = 'warn';
    else if (state.lastError) tone = 'error';
    else if (state.lastSavedAt) tone = 'ok';
    node.className = 'autosave-status ' + tone;
    const modeLabel =
      state.lastMode === 'file'
        ? '已写入项目文件'
        : state.lastMode === 'local'
          ? '浏览器本地草稿'
          : '本机恢复快照';
    // Short visible state (time / state); the path, mode, retry count, conflict
    // and error details live in the hover/expandable title.
    if (state.saving) node.textContent = '自动保存中…';
    else if (state.lastError)
      node.textContent = '自动保存失败 ' + clock(state.lastErrorAt || Date.now());
    else if (state.lastSavedAt)
      node.textContent = (state.conflict ? '需手动处理 ' : '自动保存 ') + clock(state.lastSavedAt);
    else node.textContent = '未自动保存';
    const details = [];
    if (state.lastMode) details.push(modeLabel);
    if (state.lastFile) details.push('位置：' + state.lastFile);
    if (state.lastError)
      details.push(
        state.lastError + (state.failures > 1 ? '（连续 ' + state.failures + ' 次）' : ''),
      );
    if (state.warning) details.push(state.warning);
    if (details.length) node.title = details.join('\n');
    else node.removeAttribute('title');
  };
  controller.report = () => controller.renderStatus();
  controller.renderStatus();
  return controller.start();
}
module.exports = { Autosave, attach, reconcileSession, MINUTE, clock, baseName };
