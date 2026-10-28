'use strict';
const { zipSync, unzipSync, strToU8, strFromU8 } = require('fflate'),
  M = require('./model.cjs');
function pack(project, files) {
  const errors = M.validate(project).errors;
  if (errors.length) throw new Error(errors[0]);
  const entries = { 'project.json': strToU8(JSON.stringify(project, null, 2)) };
  for (const asset of project.assets) {
    const bytes = files.get(asset.path);
    if (!bytes) throw new Error('缺少素材文件：' + asset.name);
    entries[asset.path] = bytes;
  }
  return zipSync(entries, { level: 6 });
}
function unpack(bytes) {
  let total = 0,
    tooLarge = false;
  const files = unzipSync(bytes, {
    filter: (file) => {
      total += file.originalSize;
      if (total > 128 * 1024 * 1024 || file.originalSize > 25 * 1024 * 1024) {
        tooLarge = true;
        return false;
      }
      return file.name === 'project.json' || file.name.startsWith('assets/');
    },
  });
  if (tooLarge) throw new Error('项目包解压容量超过限制。');
  if (!files['project.json']) throw new Error('项目包缺少 project.json。');
  const project = M.migrate(JSON.parse(strFromU8(files['project.json']))),
    errors = M.validate(project).errors;
  if (errors.length) throw new Error(errors[0]);
  const blobs = new Map();
  for (const asset of project.assets) {
    if (files[asset.path]) blobs.set(asset.path, files[asset.path]);
    else throw new Error('项目包缺素材：' + asset.name);
  }
  return { project, files: blobs };
}
module.exports = { pack, unpack };
