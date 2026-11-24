'use strict';
// Desktop autosave writer: overwrite the opened/associated project file only
// when identity + previously-read hash still match, otherwise keep a complete
// recovery snapshot under the local profile and leave the good file untouched.
// All paths are temporary test directories.
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path'),
  M = require('../src/project/model.cjs'),
  Archive = require('../src/project/archive.cjs'),
  Files = require('../src/desktop/project-files.cjs'),
  AutoSave = require('../src/desktop/project-autosave.cjs'),
  { seeds } = require('../src/assets/seeds.cjs');

function fixture() {
  const seed = seeds({ allThemes: true }),
    project = M.migrate(M.themedExample()),
    files = [...seed.files].map(([assetPath, bytes]) => ({ path: assetPath, bytes }));
  project.assets = seed.assets.map((asset) => ({ ...asset }));
  for (const course of project.courses)
    course.artBindings = { ...(seed.allBindings || seed.bindings) };
  project.layout = { version: 1, courseOffsets: {} };
  for (const [index, course] of project.courses.entries())
    project.layout.courseOffsets[course.id] = { x: index * 1200, y: index * 40 };
  return { project, files, seed };
}
function temp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'room-lab-autosave-'));
}

test('autosave rewrites the opened JSON project when identity and hash match', () => {
  const { project, files } = fixture(),
    root = temp(),
    file = path.join(root, 'project.json'),
    recoveryRoot = path.join(root, 'recovery');
  Files.writeProject(file, project, files);
  const expectedHash = AutoSave.hashFile(file),
    before = fs.readFileSync(file);
  // Graph/layout edits, a new extension field and a second course edit.
  project.courses[0].rooms[0].graph = { x: 321, y: -54 };
  project.courses[1].rooms[0].graph = { x: -7, y: 88 };
  project.courses[2].rooms[1].graph = { x: 9001, y: 31 };
  project.layout.courseOffsets[project.courses[1].id] = { x: 2400, y: 80 };
  project.extensionField = { keep: [1, 2, { deep: 'value' }] };
  project.courses[0].rooms[0].extensionRoom = '保留未知字段';
  const result = AutoSave.autosave({
    project,
    files,
    candidate: { file, projectId: project.id, expectedHash },
    recoveryRoot,
  });
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'file');
  assert.equal(result.file, file);
  assert.notDeepEqual(fs.readFileSync(file), before);
  const reopened = Files.readProject(file).project;
  assert.deepEqual(reopened, project);
  assert.equal(reopened.courses.length, 3);
  assert.deepEqual(reopened.courses[0].rooms[0].graph, { x: 321, y: -54 });
  assert.deepEqual(reopened.courses[2].rooms[1].graph, { x: 9001, y: 31 });
  assert.deepEqual(reopened.layout, project.layout);
  assert.deepEqual(reopened.extensionField, { keep: [1, 2, { deep: 'value' }] });
  assert.deepEqual(
    reopened.courses.map((course) => course.id),
    project.courses.map((course) => course.id),
  );
  assert.equal(reopened.assets.length, project.assets.length);
  // Same atomic/backup writer as a manual save.
  assert.ok(fs.readdirSync(path.join(root, '.project-backups')).length >= 1);
});

test('autosave rewrites an opened ZIP project without losing assets or coordinates', () => {
  const { project, files } = fixture(),
    root = temp(),
    file = path.join(root, 'project.zip');
  Files.writeProject(file, project, files);
  const expectedHash = AutoSave.hashFile(file);
  project.courses[1].rooms[2].graph = { x: 42, y: 43 };
  project.layout = { version: 1, courseOffsets: { [project.courses[2].id]: { x: 5, y: 6 } } };
  const result = AutoSave.autosave({
    project,
    files,
    candidate: { file, projectId: project.id, expectedHash },
    recoveryRoot: path.join(root, 'recovery'),
  });
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'file');
  const reopened = Archive.unpack(new Uint8Array(fs.readFileSync(file)));
  assert.deepEqual(reopened.project, project);
  assert.deepEqual(reopened.project.courses[1].rooms[2].graph, { x: 42, y: 43 });
  assert.equal(reopened.files.size, project.assets.length);
});

test('a layout-only edit is picked up by an autosave', () => {
  const { project, files } = fixture(),
    root = temp(),
    file = path.join(root, 'project.json');
  Files.writeProject(file, project, files);
  const expectedHash = AutoSave.hashFile(file);
  project.layout.courseOffsets[project.courses[0].id] = { x: -50, y: 12 };
  const result = AutoSave.autosave({
    project,
    files,
    candidate: { file, projectId: project.id, expectedHash },
    recoveryRoot: path.join(root, 'recovery'),
  });
  assert.equal(result.mode, 'file');
  const reopened = Files.readProject(file).project;
  assert.deepEqual(reopened.layout.courseOffsets[project.courses[0].id], { x: -50, y: 12 });
  // Authored coordinates are never rewritten by a layout-only save.
  assert.deepEqual(reopened.courses[0].rooms[0].graph, project.courses[0].rooms[0].graph);
});

