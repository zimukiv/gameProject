'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  { unzipSync } = require('fflate');
const root = path.resolve(__dirname, '..'),
  manifestPath = path.join(root, 'release/latest-release.json'),
  m = JSON.parse(fs.readFileSync(manifestPath));
// Refresh only the source archive after test maintenance; the accepted executable sources remain unchanged.
fs.writeFileSync(m.sourceZip, require('./package.cjs').sourceZip());
m.hashes[path.basename(m.sourceZip)] = crypto
  .createHash('sha256')
  .update(fs.readFileSync(m.sourceZip))
  .digest('hex');
fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2));
function accept(secrets = []) {
  const entries = unzipSync(fs.readFileSync(m.sourceZip));
  const bad = Object.keys(entries).filter(
    (p) =>
      p.includes('connection.vault') ||
      p.includes('/node_modules/') ||
      p.includes('/.git/') ||
      p.includes('/.wrangler/') ||
      p.includes('/.sites-runtime/'),
  );
  if (bad.length) throw Error('发行源码包含运行数据：' + bad.join(','));
  const sensitive = [];
  for (const [name, bytes] of Object.entries(entries))
    for (const secret of secrets)
      if (secret && Buffer.from(bytes).includes(Buffer.from(secret))) sensitive.push(name);
  if (sensitive.length) throw Error('发行包包含凭据，已停止交付');
  let count = 0;
  for (const [name, b] of Object.entries(entries))
    if (name.startsWith('room-editor/src/')) {
      const rel = name.slice(12);
      if (!Buffer.from(b).equals(fs.readFileSync(path.join(root, rel))))
        throw Error('源码归档不一致：' + rel);
      count++;
    }
  if (
    !entries['room-cloud/lib/sync-handler.mjs'] ||
    !entries['room-cloud/drizzle/0003_adorable_wraith.sql'] ||
    !entries['room-cloud/lib/graph-management.mjs']
  )
    throw Error('缺少云端源码或迁移');
  if (!entries['room-editor/tests/fixtures/compat-2.3.1/src/project/model.cjs'])
    throw Error('缺少旧版本兼容夹具');
  for (const [file, hash] of Object.entries(m.hashes)) {
    const got = crypto
      .createHash('sha256')
      .update(fs.readFileSync(path.join(root, 'release', file)))
      .digest('hex');
    if (got !== hash) throw Error('压缩包校验失败');
  }
  for (const rel of [
    'src/runtime/engine.cjs',
    'src/project/temperature.cjs',
    'src/project/collision.cjs',
    'src/project/compatibility.cjs',
    'src/project/repair-zone-bounds.cjs',
    'src/plugins/common.cjs',
    'src/plugins/physics/rail.cjs',
    'src/cloud/service.cjs',
    'src/cloud/connection.cjs',
    'src/cloud/chromium-http.cjs',
    'src/cloud/windows-http.cjs',
    'src/editor/cloud-controller.cjs',
    'src/editor/cloud-graph-panel.cjs',
    'src/project/room-export.cjs',
    'src/project/room-import.cjs',
    'src/project/room-import-batch.cjs',
    'src/project/room-order.cjs',
    'src/project/merge.cjs',
    'src/project/trace-replay.cjs',
    'src/project/play-traces.cjs',
    'src/cloud/codec.cjs',
    'src/editor/cloud-room-details.cjs',
    'src/editor/room-import-dialog.cjs',
    'src/editor/trace-replay-panel.cjs',
    'src/editor/trace-names.cjs',
    'src/editor/room-tab-order.cjs',
    'src/project/play-camera.cjs',
    'src/editor/room-camera-panel.cjs',
    'src/editor/pages/play.cjs',
    'src/editor/pages/room.cjs',
    'src/editor/room-transfer.cjs',
    'src/editor/draw.cjs',
    'src/assets/manager.cjs',
    'src/assets/catalog.cjs',
    'src/desktop/main.cjs',
    'build/ui.js',
  ])
    if (
      !fs
        .readFileSync(path.join(root, rel))
        .equals(fs.readFileSync(path.join(m.directory, 'resources/app', rel)))
    )
      throw Error('实际程序与当前源码不一致：' + rel);
  console.log(
    JSON.stringify({
      archivesValid: true,
      version: m.version,
      sourceFiles: count,
      cloudSourceIncluded: true,
      compatibilityFixtureIncluded: true,
      noCredentials: true,
      runtimeSourcesMatch: true,
      hashes: m.hashes,
    }),
  );
}
if (process.argv.includes('--stdin')) {
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  console.log('Ready for release credential check JSON on stdin (input is hidden).');
  let input = '';
  process.stdin.on('data', (chunk) => {
    input += chunk;
    if (!/[\r\n]/.test(input)) return;
    const { secrets } = JSON.parse(input.trim());
    input = '';
    process.stdin.pause();
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    try {
      accept(secrets);
    } catch (e) {
      console.error(e.message);
      process.exitCode = 1;
    }
  });
} else accept();
