'use strict';
// Project ZIP container. Uses the exact fflate 0.8.2 build the 2.5.5 editor exports with,
// vendored next to the runtime so no npm install and no machine-wide node_modules is needed.
// The central directory is parsed first so the capacity filter runs on the *declared*
// sizes, and every extracted entry is then checked against the declared length and CRC,
// which rejects lying sizes, truncated deflate streams and corrupted archives.
const { zipSync, unzipSync, strToU8, strFromU8 } = require('../../vendor/fflate/browser.cjs');
const M = require('./model.cjs');
const LIMIT_TOTAL = 128 * 1024 * 1024,
  LIMIT_ENTRY = 25 * 1024 * 1024;
function fail(message) {
  const error = new Error(message);
  error.archiveKind = 'zip';
  return error;
}
function crc32(bytes) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < bytes.length; i++) crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}
function u16(b, at) {
  return b[at] | (b[at + 1] << 8);
}
function u32(b, at) {
  return (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;
}
// Declared central-directory metadata, keyed by entry name.
function directory(bytes) {
  const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes.buffer || bytes, bytes.byteOffset || 0, bytes.byteLength);
  let eocd = -1;
  for (let at = b.length - 22; at >= 0 && at >= b.length - 65557; at--)
    if (u32(b, at) === 0x06054b50) { eocd = at; break; }
  if (eocd < 0) throw fail('不是有效的 ZIP 项目包（缺少中央目录）。');
  const count = u16(b, eocd + 10);
  let at = u32(b, eocd + 16);
  const entries = new Map();
  for (let i = 0; i < count; i++) {
    if (at + 46 > b.length || u32(b, at) !== 0x02014b50) throw fail('ZIP 中央目录损坏。');
    const method = u16(b, at + 10),
      expectedCrc = u32(b, at + 16),
      compSize = u32(b, at + 20),
      size = u32(b, at + 24),
      nameLen = u16(b, at + 28),
      extraLen = u16(b, at + 30),
      commentLen = u16(b, at + 32),
      name = b.toString('utf8', at + 46, at + 46 + nameLen);
    at += 46 + nameLen + extraLen + commentLen;
    if (size === 0xffffffff || compSize === 0xffffffff) throw fail('暂不支持 ZIP64 项目包。');
    entries.set(name, { method, crc: expectedCrc, size, compSize });
  }
  if (!entries.size) throw fail('项目包是空的。');
  return entries;
}
function wanted(name) {
  return name === 'project.json' || name.startsWith('assets/');
}
function unpack(bytes) {
  const declared = directory(bytes);
  let total = 0,
    tooLarge = false;
  // fflate calls this before inflating each entry, so a declared-oversized entry is never
  // decompressed: neither the 25 MiB per-entry cap nor the 128 MiB total cap can be bypassed.
  let files;
  try {
    files = unzipSync(bytes, {
      filter: (file) => {
        const entry = declared.get(file.name);
        if (!entry) throw fail('ZIP 中央目录与条目不一致：' + file.name);
        total += entry.size;
        if (total > LIMIT_TOTAL || entry.size > LIMIT_ENTRY || entry.compSize > LIMIT_ENTRY) {
          tooLarge = true;
          return false;
        }
        return wanted(file.name);
      },
    });
  } catch (error) {
    if (error && error.archiveKind) throw error;
    if (String(error && error.message).includes('容量')) throw fail('项目包解压容量超过限制。');
    throw fail('项目包解压失败：' + ((error && error.message) || error));
  }
  if (tooLarge) throw fail('项目包解压容量超过限制。');
  for (const name of Object.keys(files)) {
    const entry = declared.get(name),
      data = files[name];
    if (!entry) throw fail('项目包条目元数据缺失：' + name);
    if (entry.method !== 0 && entry.method !== 8) throw fail('项目包使用了不支持的压缩方式：' + entry.method);
    if (data.length !== entry.size) throw fail('项目包条目解压长度与声明不符：' + name);
    if (crc32(data) !== entry.crc) throw fail('项目包条目校验失败（CRC32）：' + name);
  }
  if (!files['project.json']) throw fail('项目包缺少 project.json。');
  const project = M.migrate(JSON.parse(strFromU8(files['project.json']))),
    errors = M.validate(project).errors;
  if (errors.length) throw fail(errors[0]);
  const blobs = new Map();
  for (const asset of project.assets) {
    if (files[asset.path]) blobs.set(asset.path, files[asset.path]);
    else throw fail('项目包缺素材：' + asset.name);
  }
  return { project, files: blobs };
}
function pack(project, files) {
  const errors = M.validate(project).errors;
  if (errors.length) throw new Error(errors[0]);
  const entries = {
    'project.json': strToU8(JSON.stringify(require('./collision.cjs').portable(project), null, 2)),
  };
  for (const asset of project.assets) {
    const bytes = files.get(asset.path);
    if (!bytes) throw new Error('缺少素材文件：' + asset.name);
    entries[asset.path] = bytes;
  }
  return zipSync(entries, { level: 6 });
}
module.exports = { pack, unpack, crc32, LIMIT_TOTAL, LIMIT_ENTRY };
