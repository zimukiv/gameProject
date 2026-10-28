'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  M = require('../project/model.cjs');
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
  const project = M.migrate(JSON.parse(fs.readFileSync(file, 'utf8'))),
    errors = M.validate(project).errors;
  if (errors.length) throw new Error(errors[0]);
  const root = path.dirname(path.resolve(file)),
    files = [],
    missing = [];
  for (const a of project.assets) {
    const assetPath = inside(root, a.path);
    if (fs.existsSync(assetPath))
      files.push({ path: a.path, bytes: new Uint8Array(fs.readFileSync(assetPath)) });
    else missing.push(a.name);
  }
  return { project, files, missing };
}
function writeProject(file, project, files) {
  const errors = M.validate(project).errors;
  if (errors.length) throw new Error(errors[0]);
  const root = path.dirname(path.resolve(file));
  fs.mkdirSync(root, { recursive: true });
  const map = new Map(files.map((item) => [item.path, new Uint8Array(item.bytes)]));
  // Preflight all collisions before writing project.json or any bytes.
  const writes = [];
  for (const a of project.assets) {
    const target = inside(root, a.path),
      bytes = map.get(a.path);
    if (!bytes) {
      if (!fs.existsSync(target)) throw new Error('缺少素材：' + a.name);
      continue;
    }
    if (fs.existsSync(target)) {
      if (sha(fs.readFileSync(target)) !== sha(bytes))
        throw new Error('已有素材内容不同：' + a.path + '。请另存新目录或在素材库替换。');
    } else writes.push({ target, bytes });
  }
  for (const item of writes) {
    fs.mkdirSync(path.dirname(item.target), { recursive: true });
    fs.writeFileSync(item.target, item.bytes);
  }
  const temp = file + '.tmp-' + crypto.randomUUID();
  fs.writeFileSync(
    temp,
    JSON.stringify(require('../project/collision.cjs').portable(project), null, 2),
    'utf8',
  );
  if (fs.existsSync(file)) {
    const backups = path.join(root, '.project-backups');
    fs.mkdirSync(backups, { recursive: true });
    fs.copyFileSync(file, path.join(backups, Date.now() + '-' + crypto.randomUUID() + '.json'));
  }
  fs.renameSync(temp, file);
  return { file, root };
}
module.exports = { inside, readProject, writeProject };
