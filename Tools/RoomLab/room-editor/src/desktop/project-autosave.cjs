'use strict';
// Native side of minute autosave. Autosave may only write the project file the
// user actually opened or associated, and only while its on-disk bytes still
// match the hash read when we last opened/saved/linked it. Anything else (no
// file yet, externally edited file, other project) becomes a recovery snapshot
// under the local profile so the good file is never silently replaced.
// Manual save and autosave deliberately share project-files.cjs's preflight and
// atomic/backup writer; this module never talks to the cloud.
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  Files = require('./project-files.cjs');
const RECOVERY_FOLDER = 'RoomLabRecovery',
  RECOVERY_BACKUPS = 5;
function hashFile(file) {
  return fs.existsSync(file)
    ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
    : null;
}
// Project IDs become one folder name, so keep them readable but never a path.
function folder(id) {
  const safe = String(id || 'project')
    .replace(/[^\p{L}\p{N}_.-]+/gu, '_')
    .replace(/^[._]+/, '')
    .slice(0, 80);
  return safe || 'project';
}
function recoveryFile(root, project) {
  if (!root) throw new Error('缺少本机恢复目录。');
  return path.join(root, folder(project?.id), 'project.json');
}
// Recovery snapshots keep a small backup ring instead of growing one file per
// minute; a user-chosen project file keeps every backup the manual writer made.
function pruneBackups(file, keep = RECOVERY_BACKUPS) {
  try {
    const dir = path.join(path.dirname(file), '.project-backups'),
      names = fs
        .readdirSync(dir)
        .filter((name) => name.toLowerCase().endsWith(path.extname(file).toLowerCase()))
        .sort()
        .reverse();
    for (const name of names.slice(keep)) fs.unlinkSync(path.join(dir, name));
  } catch {}
}
// Resolve which file (if any) the autosave may target. A session created by
// 打开/保存项目 wins; otherwise the current worktree's associated file is used.
// A stale session for another project and a 另存为 request never target a file.
// `forced` is only passed by test-mode payloads (project:save already does this).
function candidateFor({
  payload = {},
  project,
  sessions = new Map(),
  current = null,
  forced = null,
} = {}) {
  if (!project || typeof project.id !== 'string') return null;
  const saved = payload.session ? sessions.get(payload.session) : null;
  if (saved && saved.projectId === project.id && saved.file)
    return { file: saved.file, projectId: project.id, expectedHash: saved.hash };
  if (forced) {
    const known = [...sessions.values()].find(
      (item) =>
        item.projectId === project.id &&
        item.file &&
        item.file.toLowerCase() === forced.toLowerCase() &&
        item.hash,
    );
    return {
      file: forced,
      projectId: project.id,
      expectedHash:
        typeof payload.testExpectedHash === 'string'
          ? payload.testExpectedHash
          : known?.hash || null,
    };
  }
  if (payload.saveAs) return null;
  if (current?.projectId !== project.id || !current.localFile?.path) return null;
  return {
    file: current.localFile.path,
    projectId: current.projectId,
    expectedHash: current.localFile.hash || null,
  };
}
// Returns a plain result object. Expected outcomes (conflict, missing asset,
// unwritable recovery) are reported instead of thrown, so the renderer can show
// a failure state without treating autosave as a fatal error.
function autosave({
  project,
  files = [],
  candidate = null,
  recoveryRoot,
  write = Files.writeProject,
  hash = hashFile,
  now = Date.now,
} = {}) {
  const at = now();
  if (!project || typeof project !== 'object' || typeof project.id !== 'string')
    return { ok: false, at, mode: null, error: '项目数据无效，未自动保存。' };
  const recover = (warning, { conflict = true, error = null } = {}) => {
    try {
      const file = recoveryFile(recoveryRoot, project);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      write(file, project, files);
      pruneBackups(file);
      return { ok: true, at, mode: 'recovery', conflict, file, warning };
    } catch (e) {
      return { ok: false, at, mode: 'recovery', conflict, error: error || e.message, warning };
    }
  };
  if (!candidate || typeof candidate.file !== 'string' || !candidate.file)
    return recover('尚未选择项目文件，已把完整本机快照保存到本机恢复目录。', {
      conflict: false,
    });
  if (candidate.projectId && candidate.projectId !== project.id)
    return recover('当前项目文件属于其他项目，已改为保存本机恢复快照。');
  const onDisk = hash(candidate.file);
  if (!onDisk || !candidate.expectedHash || onDisk !== candidate.expectedHash)
    return recover(
      '项目文件已被其他程序修改，自动保存没有覆盖它；已保留恢复快照，请手动确认后另存。',
    );
  try {
    const result = write(candidate.file, project, files);
    return { ok: true, at, mode: 'file', file: result?.file || candidate.file };
  } catch (e) {
    // Preflight failures (missing or conflicting artwork, invalid project) happen
    // before project.json is written, so the existing good file stays intact.
    // The failure is reported even when a fallback snapshot could be written:
    // the user's chosen file was not saved, so the next tick must retry it.
    const fallback = recover('自动保存没有写入项目文件：' + e.message, {
      conflict: false,
      error: e.message,
    });
    return fallback.ok ? { ...fallback, ok: false, error: e.message } : fallback;
  }
}
module.exports = {
  autosave,
  candidateFor,
  hashFile,
  recoveryFile,
  pruneBackups,
  RECOVERY_FOLDER,
};
