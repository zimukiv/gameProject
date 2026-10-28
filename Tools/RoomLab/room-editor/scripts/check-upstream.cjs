'use strict';
// Fetches only a bare cache. Never checks out, merges or overwrites authoring files.
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'),
  workspace = path.dirname(root);
const repository = 'https://github.com/zimukiv/gameProject.git';
const cache = path.join(root, 'test-output', 'upstream.git');
const baselineFile = path.join(root, '.upstream-state.json');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
function git(args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    timeout: 60000,
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
function run() {
  fs.mkdirSync(path.dirname(cache), { recursive: true });
  if (!fs.existsSync(cache)) git(['init', '--bare', cache]);
  git(['--git-dir', cache, 'fetch', '--quiet', '--no-tags', '--depth=1', repository, 'main']);
  const commit = git(['--git-dir', cache, 'rev-parse', 'FETCH_HEAD']).trim();
  const text = git(['--git-dir', cache, 'show', 'FETCH_HEAD:Tools/RoomLab/SOURCE_MANIFEST.json']);
  const remote = JSON.parse(text),
    digest = hash(Buffer.from(text));
  if (remote.repository !== 'zimukiv/gameProject' || !Array.isArray(remote.files))
    throw Error('远端 Room Lab 源码清单无效');
  const differences = [];
  for (const item of remote.files) {
    if (
      !/^(room-editor|room-cloud)\//.test(item.path) ||
      item.path.split('/').includes('..') ||
      item.path.includes('\\')
    )
      throw Error('远端源码路径无效');
    const file = path.resolve(workspace, item.path);
    if (!fs.existsSync(file)) {
      differences.push(item.path);
      continue;
    }
    let bytes = fs.readFileSync(file);
    if (item.encoding === 'utf8-lf')
      bytes = Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
    if (hash(bytes) !== item.sha256) differences.push(item.path);
  }
  let baseline = null;
  if (fs.existsSync(baselineFile)) baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
  const sameBaseline = baseline?.sourceManifestSHA256 === digest;
  const latest = differences.length === 0 || sameBaseline;
  const report = {
    repository: remote.repository,
    branch: 'main',
    commit,
    version: remote.version,
    releaseTag: remote.releaseTag,
    latestSourceVerified: latest,
    remoteSourceChanged: !!baseline && !sameBaseline,
    localDifferences: differences,
  };
  if (process.argv.includes('--record')) {
    if (differences.length)
      throw Error('本地与云端源码不一致，不能记录同步基线；请先人工合并并核对。');
    fs.writeFileSync(
      baselineFile,
      JSON.stringify(
        {
          repository: remote.repository,
          commit,
          sourceManifestSHA256: digest,
          verifiedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
    report.baselineRecorded = true;
  }
  console.log(JSON.stringify(report, null, 2));
  if (!latest) {
    console.error('远端源码变化或缺少基线，请先比较/同步，再开始修改。');
    process.exitCode = 2;
  }
}
try {
  run();
} catch (e) {
  console.error('云端版本尚未核验：' + e.message.split('\n')[0]);
  process.exitCode = 1;
}
