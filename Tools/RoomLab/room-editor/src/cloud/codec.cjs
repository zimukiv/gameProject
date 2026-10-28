'use strict';
const crypto = require('node:crypto');
const { zipSync, unzipSync } = require('fflate');
const CHUNK = 4 * 1024 * 1024;
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + canonical(value[k]))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
function safePath(p) {
  return (
    typeof p === 'string' &&
    p.length < 300 &&
    (p === 'project.json' || /^assets\/[\p{L}\p{N}_. /-]+$/u.test(p)) &&
    !p.includes('..')
  );
}
function encode(project, files) {
  if (!project?.id || !Array.isArray(project.courses) || !Array.isArray(project.assets))
    throw new Error('项目结构无效');
  const entries = {
    'project.json': Buffer.from(canonical(require('../project/collision.cjs').portable(project))),
  };
  const map = files instanceof Map ? files : new Map(files);
  for (const a of project.assets) {
    if (!safePath(a.path) || a.path === 'project.json') throw new Error('素材路径无效');
    const b = map.get(a.path);
    if (!b) throw new Error('备份缺少素材：' + a.name);
    entries[a.path] = new Uint8Array(b);
  }
  if (Object.values(entries).reduce((n, b) => n + b.length, 0) > 128 * 1024 * 1024)
    throw new Error('项目超过 128 MiB');
  const chunks = new Map();
  const manifestFiles = Object.entries(entries)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, b]) => {
      const parts = [];
      for (let i = 0; i < b.length; i += CHUNK) {
        const data = b.slice(i, i + CHUNK),
          h = hash(data);
        chunks.set(h, data);
        parts.push({ hash: h, size: data.length });
      }
      return { path, hash: hash(b), size: b.length, chunks: parts };
    });
  return {
    summary: {
      projectName: String(project.name || '未命名项目').slice(0, 128),
      courseNames: project.courses.map((c) => String(c.name || '未命名大关').slice(0, 80)),
      roomCount: project.courses.reduce((n, c) => n + c.rooms.length, 0),
    },
    bytes: zipSync(entries, { level: 6 }),
    files: manifestFiles,
    chunks,
    fingerprint: hash(canonical(manifestFiles)),
  };
}
function decode(bytes) {
  if (!bytes || bytes.length > 135 * 1024 * 1024) throw new Error('备份容量超限');
  let total = 0,
    invalid = false;
  const entries = unzipSync(new Uint8Array(bytes), {
    filter: (f) => {
      total += f.originalSize;
      if (!safePath(f.name) || total > 128 * 1024 * 1024 || f.originalSize > 32 * 1024 * 1024) {
        invalid = true;
        return false;
      }
      return true;
    },
  });
  if (invalid || !entries['project.json']) throw new Error('备份内容无效');
  const project = require('../project/model.cjs').migrate(
    JSON.parse(Buffer.from(entries['project.json']).toString('utf8')),
  );
  if (!project?.id || !Array.isArray(project.courses) || !Array.isArray(project.assets))
    throw new Error('项目结构无效');
  return { project, files: Object.entries(entries).filter(([p]) => p !== 'project.json') };
}
function revision(snapshot, device, message, parent = null) {
  const r = {
    ...(snapshot.summary ? { summary: snapshot.summary } : {}),
    fingerprint: snapshot.fingerprint,
    files: snapshot.files,
    device,
    message: String(message || '自动备份').slice(0, 240),
    parent,
    createdAt: Date.now(),
    nonce: crypto.randomUUID(),
  };
  r.id = hash(canonical(r));
  return r;
}
module.exports = { hash, canonical, safePath, encode, decode, revision, CHUNK };