test('an externally changed file is never overwritten and a recovery snapshot is kept', () => {
  const { project, files } = fixture(),
    root = temp(),
    file = path.join(root, 'project.json'),
    recoveryRoot = path.join(root, 'recovery');
  Files.writeProject(file, project, files);
  const expectedHash = AutoSave.hashFile(file);
  const external = JSON.stringify({ ...Files.readProject(file).project, notes: '其他程序写入' });
  fs.writeFileSync(file, external, 'utf8');
  project.notes = '编辑器内未保存的修改';
  const result = AutoSave.autosave({
    project,
    files,
    candidate: { file, projectId: project.id, expectedHash },
    recoveryRoot,
  });
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'recovery');
  assert.equal(result.conflict, true);
  assert.match(result.warning, /其他程序修改/);
  assert.equal(fs.readFileSync(file, 'utf8'), external, 'the external file is untouched');
  assert.equal(result.session, undefined, 'a recovery path is not a save session');
  const recovered = Files.readProject(result.file).project;
  assert.deepEqual(recovered, project);
  assert.equal(result.file, path.join(recoveryRoot, project.id, 'project.json'));
  assert.equal(Files.readProject(result.file).files.length, project.assets.length);
});

test('without a chosen file the complete project goes to the local recovery folder', () => {
  const { project, files } = fixture(),
    root = temp(),
    recoveryRoot = path.join(root, 'profile', 'RoomLabRecovery');
  project.courses[2].rooms[0].graph = { x: 17, y: -3 };
  const result = AutoSave.autosave({ project, files, candidate: null, recoveryRoot });
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'recovery');
  assert.ok(result.file.startsWith(recoveryRoot), 'stored under the local profile');
  assert.equal(result.file.toLowerCase().startsWith(root.toLowerCase()), true);
  const recovered = Files.readProject(result.file);
  assert.deepEqual(recovered.project, project);
  assert.deepEqual(recovered.project.courses[2].rooms[0].graph, { x: 17, y: -3 });
  assert.equal(recovered.files.length, project.assets.length);
  assert.equal(result.session, undefined);
});

test('target selection only uses the matching session or the current association', () => {
  const project = { id: 'project-a' },
    session = new Map([
      ['s1', { file: 'C:/a/one.json', projectId: 'project-a', hash: 'h1' }],
      ['s2', { file: 'C:/b/two.json', projectId: 'project-b', hash: 'h2' }],
    ]);
  assert.deepEqual(
    AutoSave.candidateFor({ payload: { session: 's1' }, project, sessions: session }),
    { file: 'C:/a/one.json', projectId: 'project-a', expectedHash: 'h1' },
  );
  // A stale session for another project falls through to the worktree association.
  assert.deepEqual(
    AutoSave.candidateFor({
      payload: { session: 's2' },
      project,
      sessions: session,
      current: {
        projectId: 'project-a',
        localFile: { path: 'C:/c/three.json', hash: 'h3' },
      },
    }),
    { file: 'C:/c/three.json', projectId: 'project-a', expectedHash: 'h3' },
  );
  // A different project's association is never targeted.
  assert.equal(
    AutoSave.candidateFor({
      payload: {},
      project,
      current: { projectId: 'project-b', localFile: { path: 'C:/b/two.json', hash: 'h2' } },
    }),
    null,
  );
  // 另存为 must choose a path, so autosave has no file target.
  assert.equal(
    AutoSave.candidateFor({
      payload: { saveAs: true },
      project,
      current: { projectId: 'project-a', localFile: { path: 'C:/c/three.json', hash: 'h3' } },
    }),
    null,
  );
  // Test-mode forced paths still need a hash before they can overwrite anything.
  assert.deepEqual(AutoSave.candidateFor({ payload: {}, project, forced: 'C:/d/four.json' }), {
    file: 'C:/d/four.json',
    projectId: 'project-a',
    expectedHash: null,
  });
});

test('recovery snapshots keep a bounded backup ring instead of growing forever', () => {
  const { project, files } = fixture(),
    root = temp(),
    recoveryRoot = path.join(root, 'RoomLabRecovery');
  let last;
  for (let index = 0; index < 7; index++) {
    project.notes = '第 ' + index + ' 分钟';
    last = AutoSave.autosave({ project, files, candidate: null, recoveryRoot });
    assert.equal(last.ok, true);
  }
  const backups = fs.readdirSync(path.join(path.dirname(last.file), '.project-backups'));
  assert.ok(backups.length > 0, 'the writer keeps a backup');
  assert.ok(backups.length <= 5, 'the recovery ring is bounded');
  assert.equal(Files.readProject(last.file).project.notes, '第 6 分钟');
});

