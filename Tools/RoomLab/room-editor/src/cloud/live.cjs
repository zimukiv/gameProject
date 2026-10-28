'use strict';
const crypto = require('node:crypto'),
  fs = require('node:fs'),
  path = require('node:path'),
  C = require('./codec.cjs'),
  { merge } = require('../project/merge.cjs');
class Live {
  constructor(repo, remote) {
    this.repo = repo;
    this.remote = remote;
    this.device = crypto.randomUUID();
    this.channel = null;
    this.seq = 0;
    this.shared = null;
    this.conflict = null;
  }
  async tick(project, files, treeId) {
    const t = this.repo.tree(treeId),
      channel = C.hash(project.id + ':' + (t.readRevision || t.base || 'new'));
    const baseId = t.readRevision || t.base;
    if (!baseId) throw new Error('即时协作前，请先保存同步一次，并让双方读取同一云端版本');
    let local = C.encode(project, files);
    if (channel !== this.channel) {
      this.channel = channel;
      this.seq = 0;
      this.conflict = null;
      const data = C.decode(fs.readFileSync(this.repo.snapshotFile(baseId)));
      this.shared = C.encode(data.project, data.files);
    }
    const pulse = await this.remote.request('live', {
      device: this.device,
      channel,
      base: this.seq,
    });
    if (!pulse.online) return { online: false, peers: pulse.peers };
    if (this.conflict) return { online: true, peers: pulse.peers, conflicts: this.conflict.paths };
    let changed = false;
    if (pulse.revision && pulse.seq !== this.seq) {
      const incoming = await this.remote.downloadManifest(pulse.revision),
        remoteData = C.decode(incoming.snapshot.bytes),
        baseData = C.decode(this.shared.bytes),
        localData = C.decode(local.bytes);
      const result = merge(baseData.project, localData.project, remoteData.project),
        combined = new Map([...remoteData.files, ...localData.files]);
      if (result.conflicts.length) {
        fs.writeFileSync(
          path.join(this.repo.root, 'drafts', 'live-conflict-local.zip'),
          local.bytes,
        );
        fs.writeFileSync(
          path.join(this.repo.root, 'drafts', 'live-conflict-remote.zip'),
          incoming.snapshot.bytes,
        );
        this.conflict = { paths: result.conflicts, remote: incoming.snapshot };
      }
      local = C.encode(result.value, combined);
      this.shared = incoming.snapshot;
      this.seq = pulse.seq;
      changed = true;
    }
    if (!this.conflict && (!pulse.revision || local.fingerprint !== this.shared.fingerprint)) {
      await this.remote.uploadChunks(local);
      const r = C.revision(
        local,
        this.repo.data.device,
        '即时协作草稿（非版本）',
        t.readRevision || t.base || null,
      );
      const next = await this.remote.request('live', {
        device: this.device,
        channel,
        base: this.seq,
        proposal: r,
      });
      if (next.revision?.id === r.id) {
        this.seq = next.seq;
        this.shared = local;
      }
      // A competing proposal is merged on the next round, never overwritten.
    }
    const data = C.decode(local.bytes);
    this.repo.draft(data.project, data.files, t.id);
    return {
      online: true,
      peers: pulse.peers,
      conflicts: this.conflict?.paths || [],
      ...(changed ? data : {}),
    };
  }
  resolve(choice) {
    if (!this.conflict) return null;
    const data = choice === 'remote' ? C.decode(this.conflict.remote.bytes) : null;
    this.conflict = null;
    return data;
  }
}
module.exports = { Live };
