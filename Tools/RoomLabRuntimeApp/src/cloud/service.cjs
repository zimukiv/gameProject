'use strict';
const C = require('./codec.cjs'),
  { Remote, parse, format } = require('./connection.cjs');
class Service {
  constructor(repository, vault, options = {}) {
    this.repo = repository;
    this.vault = vault;
    this.options = options;
    this.tail = Promise.resolve();
    this.message = '本地备份已就绪';
  }
  run(fn) {
    const p = this.tail.then(fn);
    this.tail = p.catch(() => {});
    return p;
  }
  status() {
    let configured = false;
    let endpoint = null;
    let connectionState = 'missing',
      connectionError = '';
    try {
      const c = this.vault.load();
      if (c) {
        const valid = parse(format(c), !!this.options.allowLocal);
        configured = true;
        endpoint = valid.endpoint;
        connectionState = 'configured';
      }
    } catch {
      connectionState = 'unreadable';
      connectionError = '保存的连接配置无法读取，请重新导入主电脑的完整密钥。';
    }
    return {
      ...this.repo.status(),
      configured,
      endpoint,
      connectionState,
      connectionError,
      connectionFile: this.vault.file || null,
      networkState: this.networkState || 'unchecked',
      lastVerifiedAt: this.lastVerifiedAt || null,
      message: this.message,
    };
  }
  async sync() {
    const connection = this.vault.load();
    if (!connection) throw new Error('请先导入连接密钥');
    const remote = this.options.remote || new Remote(connection),
      t = this.repo.tree();
    const state = await remote.state();
    this.remoteBranches = state.branches;
    const head = state.branches.find((b) => b.name === t.branch)?.head || null;
    if (t.head !== t.base) {
      const data = this.repo.read(t),
        snapshot = C.encode(data.project, data.files),
        rev = this.repo.data.revisions[t.head];
      try {
        await remote.upload(snapshot, rev, t.branch, t.base);
        t.base = rev.id;
        this.repo.save();
        this.message = '已同步到云端';
        return { status: this.status() };
      } catch (e) {
        if (e.status !== 409) throw e;
        const original = t.branch,
          branch = original.slice(0, 55) + '-冲突-' + this.repo.data.device + '-' + Date.now();
        // The original local tree and its unsent snapshot stay intact even if the conflict upload fails.
        const fork = this.repo.create('冲突副本 / ' + t.name, branch, t);
        fork.base = null;
        this.repo.save();
        await remote.upload(snapshot, rev, branch, null);
        fork.base = rev.id;
        this.repo.save();
        this.message = '双方同时修改：本机内容已保存在冲突分支，原云端分支未覆盖';
        return { conflict: true, originalBranch: original, status: this.status() };
      }
    }
    if (head && head !== t.head) {
      const incoming = await remote.download(head),
        tree = this.repo.importRemote(incoming.revision, incoming.snapshot, t.branch);
      this.message = '云端新版本已下载';
      return { incoming: tree.id, status: this.status() };
    }
    this.message = '本机与云端一致';
    return { status: this.status() };
  }
  async action(name, p = {}) {
    // Local disk persistence must not wait behind a slow/offline network request.
    if (name === 'backup') {
      this.repo.backup(p.project, p.files, p.treeId, p.message);
      return this.status();
    }
    if (name === 'status') return this.status();
    if (name === 'draft') {
      const t = this.repo.draft(p.project, p.files, p.treeId);
      return { ...this.status(), savedTreeId: t.id };
    }
    if (name === 'live') {
      if (this.repo.data.mode !== 'live') return { online: false, peers: 0 };
      const c = this.vault.load();
      if (!c) throw new Error('请先连接云端');
      if (!this.liveSession)
        this.liveSession = new (require('./live.cjs').Live)(
          this.repo,
          this.options.remote || new Remote(c),
        );
      return this.liveSession.tick(p.project, p.files, p.treeId || this.repo.data.current);
    }
    if (name === 'holdLive') {
      if (this.liveSession)
        this.liveSession.conflict = { paths: p.paths, remote: C.encode(p.project, p.files) };
      return this.status();
    }
    if (name === 'resolveLive') {
      const data = this.liveSession?.resolve(p.choice);
      return { ...data, status: this.status() };
    }
    return this.run(async () => {
      if (name === 'mode') {
        if (!['live', 'manual'].includes(p.mode)) throw new Error('同步模式无效');
        this.repo.data.mode = p.mode;
        this.liveSession = null;
        this.repo.save();
        return this.status();
      }
      if (name === 'manualSave') {
        const source = this.repo.tree(p.treeId || this.repo.data.current),
          data = this.repo.working(source),
          snapshot = C.encode(data.project, data.files),
          defaultParent = source.readRevision || source.base || null;
        let parent = defaultParent;
        if (p.parentRevision !== undefined) {
          if (!/^[a-f0-9]{64}$/.test(p.parentRevision || ''))
            throw new Error('请选择有效的云端父节点');
          const c = this.vault.load();
          if (!c) throw new Error('请先连接云端');
          const remote = this.options.remote || new Remote(c),
            state = await remote.state();
          if (state.graph?.metadata?.some((r) => r.id === p.parentRevision && r.deletedAt))
            throw new Error('所选节点已删除，请刷新节点图');
          if (!state.revisions.some((r) => r.id === p.parentRevision)) {
            const incoming = await remote.download(p.parentRevision);
            if (!incoming?.revision) throw new Error('所选云端节点不存在');
          }
          parent = p.parentRevision;
        }
        const previous = this.repo.data.current;
        const branch =
          source.branch.slice(0, 45) + '/save-' + this.repo.data.device + '-' + Date.now();
        const t = this.repo.create(String(p.message || '手动保存'), branch, {
          id: source.id,
          projectId: data.project.id,
          readRevision: defaultParent,
          localFile: source.localFile,
        });
        const rev = this.repo.put(t, snapshot, p.message || '手动保存', parent);
        this.repo.draft(data.project, data.files, t.id);
        if (previous !== source.id) {
          this.repo.data.current = previous;
          this.repo.save();
        }
        const c = this.vault.load();
        if (c) {
          await (this.options.remote || new Remote(c)).upload(snapshot, rev, branch, null);
          t.base = rev.id;
          this.repo.save();
          this.message = p.parentRevision
            ? '已上传到所选节点下方，原节点保持不变'
            : '已从上次读取版本创建云端子分支';
        } else this.message = '本机版本已保存，连接云端后可上传';
        return this.status();
      }
      if (name === 'status') return this.status();
      if (name === 'connect') {
        const connection = parse(p.key, !!this.options.allowLocal);
        let previous = null;
        try {
          previous = this.vault.load();
        } catch {
          /* A fresh authenticated key may repair an unreadable vault. */
        }
        await (this.options.remote || new Remote(connection)).state();
        this.vault.save(connection);
        if (
          !previous ||
          previous.endpoint !== connection.endpoint ||
          previous.workspaceKey !== connection.workspaceKey
        ) {
          // Cloud bases belong to one workspace; retain snapshots, start independent branches in the new one.
          for (const t of this.repo.data.trees) {
            t.base = null;
            t.readRevision = null;
          }
        }
        this.liveSession = null;
        this.repo.save();
        this.message = '已连接私有云端';
        this.networkState = 'verified';
        this.lastVerifiedAt = Date.now();
        return this.status();
      }
      if (name === 'diagnose') {
        const s = this.status();
        if (!s.configured)
          throw new Error(s.connectionError || '尚未导入连接密钥。请从主电脑取得完整密钥。');
        try {
          const remote = this.options.remote || new Remote(this.vault.load());
          const state = await remote.state();
          this.networkState = 'verified';
          this.lastVerifiedAt = Date.now();
          this.message = '连接验证成功：云端有 ' + state.branches.length + ' 个分支';
          return this.status();
        } catch (e) {
          this.networkState = 'failed';
          this.message = e.message;
          throw e;
        }
      }
      if (name === 'moveTree') {
        this.repo.move(p.id, p.parentId);
        return this.status();
      }
      if (name === 'renameTree') {
        this.repo.rename(p.id, p.name, p.allowDuplicateName);
        return this.status();
      }
      if (name === 'deleteTree') {
        this.repo.remove(p.id);
        return this.status();
      }
      if (name === 'recoverTree') {
        this.repo.recover(p.id);
        return this.status();
      }
      if (name === 'unlinkFile') {
        this.repo.unlinkFile(p.id);
        return this.status();
      }
      if (name === 'sync') return this.sync();
      if (name === 'auto') {
        this.repo.data.auto = !!p.enabled;
        this.repo.save();
        return this.status();
      }
      if (name === 'fork') {
        this.liveSession = null;
        const data = this.repo.working();
        const t = this.repo.fork(p.name, p.branch, p);
        this.repo.draft(data.project, data.files, t.id);
        return this.status();
      }
      if (name === 'checkout') {
        this.liveSession = null;
        const t = this.repo.tree(p.id);
        const loaded = this.repo.working(t);
        this.repo.data.current = t.id;
        t.readRevision = t.base || t.readRevision || null;
        this.repo.save();
        return { ...loaded, status: this.status() };
      }
      if (name === 'restore') {
        const loaded = this.repo.restore(p.id);
        return { ...loaded, status: this.status() };
      }
      if (name === 'restoreDraft') {
        this.liveSession = null;
        if (!this.repo.data.revisions[p.id]) throw new Error('本地版本不存在');
        const data = C.decode(require('node:fs').readFileSync(this.repo.snapshotFile(p.id)));
        this.repo.draft(data.project, data.files, this.repo.data.current);
        return { ...data, status: this.status() };
      }
      if (name === 'remote') {
        const c = this.vault.load();
        if (!c) throw new Error('请先连接云端');
        const remote = this.options.remote || new Remote(c);
        return await remote.state();
      }
      if (name === 'checkoutRevision') {
        const c = this.vault.load();
        if (!c) throw new Error('请先连接云端');
        if (!/^[a-f0-9]{64}$/.test(p.id || '')) throw new Error('版本 ID 无效');
        const remote = this.options.remote || new Remote(c),
          state = await remote.state();
        if (state.graph?.metadata?.some((r) => r.id === p.id && r.deletedAt))
          throw new Error('所选节点已删除，请刷新');
        const incoming = await remote.download(p.id);
        if (!incoming?.revision) throw new Error('所选节点不存在');
        const existing = this.repo.data.trees.find(
          (t) =>
            !t.deletedAt &&
            t.head === p.id &&
            !this.repo.status().trees.find((x) => x.id === t.id)?.unsaved,
        );
        const t =
          existing ||
          this.repo.importRemote(
            incoming.revision,
            incoming.snapshot,
            // A modified draft at this same head must stay recoverable in its own tree.
            (this.repo.data.trees.some(
              (t) => t.head === p.id && t.draftFingerprint && t.draftFingerprint !== t.fingerprint,
            )
              ? 'read-' + Date.now() + '-'
              : '') +
              (
                state.branches.find((b) => b.head === p.id)?.name || 'version-' + p.id.slice(0, 20)
              ).slice(0, 60),
          );
        this.liveSession = null;
        this.repo.data.current = t.id;
        t.readRevision = p.id;
        t.base = p.id;
        this.repo.save();
        return { ...this.repo.working(t), status: this.status() };
      }
      if (name === 'fetchBranch') {
        const c = this.vault.load();
        if (!c) throw new Error('请先连接云端');
        const remote = this.options.remote || new Remote(c),
          state = await remote.state(),
          b = state.branches.find((b) => b.name === p.branch);
        if (!b?.head) throw new Error('云端分支为空');
        const incoming = await remote.download(b.head);
        const exists = this.repo.data.trees.some(
          (t) => !t.deletedAt && t.branch === b.name && t.head === incoming.revision.id,
        );
        this.repo.importRemote(incoming.revision, incoming.snapshot, b.name);
        this.message = exists
          ? '该云端版本已下载，无需重复创建工作树。'
          : '云端版本已下载为工作树，请选择节点切换。';
        return this.status();
      }
      if (name === 'copyKey') {
        const c = this.vault.load();
        if (!c) throw new Error('尚未导入连接密钥，不能复制。请先从主电脑取得完整密钥。');
        return format(parse(format(c), !!this.options.allowLocal));
      }
      throw new Error('未知同步操作');
    });
  }
}
module.exports = { Service };