test('conflicting artwork blocks the file write and keeps a recovery snapshot', () => {
  const { project, files, seed } = fixture(),
    root = temp(),
    file = path.join(root, 'project.json'),
    first = seed.assets[0];
  Files.writeProject(file, project, files);
  const expectedHash = AutoSave.hashFile(file),
    before = fs.readFileSync(file),
    artwork = path.join(root, first.path);
  fs.writeFileSync(artwork, Buffer.from('different artwork bytes'));
  const result = AutoSave.autosave({
    project,
    files,
    candidate: { file, projectId: project.id, expectedHash },
    recoveryRoot: path.join(root, 'recovery'),
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /已有素材内容不同/);
  assert.deepEqual(fs.readFileSync(file), before, 'the project file is not rewritten');
  assert.equal(fs.readFileSync(artwork, 'utf8'), 'different artwork bytes', 'artwork is untouched');
  assert.ok(result.file && fs.existsSync(result.file), 'a recovery snapshot was kept');
  assert.deepEqual(Files.readProject(result.file).project, project);
});

test('a missing custom asset reports an error and never writes a broken project file', () => {
  const { project, files } = fixture(),
    root = temp(),
    file = path.join(root, 'project.json');
  Files.writeProject(file, project, files);
  const expectedHash = AutoSave.hashFile(file),
    before = fs.readFileSync(file);
  project.assets.push({
    id: 'asset-missing',
    name: '缺失素材',
    path: 'assets/definitely-missing.png',
    mime: 'image/png',
    width: 8,
    height: 8,
    frameWidth: 0,
    frameHeight: 0,
    fps: 6,
    courseId: project.courses[0].id,
    category: 'unsorted',
    subcategory: 'unsorted',
    hash: 'missing',
  });
  const result = AutoSave.autosave({
    project,
    files,
    candidate: { file, projectId: project.id, expectedHash },
    recoveryRoot: path.join(root, 'recovery'),
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /缺少素材/);
  assert.deepEqual(fs.readFileSync(file), before, 'the good file keeps its original bytes');
});

test('a file belonging to another project is diverted to recovery', () => {
  const { project, files } = fixture(),
    root = temp(),
    file = path.join(root, 'project.json'),
    recoveryRoot = path.join(root, 'recovery');
  Files.writeProject(file, project, files);
  const expectedHash = AutoSave.hashFile(file),
    before = fs.readFileSync(file);
  project.notes = '换了项目身份';
  const result = AutoSave.autosave({
    project,
    files,
    candidate: { file, projectId: 'different-project', expectedHash },
    recoveryRoot,
  });
  assert.equal(result.mode, 'recovery');
  assert.equal(result.conflict, true);
  assert.match(result.warning, /其他项目/);
  assert.deepEqual(fs.readFileSync(file), before);
});

test('a deleted project file is not recreated silently', () => {
  const { project, files } = fixture(),
    root = temp(),
    file = path.join(root, 'project.json');
  Files.writeProject(file, project, files);
  const expectedHash = AutoSave.hashFile(file);
  fs.unlinkSync(file);
  const result = AutoSave.autosave({
    project,
    files,
    candidate: { file, projectId: project.id, expectedHash },
    recoveryRoot: path.join(root, 'recovery'),
  });
  assert.equal(result.mode, 'recovery');
  assert.equal(result.conflict, true);
  assert.equal(fs.existsSync(file), false);
  assert.ok(fs.existsSync(result.file));
});

test('native autosave makes zero network writes', () => {
  const { project, files } = fixture(),
    root = temp(),
    file = path.join(root, 'project.json');
  Files.writeProject(file, project, files);
  let calls = 0,
    original = globalThis.fetch;
  globalThis.fetch = () => {
    calls++;
    throw new Error('autosave must not use the network');
  };
  try {
    const result = AutoSave.autosave({
      project,
      files,
      candidate: { file, projectId: project.id, expectedHash: AutoSave.hashFile(file) },
      recoveryRoot: path.join(root, 'recovery'),
    });
    assert.equal(result.mode, 'file');
  } finally {
    globalThis.fetch = original;
  }
  assert.equal(calls, 0);
  const source = fs.readFileSync(
    path.join(__dirname, '../src/desktop/project-autosave.cjs'),
    'utf8',
  );
  assert.ok(!/require\(['"][^'"]*cloud/.test(source), 'the writer never loads cloud modules');
});
