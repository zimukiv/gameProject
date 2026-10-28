'use strict';
// This module has no Electron dependency; the vault receives safeStorage from the trusted main process.
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
function parse(text, allowLocal = false) {
  let data;
  try {
    if (!text.startsWith('rlsync1.')) throw 0;
    data = JSON.parse(Buffer.from(text.slice(8), 'base64url').toString());
  } catch {
    throw new Error('连接密钥格式无效');
  }
  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    typeof data.endpoint !== 'string' ||
    typeof data.workspaceKey !== 'string' ||
    typeof data.accessToken !== 'string'
  )
    throw new Error('连接密钥内容无效，请从主电脑重新复制完整密钥。');
  let u;
  try {
    u = new URL(data.endpoint);
  } catch {
    throw new Error('连接密钥地址无效，请重新复制完整密钥。');
  }
  const local =
    allowLocal && u.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(u.hostname);
  if (
    (!local && (u.protocol !== 'https:' || !u.hostname.endsWith('.chatgpt.site'))) ||
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    u.pathname !== '/' ||
    !/^[A-Za-z0-9_-]{43}$/.test(data.workspaceKey) ||
    typeof data.accessToken !== 'string' ||
    data.accessToken.length < 12 ||
    data.accessToken.length > 8192 ||
    /[\r\n]/.test(data.accessToken) ||
    (data.authMode !== undefined && !['workspace', 'service'].includes(data.authMode))
  )
    throw new Error('连接密钥地址或授权无效');
  return {
    v: 1,
    endpoint: u.origin,
    workspaceKey: data.workspaceKey,
    accessToken: data.accessToken,
    ...(data.authMode ? { authMode: data.authMode } : {}),
  };
}
function format(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new Error('尚未导入有效连接密钥，不能复制。');
  return 'rlsync1.' + Buffer.from(JSON.stringify(data)).toString('base64url');
}
class Vault {
  constructor(root, safeStorage) {
    this.file = path.join(root, 'connection.vault');
    this.safeStorage = safeStorage;
    fs.mkdirSync(root, { recursive: true });
  }
  load() {
    if (!fs.existsSync(this.file)) return null;
    if (!this.safeStorage.isEncryptionAvailable()) throw new Error('Windows 加密存储不可用');
    return JSON.parse(this.safeStorage.decryptString(fs.readFileSync(this.file)));
  }
  save(data) {
    if (!this.safeStorage.isEncryptionAvailable()) throw new Error('Windows 加密存储不可用');
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, this.safeStorage.encryptString(JSON.stringify(data)));
    fs.renameSync(tmp, this.file);
  }
}
class Remote {
  constructor(
    connection,
    fetcher = process.platform === 'win32' ? require('./windows-http.cjs').request : fetch,
  ) {
    this.c = connection;
    this.fetcher = fetcher;
    this.cache = new Map();
    this.cacheBytes = 0;
  }
  async request(route, body, method = body ? 'POST' : 'GET', raw = false) {
    const send = (target, serviceAuth) =>
      this.fetcher(this.c.endpoint + '/api/room-sync/' + target, {
        method,
        redirect: 'error',
        signal: AbortSignal.timeout(45000),
        headers: {
          ...(serviceAuth ? { 'OAI-Sites-Authorization': 'Bearer ' + this.c.accessToken } : {}),
          'X-Room-Workspace-Key': this.c.workspaceKey,
          ...(body && !raw ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: raw ? body : JSON.stringify(body) } : {}),
      });
    let response;
    try {
      response = await send(route, this.c.authMode !== 'workspace');
      // Retry only the read-only handshake. Never replay writes or relax a private site's access.
      if (
        route === 'state' &&
        method === 'GET' &&
        response.status === 403 &&
        this.c.authMode !== 'workspace'
      ) {
        try {
          const health = await send('health', false),
            info = health.ok ? await health.json().catch(() => null) : null;
          if (info?.service === 'room-lab-sync' && info.protocol === 1) {
            const publicState = await send('state', false),
              state = await publicState
                .clone()
                .json()
                .catch(() => null);
            if (
              publicState.ok &&
              Array.isArray(state?.branches) &&
              Array.isArray(state?.revisions)
            ) {
              response = publicState;
              this.c.authMode = 'workspace';
            } else if (publicState.status === 401 && state?.error === '工作区密钥无效')
              response = publicState;
          }
        } catch {
          /* Keep the original 403 evidence if the optional public handshake is unavailable. */
        }
      }
    } catch {
      const e = new Error(
        '桌面网络连接未完成。若同一密钥在浏览器可用，请检查编辑器的系统代理或复制诊断信息。',
      );
      e.diagnostic = {
        endpoint: this.c.endpoint,
        route: route.split('/')[0],
        transport: this.fetcher.transport || 'native',
        httpStatus: null,
        responseKind: 'network',
      };
      throw e;
    }
    if (!response.ok) {
      let error;
      try {
        error = await response.json();
      } catch {}
      const e = new Error(
        [401, 403].includes(response.status)
          ? error?.error === '工作区密钥无效'
            ? '工作区密钥未通过校验（HTTP 401），请重新导入主电脑复制的完整密钥。'
            : '网站访问授权失败（HTTP ' +
              response.status +
              '），请核对云端网址和网站访问权限，再重新导入密钥。'
          : error?.error || '云端请求失败（' + response.status + '）',
      );
      e.status = response.status;
      e.head = error?.head;
      const type = response.headers.get('content-type') || '';
      e.diagnostic = {
        endpoint: this.c.endpoint,
        route: route.split('/')[0],
        transport: this.fetcher.transport || 'native',
        httpStatus: response.status,
        responseKind: type.includes('json') ? 'json' : type.includes('html') ? 'html' : 'other',
      };
      throw e;
    }
    return raw && method === 'GET' ? new Uint8Array(await response.arrayBuffer()) : response.json();
  }
  state() {
    return this.request('state');
  }
  remember(hash, data) {
    if (this.cache.has(hash)) return;
    this.cache.set(hash, data);
    this.cacheBytes += data.length;
    while (this.cacheBytes > 64 * 1024 * 1024) {
      const k = this.cache.keys().next().value;
      this.cacheBytes -= this.cache.get(k).length;
      this.cache.delete(k);
    }
  }
  async uploadChunks(snapshot) {
    for (const [h, b] of snapshot.chunks) this.remember(h, b);
    const hashes = [...snapshot.chunks.keys()];
    for (let i = 0; i < hashes.length; i += 32) {
      const { missing } = await this.request('missing', { hashes: hashes.slice(i, i + 32) });
      for (const h of missing)
        await this.request('chunks/' + h, snapshot.chunks.get(h), 'PUT', true);
    }
  }
  async upload(snapshot, rev, branch, base) {
    await this.uploadChunks(snapshot);
    return this.request('commit', { branch, base, revision: rev });
  }
  async download(id) {
    return this.downloadManifest(await this.request('revisions/' + id), id);
  }
  async fileBytes(f) {
    const C = require('./codec.cjs');
    if (
      !C.safePath(f?.path) ||
      !Number.isSafeInteger(f.size) ||
      f.size < 0 ||
      f.size > 32 * 1024 * 1024 ||
      !Array.isArray(f.chunks) ||
      f.chunks.length > 32
    )
      throw new Error('云端文件无效');
    const bytes = new Uint8Array(f.size);
    let offset = 0;
    for (const chunk of f.chunks) {
      if (
        !/^[a-f0-9]{64}$/.test(chunk.hash) ||
        !Number.isSafeInteger(chunk.size) ||
        chunk.size < 1 ||
        offset + chunk.size > f.size
      )
        throw new Error('云端分块信息无效');
      const part =
        this.cache.get(chunk.hash) ||
        (await this.request('chunks/' + chunk.hash, null, 'GET', true));
      if (part.length !== chunk.size || C.hash(part) !== chunk.hash)
        throw new Error('云端分块校验失败');
      this.remember(chunk.hash, part);
      bytes.set(part, offset);
      offset += part.length;
    }
    if (offset !== f.size || C.hash(bytes) !== f.hash) throw new Error('云端文件校验失败');
    return bytes;
  }
  async readProject(id) {
    const C = require('./codec.cjs'),
      M = require('../project/model.cjs'),
      revision = await this.request('revisions/' + id),
      unsigned = { ...revision };
    delete unsigned.id;
    if (
      revision.id !== id ||
      C.hash(C.canonical(unsigned)) !== id ||
      !Array.isArray(revision.files) ||
      revision.files.length > 1024 ||
      C.hash(C.canonical(revision.files)) !== revision.fingerprint
    )
      throw new Error('云端版本校验失败');
    const projectFiles = revision.files.filter((f) => f.path === 'project.json');
    if (projectFiles.length !== 1) throw new Error('云端项目清单无效');
    const project = M.migrate(
        JSON.parse(Buffer.from(await this.fileBytes(projectFiles[0])).toString('utf8')),
      ),
      errors = M.validate(project).errors;
    if (errors.length) throw new Error(errors[0]);
    return { project, revision, byteSize: projectFiles[0].size };
  }
  async downloadManifest(r, expectedId = r?.id) {
    const C = require('./codec.cjs'),
      { zipSync } = require('fflate');
    const unsigned = { ...r };
    delete unsigned.id;
    if (
      !Array.isArray(r?.files) ||
      r.files.length > 1024 ||
      r.id !== expectedId ||
      C.hash(C.canonical(unsigned)) !== r.id ||
      C.hash(C.canonical(r.files)) !== r.fingerprint
    )
      throw new Error('云端版本校验失败');
    const entries = {},
      chunks = new Map(),
      paths = new Set();
    let total = 0;
    for (const f of r.files) {
      if (
        !C.safePath(f?.path) ||
        paths.has(f.path) ||
        !Number.isSafeInteger(f.size) ||
        f.size < 0 ||
        (total += f.size) > 128 * 1024 * 1024
      )
        throw new Error('云端文件无效');
      paths.add(f.path);
      const bytes = await this.fileBytes(f);
      entries[f.path] = bytes;
      let offset = 0;
      for (const part of f.chunks) {
        chunks.set(part.hash, bytes.slice(offset, offset + part.size));
        offset += part.size;
      }
    }
    if (!entries['project.json']) throw new Error('云端项目清单无效');
    const project = JSON.parse(Buffer.from(entries['project.json']).toString('utf8'));
    if (!project?.id || !Array.isArray(project.courses) || !Array.isArray(project.assets))
      throw new Error('项目结构无效');
    // Keep signed original bytes. Runtime migration is performed only by C.decode afterwards.
    // Re-encoding through portable() here would change old manifests during upgrades.
    const snapshot = {
      bytes: zipSync(entries, { level: 6 }),
      files: r.files,
      fingerprint: r.fingerprint,
      chunks,
      ...(r.summary ? { summary: r.summary } : {}),
    };
    return { revision: r, snapshot };
  }
}
module.exports = {
  parse,
  format,
  Vault,
  Remote,
  newWorkspaceKey: () => crypto.randomBytes(32).toString('base64url'),
};
