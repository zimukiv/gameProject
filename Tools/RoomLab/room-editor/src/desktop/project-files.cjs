'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  M = require('../project/model.cjs'),
  Archive = require('../project/archive.cjs');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
function inside(root, relative) {
  if (
    typeof relative !== 'string' ||
    !relative.startsWith('assets/') ||
    relative.includes('..') ||
    /[\\:\0]/.test(relative)
  )
    throw new Error('素材路径不是项目内的相对路径。');
  const base = path.resolve(root),
    target = path.resolve(base, relative),
    prefix = base.toLowerCase() + path.sep;
  if (!target.toLowerCase().startsWith(prefix)) throw new Error('素材路径越界。');
  let parent = path.dirname(target);
  while (!fs.existsSync(parent) && parent !== base) parent = path.dirname(parent);
  if (fs.existsSync(parent)) {
    const real = fs.realpathSync(parent),
      realBase = fs.realpathSync(base);
    if (
      real.toLowerCase() !== realBase.toLowerCase() &&
      !real.toLowerCase().startsWith(realBase.toLowerCase() + path.sep)
    )
      throw new Error('素材目录链接指向项目外。');
  }
  return target;
}
function readProject(file) {
  if (path.extname(file).toLowerCase() === '.zip') {
    const pack = Archive.unpack(new Uint8Array(fs.readFileSync(file)));
    return {
      project: pack.project,
      files: [...pack.files].map(([assetPath, bytes]) => ({ path: assetPath, bytes })),
      missing: [],
    };
  }
  const project = M.migrate(JSON.parse(fs.readFileSync(file, 'utf8'))),
    errors = M.validate(project).errors;
  if (errors.length) throw new Error(errors[0]);
  const root = path.dirname(path.resolve(file)),
    files = [],
    missing = [],
    builtIns = require('../assets/seeds.cjs').restoreBuiltIns(project.assets, new Map());
  for (const a of project.assets) {
    const assetPath = inside(root, a.path);
    if (fs.existsSync(assetPath))
      files.push({ path: a.path, bytes: new Uint8Array(fs.readFileSync(assetPath)) });
    else if (builtIns.has(a.path)) files.push({ path: a.path, bytes: builtIns.get(a.path) });
    else missing.push(a.name);
  }
  return { project, files, missing };
}
function writeWithBackup(file, bytes) {
  const root = path.dirname(path.resolve(file)),
    temp = file + '.tmp-' + crypto.randomUUID();
  fs.writeFileSync(temp, bytes);
  if (fs.existsSync(file)) {
    const backups = path.join(root, '.project-backups');
    fs.mkdirSync(backups, { recursive: true });
    fs.copyFileSync(
      file,
      path.join(backups, Date.now() + '-' + crypto.randomUUID() + path.extname(file)),
    );
  }
  fs.renameSync(temp, file);
  return { file, root };
}
function writeProject(file, project, files, options = {}) {
  const replaceAssets = options.replaceAssets === true;
  const errors = M.validate(project).errors;
  if (errors.length) throw new Error(errors[0]);
  const root = path.dirname(path.resolve(file));
  fs.mkdirSync(root, { recursive: true });
  const map = new Map(files.map((item) => [item.path, new Uint8Array(item.bytes)])),
    builtIns = require('../assets/seeds.cjs').restoreBuiltIns(project.assets, new Map());
  if (path.extname(file).toLowerCase() === '.zip')
    return writeWithBackup(file, Archive.pack(project, map));
  // Preflight all collisions before writing project.json or any bytes. A same-named
  // asset with different bytes is reported to the caller, which may either stop
  // (default, keeps the previous hard failure for library callers) or ask the user
  // and save again with replaceAssets, in which case the old bytes are kept aside.
  const writes = [],
    conflicts = [];
  for (const a of project.assets) {
    const target = inside(root, a.path),
      exists = fs.existsSync(target),
      bytes = map.get(a.path) || (!exists && builtIns.get(a.path));
    if (!bytes) {
      if (!exists) throw new Error('缺少素材：' + a.name);
      continue;
    }
    if (exists) {
      if (sha(fs.readFileSync(target)) !== sha(bytes)) {
        if (replaceAssets) writes.push({ target, bytes, replaced: true });
        else conflicts.push({ path: a.path, name: a.name });
        continue;
      }
    } else writes.push({ target, bytes });
  }
  if (conflicts.length) {
    const error = new Error(
      '已有素材内容不同：' +
        conflicts[0].path +
        '。请另存新目录、在素材库替换，或确认覆盖后重试。',
    );
    error.code = 'asset-conflict';
    error.assetConflicts = conflicts;
    throw error;
  }
  let backupRoot = null;
  for (const item of writes) {
    fs.mkdirSync(path.dirname(item.target), { recursive: true });
    if (item.replaced) {
      if (!backupRoot) {
        backupRoot = path.join(root, '.project-backups', 'assets-' + Date.now());
      }
      const kept = path.join(backupRoot, path.relative(root, item.target));
      fs.mkdirSync(path.dirname(kept), { recursive: true });
      fs.copyFileSync(item.target, kept);
    }
    fs.writeFileSync(item.target, item.bytes);
  }
  return writeWithBackup(
    file,
    JSON.stringify(require('../project/collision.cjs').portable(project), null, 2),
  );
}
// Confirmation-aware save used by the desktop handler: a folder that already holds
// same-named artwork with different bytes is not a fatal error, it is one question.
// `confirm(conflicts, file)` may be sync or async and returns whether to overwrite.
async function writeProjectWithConfirmation(file, project, files, confirm) {
  try {
    return writeProject(file, project, files);
  } catch (error) {
    if (!error || error.code !== 'asset-conflict') throw error;
    const accepted = typeof confirm === 'function' ? await confirm(error.assetConflicts, file) : false;
    if (!accepted) return null;
    return writeProject(file, project, files, { replaceAssets: true });
  }
}
module.exports = { inside, readProject, writeProject, writeProjectWithConfirmation };
