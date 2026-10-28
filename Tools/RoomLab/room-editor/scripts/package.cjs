'use strict';
// Portable distribution: preserve the official Electron runtime and include only app runtime dependencies.
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  { zipSync } = require('fflate');
const root = path.resolve(__dirname, '..'),
  version = require('../package.json').version;
function inside(base, target) {
  const rel = path.relative(base, target);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('输出目录不安全');
  return target;
}
function zipTree(folder, prefix = '') {
  const entries = {};
  function visit(dir, rel) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, item.name),
        name = rel + item.name;
      if (item.isDirectory()) visit(file, name + '/');
      else if (item.isFile()) entries[prefix + name] = new Uint8Array(fs.readFileSync(file));
    }
  }
  visit(folder, '');
  return zipSync(entries, { level: 6 });
}
function sourceZip() {
  const entries = {},
    excluded = new Set([
      'node_modules',
      'build',
      'release',
      'test-output',
      '.git',
      'dist',
      '.wrangler',
      '.sites-runtime',
      '.vinext',
      '.next',
      'outputs',
      '.upstream-state.json',
      'next-env.d.ts',
    ]);
  function visit(dir, rel, prefix = 'room-editor/') {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      if (
        excluded.has(item.name) ||
        item.name.endsWith('.log') ||
        item.name.startsWith('.env') ||
        item.name.startsWith('.dev.vars') ||
        item.name.endsWith('.vault') ||
        item.name.endsWith('.tsbuildinfo')
      )
        continue;
      const file = path.join(dir, item.name),
        name = rel + item.name;
      if (item.isDirectory()) visit(file, name + '/', prefix);
      else if (item.isFile()) entries[prefix + name] = new Uint8Array(fs.readFileSync(file));
    }
  }
  visit(root, '');
  const cloud = path.resolve(root, '../room-cloud');
  if (fs.existsSync(path.join(cloud, '.openai/hosting.json'))) visit(cloud, '', 'room-cloud/');
  return zipSync(entries, { level: 6 });
}
async function main() {
  if (process.platform !== 'win32' || process.arch !== 'x64')
    throw new Error('此脚本生成 Windows x64 版本，请在 Windows x64 执行。');
  await require('./build.cjs').build();
  require('./catalog.cjs').generate();
  require('./examples.cjs').generate();
  const release = path.join(root, 'release');
  fs.mkdirSync(release, { recursive: true });
  let name = 'RoomLab-' + version + '-win-x64',
    n = 1;
  while (fs.existsSync(path.join(release, name)))
    name = 'RoomLab-' + version + '-win-x64-build' + ++n;
  const output = inside(release, path.join(release, name)),
    runtime = path.dirname(require('electron'));
  fs.cpSync(runtime, output, { recursive: true, dereference: true });
  fs.renameSync(path.join(output, 'electron.exe'), path.join(output, 'RoomLab.exe'));
  const app = path.join(output, 'resources/app');
  fs.mkdirSync(app, { recursive: true });
  for (const item of [
    'src',
    'build',
    'docs',
    'examples',
    'README.md',
    'ARCHITECTURE.md',
    'AGENTS.md',
  ])
    fs.cpSync(path.join(root, item), path.join(app, item), { recursive: true, dereference: true });
  fs.writeFileSync(
    path.join(app, 'package.json'),
    JSON.stringify(
      { name: 'ddl-room-editor', version, private: true, main: 'src/desktop/main.cjs' },
      null,
      2,
    ),
  );
  fs.cpSync(
    fs.realpathSync(path.join(root, 'node_modules/fflate')),
    path.join(app, 'node_modules/fflate'),
    { recursive: true, dereference: true },
  );
  fs.copyFileSync(path.join(root, 'README.md'), path.join(output, 'README.md'));
  fs.cpSync(path.join(root, 'examples'), path.join(output, 'examples'), { recursive: true });
  console.log('程序目录完成：' + output);
  const windowsZip = path.join(release, name + '.zip'),
    source = path.join(
      release,
      'RoomLab-' + version + '-source' + (n > 1 ? '-build' + n : '') + '.zip',
    );
  fs.writeFileSync(windowsZip, zipTree(output, name + '/'));
  console.log('Windows ZIP 完成');
  fs.writeFileSync(source, sourceZip());
  const hashes = {};
  for (const file of [windowsZip, source])
    hashes[path.basename(file)] = crypto
      .createHash('sha256')
      .update(fs.readFileSync(file))
      .digest('hex');
  const manifest = {
    version,
    createdAt: new Date().toISOString(),
    platform: 'win32-x64',
    directory: output,
    executable: path.join(output, 'RoomLab.exe'),
    windowsZip,
    sourceZip: source,
    hashes,
  };
  fs.writeFileSync(path.join(release, 'latest-release.json'), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(manifest, null, 2));
}
if (require.main === module)
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
module.exports = { sourceZip };
