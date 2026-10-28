'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  C = require('./codec.cjs');
class Repository {
  constructor(root) {
    this.root = root;
    this.file = path.join(root, 'repository.json');
    fs.mkdirSync(path.join(root, 'snapshots'), { recursive: true });
    fs.mkdirSync(path.join(root, 'drafts'), { recursive: true });
    if (fs.existsSync(this.file)) {
      try {
        this.data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      } catch {
        this.data = JSON.parse(fs.readFileSync(this.file + '.bak', 'utf8'));
      }
    } else
      this.data = {
        v: 1,
        device: crypto.randomUUID().slice(0, 8),
        trees: [],
        revisions: {},
        current: null,
        auto: true,
      };
    this.migrateTrees();
    this.save();
  }
  migrateTrees() {
    for (const t of this.data.trees) {
      if (t.parentId === undefined) {
        const source = t.readRevision || this.data.revisions[t.head]?.parent;
        t.parentId = this.data.trees.find((x) => x.id !== t.id && x.head === source)?.id || null;
      }
      if (!t.courses) {
        try {
          this.describe(t, this.working(t).project);
        } catch {
          t.courses = [];
        }
      }
    }
    // Old or hand-edited metadata must never make the preview recursive forever.
    for (const t of this.data.trees) {
      const seen = new Set([t.id]);
      let p = t.parentId;
      while (p) {
        if (seen.has(p)) {
          t.parentId = null;
          break;
        }
        seen.add(p);
        p = this.data.trees.find((x) => x.id === p)?.parentId;
      }
    }
  }
  describe(t, project) {
    t.projectName = project.name;
    t.courses = project.courses.map((c) => ({ id: c.id, name: c.name, rooms: c.rooms.length }));
  }
  save() {
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    if (fs.existsSync(this.file)) fs.copyFileSync(this.file, this.file + '.bak');
    fs.renameSync(tmp, this.file);
  }
  tree(id = this.data.current) {
    const t = this.data.trees.find((t) => t.id === id && !t.deletedAt);
    if (!t) throw new Error('工作树不存在');
    return t;
  }
  create(name, branch = 'main', from = null) {
    if (!/^[\p{L}\p{N}_. /-]{1,100}$/u.test(branch))
      throw new Error('分支名使用文字、数字、空格、点、横线或斜杠，最多 100 字');
    const t = {
      id: crypto.randomUUID(),
      name: String(name || '工作树').slice(0, 80),
      branch,
      base: from?.base || null,
      head: from?.head || null,
      projectId: from?.projectId || null,
      fingerprint: from?.fingerprint || null,
      readRevision: from?.readRevision || from?.base || null,
      parentId:
        from?.id ||
        this.data.trees.find((x) => !x.deletedAt && x.head && x.head === from?.readRevision)?.id ||
        null,
      localFile: from?.localFile ? { ...from.localFile } : null,
      courses: from?.courses || [],
      createdAt: Date.now(),
    };
    this.data.trees.push(t);
    this.data.current = t.id;
    this.save();
    return t;
  }
  snapshotFile(id) {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('版本 ID 无效');
    return path.join(this.root, 'snapshots', id + '.zip');
  }
  put(t, snapshot, message = '自动备份', parent = t.head) {
    if (t.fingerprint === snapshot.fingerprint && t.head && message === '自动备份')
      return this.data.revisions[t.head];
    const r = C.revision(snapshot, this.data.device, message, parent);
    fs.writeFileSync(this.snapshotFile(r.id) + '.tmp', snapshot.bytes);
    fs.renameSync(this.snapshotFile(r.id) + '.tmp', this.snapshotFile(r.id));
    this.data.revisions[r.id] = r;
    t.head = r.id;
    t.fingerprint = r.fingerprint;
    const project = C.decode(snapshot.bytes).project;
    t.projectId = project.id;
    this.describe(t, project);
    this.save();
    return r;
  }
  backup(project, files, treeId = null, message) {
    let t = treeId ? this.tree(treeId) : this.data.trees.find((x) => x.id === this.data.current);
    // A new/opened project gets its own tree; never uploads to the previous project's branch.
    if (!t || t.deletedAt || (t.projectId && t.projectId !== project.id))
      t = this.create(project.name, 'project-' + crypto.randomUUID().slice(0, 8));
    this.put(t, C.encode(project, files), message);
    return t;
  }
  read(t) {
    if (!t.head) throw new Error('工作树还没有内容');
    return C.decode(fs.readFileSync(this.snapshotFile(t.head)));
  }
  draft(project, files, treeId = null) {
    let t = treeId ? this.tree(treeId) : this.data.trees.find((x) => x.id === this.data.current);
    if (!t || t.deletedAt || (t.projectId && t.projectId !== project.id))
      t = this.create(project.name, 'project-' + crypto.randomUUID().slice(0, 8));
    const snapshot = C.encode(project, files);
    t.projectId = project.id;
    this.describe(t, project);
    const file = path.join(this.root, 'drafts', t.id + '.zip');
    if (t.draftFingerprint !== snapshot.fingerprint || !fs.existsSync(file)) {
      fs.writeFileSync(file + '.tmp', snapshot.bytes);
      fs.renameSync(file + '.tmp', file);
      t.draftFingerprint = snapshot.fingerprint;
      this.save();
    }
    return t;
  }
  working(t = this.tree()) {
    const file = path.join(this.root, 'drafts', t.id + '.zip');
    return t.draftFingerprint && fs.existsSync(file)
      ? C.decode(fs.readFileSync(file))
      : this.read(t);
  }
  fork(name, branch, options = {}) {
    branch = String(branch || '').trim();
    name = String(name || '工作树').trim();
    if (this.data.trees.some((t) => !t.deletedAt && t.branch === branch))
      throw new Error('分支名已存在，请使用不同分支名。');
    if (!options.allowDuplicateName && this.data.trees.some((t) => !t.deletedAt && t.name === name))
      throw new Error('工作树名称重复，请改名或确认同名创建。');
    const t = this.create(name, branch, this.tree());
    t.base = null;
    this.save();
    return t;
  }
  move(id, parentId) {
    const t = this.tree(id),
      parent = parentId ? this.tree(parentId) : null;
    if (parent?.projectId && t.projectId !== parent.projectId)
      throw new Error('不同项目的工作树不能关联。');
    if (id === parentId) throw new Error('节点不能关联到自身。');
    let p = parent;
    while (p) {
      if (p.id === id) throw new Error('不能移动到子节点中，关联会产生循环。');
      p = p.parentId ? this.tree(p.parentId) : null;
    }
    t.parentId = parentId || null;
    this.save();
  }
  rename(id, name, allowDuplicateName = false) {
    name = String(name || '').trim();
    if (!name || name.length > 80) throw new Error('名称须为 1 至 80 个字。');
    if (
      !allowDuplicateName &&
      this.data.trees.some((t) => !t.deletedAt && t.id !== id && t.name === name)
    )
      throw new Error('工作树名称重复。');
    this.tree(id).name = name;
    this.save();
  }
  remove(id) {
    if (id === this.data.current) throw new Error('请先切换到其他工作树，再删除当前工作树。');
    const t = this.tree(id);
    t.deletedAt = Date.now();
    t.previousParentId = t.parentId;
    for (const child of this.data.trees)
      if (!child.deletedAt && child.parentId === id) child.parentId = t.parentId;
    this.save();
  }
  recover(id) {
    const t = this.data.trees.find((t) => t.id === id && t.deletedAt);
    if (!t) throw new Error('回收站节点不存在。');
    delete t.deletedAt;
    if (t.parentId && !this.data.trees.some((x) => x.id === t.parentId && !x.deletedAt))
      t.parentId = null;
    this.save();
  }
  linkFile(id, file, project) {
    const t = this.tree(id);
    if (t.projectId && t.projectId !== project.id)
      throw new Error('该文件属于其他项目，不能直接关联。');
    t.localFile = {
      path: path.resolve(file),
      hash: C.hash(fs.readFileSync(file)),
      linkedAt: Date.now(),
      courses: project.courses.map((c) => ({ id: c.id, name: c.name })),
    };
    this.save();
  }
  unlinkFile(id) {
    this.tree(id).localFile = null;
    this.save();
  }
  restore(id) {
    const r = this.data.revisions[id];
    if (!r) throw new Error('本地版本不存在');
    const old = C.decode(fs.readFileSync(this.snapshotFile(id)));
    this.put(this.tree(), C.encode(old.project, old.files), '恢复：' + r.message);
    return old;
  }
  importRemote(revision, snapshot, branch) {
    const existing = this.data.trees.find((t) => t.head === revision.id && t.branch === branch);
    if (existing) {
      if (existing.deletedAt) this.recover(existing.id);
      return existing;
    }
    fs.writeFileSync(this.snapshotFile(revision.id) + '.tmp', snapshot.bytes);
    fs.renameSync(this.snapshotFile(revision.id) + '.tmp', this.snapshotFile(revision.id));
    this.data.revisions[revision.id] = revision;
    const current = this.data.current;
    const t = this.create('云端 / ' + branch, branch, {
      base: revision.id,
      head: revision.id,
      fingerprint: revision.fingerprint,
      projectId: C.decode(snapshot.bytes).project.id,
    });
    this.data.current = current;
    this.save();
    return t;
  }
  status() {
    const active = this.data.trees.filter((t) => !t.deletedAt);
    const fileKey = (t) => t.localFile?.path?.toLowerCase();
    return {
      current: this.data.current,
      auto: this.data.auto,
      mode: this.data.mode || 'manual',
      device: this.data.device,
      trees: active.map((t) => ({
        ...t,
        localFile: t.localFile ? { ...t.localFile, exists: fs.existsSync(t.localFile.path) } : null,
        duplicateFile:
          !!fileKey(t) && active.some((x) => x.id !== t.id && fileKey(x) === fileKey(t)),
        duplicateName: active.some((x) => x.id !== t.id && x.name === t.name),
        pending: t.head !== t.base,
        unsaved: !!t.draftFingerprint && t.draftFingerprint !== t.fingerprint,
      })),
      trash: this.data.trees
        .filter((t) => t.deletedAt)
        .map((t) => ({ id: t.id, name: t.name, deletedAt: t.deletedAt })),
      history: Object.values(this.data.revisions)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 200)
        .map((r) => ({
          id: r.id,
          parent: r.parent,
          message: r.message,
          device: r.device,
          createdAt: r.createdAt,
          rooms: undefined,
        })),
      localPath: this.root,
    };
  }
}
module.exports = { Repository };
