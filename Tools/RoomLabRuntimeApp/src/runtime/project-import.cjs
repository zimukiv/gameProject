'use strict';
// Explicit project import entry for the standalone runtime (stage 1).
// Accepts a RoomLab project.json or a project ZIP produced by editor 2.5.x, migrates it,
// validates every room/object/module, and never writes to the source file or the bundled
// default project.json. Callers swap engines only after this function returns successfully.
const fs = require('node:fs'),
  path = require('node:path'),
  { pathToFileURL } = require('node:url'),
  M = require('../project/model.cjs'),
  Registry = require('../plugins/registry.cjs'),
  Archive = require('../project/archive.cjs');
function fail(kind, message) {
  const error = new Error(message);
  error.importKind = kind;
  return error;
}
function validateProject(project) {
  const errors = M.validate(project).errors.slice();
  for (const course of project.courses || [])
    for (const room of course.rooms || []) {
      const seen = new Set();
      for (const o of room.objects || []) {
        if (seen.has(o.id)) errors.push('房间 ' + room.name + ' 存在重复对象 ID：' + o.id);
        seen.add(o.id);
        for (const e of Registry.validateObject(project, o)) errors.push(room.name + ' / ' + e);
      }
      for (const m of room.movables || [])
        if (seen.has(m.id)) errors.push('房间 ' + room.name + ' 存在重复移动块 ID：' + m.id);
    }
  if (!project.courses?.length) errors.push('项目没有任何大关。');
  if (errors.length) throw fail('structure', '项目校验失败：' + errors[0]);
  return project;
}
function loadProjectFile(file) {
  if (typeof file !== 'string' || !file.trim()) throw fail('path', '未指定项目文件路径。');
  const source = path.resolve(file),
    stat = fs.existsSync(source) ? fs.statSync(source) : null;
  if (!stat || !stat.isFile()) throw fail('path', '找不到项目文件：' + source);
  const extension = path.extname(source).toLowerCase();
  let project,
    files = null,
    baseDir = null;
  try {
    if (extension === '.json') {
      const text = fs.readFileSync(source, 'utf8');
      project = M.migrate(JSON.parse(text));
      baseDir = path.dirname(source);
      validateProject(project);
      for (const asset of project.assets || []) {
        const assetPath = path.resolve(baseDir, asset.path);
        if (!assetPath.startsWith(baseDir + path.sep))
          throw fail('structure', '素材路径越界：' + asset.path);
        if (!fs.existsSync(assetPath) || !fs.statSync(assetPath).isFile())
          throw fail('asset', '缺少素材文件：' + asset.name + '（' + asset.path + '）');
      }
    } else if (extension === '.zip') {
      const loaded = Archive.unpack(fs.readFileSync(source));
      files = loaded.files;
      project = loaded.project;
      validateProject(project);
    } else {
      throw fail('type', '不支持的项目文件类型：' + (extension || '无扩展名') + '（仅支持 .json / .zip）');
    }
  } catch (error) {
    if (error.importKind) throw error;
    if (error instanceof SyntaxError) throw fail('json', '项目 JSON 解析失败：' + error.message);
    throw fail('load', '项目读取失败：' + (error.message || String(error)));
  }
  const resolved = new Map();
  for (const asset of project.assets || []) {
    if (files && files.has(asset.path)) {
      const bytes = files.get(asset.path),
        mime = asset.mime || 'application/octet-stream';
      resolved.set(asset.id, 'data:' + mime + ';base64,' + Buffer.from(bytes).toString('base64'));
    } else if (baseDir) {
      resolved.set(asset.id, pathToFileURL(path.resolve(baseDir, asset.path)).href);
    }
  }
  return {
    project,
    source: { path: source, kind: extension === '.zip' ? 'zip' : 'json' },
    assetUrl: (id) => resolved.get(id) || null,
    close: () => files && files.clear(),
  };
}
module.exports = { loadProjectFile, validateProject };
