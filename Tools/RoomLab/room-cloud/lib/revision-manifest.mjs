// Shared revision manifest rules. The same checks must guard legacy D1/R2 writes
// and the optional GitHub-backed metadata store; never accept a manifest that the
// other backend would reject.
export const HASH = /^[a-f0-9]{64}$/;
export const MAX_CHUNK = 4 * 1024 * 1024;
export const MAX_PROJECT = 128 * 1024 * 1024;

export const canonical = value => Array.isArray(value)
  ? '[' + value.map(canonical).join(',') + ']'
  : value && typeof value === 'object'
    ? '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}'
    : JSON.stringify(value);

export async function sha256(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map(x => x.toString(16).padStart(2, '0'))
    .join('');
}

const invalid = (message, status = 400) => {
  throw Object.assign(new Error(message), {status});
};

/**
 * Validate only the immutable manifest shape and sizes. Parent existence and
 * branch ownership are deliberately left to the caller.
 */
export function assertManifest(revision) {
  const r = revision;
  if (!r || !HASH.test(r.id) || !HASH.test(r.fingerprint)
    || typeof r.message !== 'string' || r.message.length > 240
    || typeof r.device !== 'string' || r.device.length > 100
    || !Array.isArray(r.files) || !r.files.length || r.files.length > 1024) {
    invalid('版本信息无效');
  }
  let total = 0;
  const paths = new Set();
  for (const f of r.files) {
    if (typeof f.path !== 'string'
      || !(f.path === 'project.json' || /^assets\/[\p{L}\p{N}_. /-]+$/u.test(f.path))
      || f.path.includes('..')
      || paths.has(f.path)
      || !HASH.test(f.hash)
      || !Number.isSafeInteger(f.size) || f.size < 0
      || !Array.isArray(f.chunks) || f.chunks.length > 32) {
      invalid('文件清单无效');
    }
    paths.add(f.path);
    total += f.size;
    let size = 0;
    for (const c of f.chunks) {
      if (!HASH.test(c.hash) || !Number.isSafeInteger(c.size) || c.size < 1 || c.size > MAX_CHUNK) {
        invalid('分块信息无效');
      }
      size += c.size;
    }
    if (size !== f.size) invalid('文件大小不符');
  }
  if (!paths.has('project.json') || total > MAX_PROJECT) invalid('项目大小超限', 413);
  return r;
}

/** Recompute the content-addressed revision id and file fingerprint. */
export async function assertRevisionDigests(revision) {
  assertManifest(revision);
  const unsigned = {...revision};
  delete unsigned.id;
  if (await sha256(new TextEncoder().encode(canonical(unsigned))) !== revision.id) {
    invalid('版本校验失败');
  }
  if (await sha256(new TextEncoder().encode(canonical(revision.files))) !== revision.fingerprint) {
    invalid('文件清单校验失败');
  }
  return revision;
}
