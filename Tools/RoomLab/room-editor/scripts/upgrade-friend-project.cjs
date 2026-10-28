'use strict';
// One-shot upgrade into a NEW directory; never writes to the input project.
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const M = require('../src/project/model.cjs'),
  R = require('../src/plugins/registry.cjs');
const F = require('../src/desktop/project-files.cjs'),
  A = require('../src/project/archive.cjs');
const Repair = require('../src/project/repair-zone-bounds.cjs');
const { Engine } = require('../src/runtime/engine.cjs');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
function upgrade(input, output) {
  if (!input || !output)
    throw Error('Usage: node scripts/upgrade-friend-project.cjs input.json NEW-output-directory');
  input = path.resolve(input);
  output = path.resolve(output);
  if (fs.existsSync(output)) throw Error('输出目录已存在，请使用新目录，防止覆盖存档。');
  const original = fs.readFileSync(input),
    originalHash = sha(original);
  const raw = JSON.parse(original.toString('utf8')),
    loaded = F.readProject(input);
  if (loaded.missing.length) throw Error('素材缺失：' + loaded.missing.join('、'));
  const zones = loaded.project.courses.flatMap((c) =>
    c.rooms.flatMap((r) =>
      r.zones
        .filter((z) => z.x < 0 || z.y < 0 || z.x + z.w > r.cols || z.y + z.h > r.rows)
        .map((z) => z.id),
    ),
  );
  const { project, repairs } = Repair.prepare(loaded.project, zones);
  const errors = M.validate(project, { play: true }).errors;
  for (const c of project.courses)
    for (const r of c.rooms)
      for (const o of r.objects) errors.push(...R.validateObject(project, o));
  if (errors.length) throw Error(errors.join('\n'));
  for (const c of project.courses) for (const r of c.rooms) new Engine(project, c.id, r.id);
  const originals = raw.courses.flatMap((c) => c.rooms);
  const rooms = project.courses.flatMap((c) => c.rooms);
  const unchanged = {
    roomIDs: JSON.stringify(originals.map((r) => r.id)) === JSON.stringify(rooms.map((r) => r.id)),
    objectIDs:
      JSON.stringify(originals.map((r) => r.objects.map((o) => o.id))) ===
      JSON.stringify(rooms.map((r) => r.objects.map((o) => o.id))),
    connections:
      JSON.stringify(raw.courses.map((c) => c.connections)) ===
      JSON.stringify(project.courses.map((c) => c.connections)),
    traces:
      JSON.stringify(originals.map((r) => r.playTraces)) ===
      JSON.stringify(rooms.map((r) => r.playTraces)),
    assets: JSON.stringify(raw.assets) === JSON.stringify(project.assets),
  };
  if (Object.values(unchanged).some((v) => !v)) throw Error('保留性检查失败，停止输出');
  fs.mkdirSync(output, { recursive: true });
  F.writeProject(path.join(output, 'project.json'), project, loaded.files);
  const zipName = 'RoomLab-2.5.5-兼容存档.zip';
  fs.writeFileSync(
    path.join(output, zipName),
    A.pack(project, new Map(loaded.files.map((f) => [f.path, f.bytes]))),
  );
  if (sha(fs.readFileSync(input)) !== originalHash) throw Error('原始文件发生变化');
  const report = {
    version: '2.5.5',
    input,
    output,
    originalSHA256: originalHash,
    originalUnchanged: true,
    profile: project.compatibility,
    repairs,
    preserved: unchanged,
    rooms: rooms.length,
    checkpoints: rooms.flatMap((r) => r.objects).filter((o) => o.type === 'common.checkpoint')
      .length,
    assets: loaded.files.map((f) => ({ path: f.path, sha256: sha(f.bytes) })),
    editorValidation: M.validate(project),
    playValidation: M.validate(project, { play: true }),
    enginesConstructed: rooms.length,
    fullPlaythrough: false,
  };
  fs.writeFileSync(path.join(output, '升级报告.json'), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      output,
      zip: path.join(output, zipName),
      ...unchanged,
      originalUnchanged: true,
      rooms: rooms.length,
      repairs,
    }),
  );
  return report;
}
if (require.main === module) {
  try {
    upgrade(process.argv[2], process.argv[3]);
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
module.exports = { upgrade };
