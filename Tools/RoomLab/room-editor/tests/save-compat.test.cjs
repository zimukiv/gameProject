'use strict';
// Save compatibility for stage 2: JSON/ZIP reopen keeps per-course graph
// coordinates, multiple courses, additive project.layout and unknown extension
// fields; the legacy cloud snapshot codec roundtrips every field without
// rewriting the signed manifest or the revision parent. All writes go to
// temporary directories.
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path'),
  M = require('../src/project/model.cjs'),
  Files = require('../src/desktop/project-files.cjs'),
  Archive = require('../src/project/archive.cjs'),
  C = require('../src/cloud/codec.cjs'),
  { Repository } = require('../src/cloud/repository.cjs'),
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
  // Distinct authored coordinates per course; the global map must never flatten them.
  project.courses.forEach((course, index) =>
    course.rooms.forEach((room, roomIndex) => {
      room.graph = { x: 17 * (index + 1) + roomIndex, y: -9 * (index + 1) - roomIndex };
    }),
  );
  project.extensionField = { keep: true, nested: { list: [1, 'two', { three: 3 }] } };
  project.courses[1].extensionCourse = '第三方字段';
  project.courses[2].rooms[0].extensionRoom = { note: '保留' };
  return { project, files, seed };
}
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'room-lab-save-compat-'));

test('JSON save/reopen keeps every course, graph coordinate and the layout field', () => {
  const { project, files } = fixture(),
    root = temp(),
    file = path.join(root, '多 大关.json');
  Files.writeProject(file, project, files);
  const reopened = Files.readProject(file);
  assert.deepEqual(reopened.project, project);
  assert.equal(reopened.project.courses.length, 3);
  assert.deepEqual(
    reopened.project.courses.map((course) => course.rooms.map((room) => room.graph)),
    project.courses.map((course) => course.rooms.map((room) => room.graph)),
  );
  assert.deepEqual(reopened.project.layout, project.layout);
  assert.deepEqual(reopened.project.extensionField, project.extensionField);
  assert.equal(reopened.project.courses[1].extensionCourse, '第三方字段');
  assert.deepEqual(reopened.project.courses[2].rooms[0].extensionRoom, { note: '保留' });
  // Stable IDs survive a save/reopen cycle unchanged.
  assert.deepEqual(
    reopened.project.courses.map((course) => ({
      id: course.id,
      rooms: course.rooms.map((room) => room.id),
      entries: course.rooms.map((room) => room.entries.map((entry) => entry.id)),
    })),
    project.courses.map((course) => ({
      id: course.id,
      rooms: course.rooms.map((room) => room.id),
      entries: course.rooms.map((room) => room.entries.map((entry) => entry.id)),
    })),
  );
});

test('ZIP save/reopen keeps multiple courses, graph coordinates and layout', () => {
  const { project, files } = fixture(),
    root = temp(),
    file = path.join(root, 'project.zip');
  Files.writeProject(file, project, files);
  const reopened = Archive.unpack(new Uint8Array(fs.readFileSync(file)));
  assert.deepEqual(reopened.project, project);
  assert.deepEqual(
    reopened.project.courses.map((course) => course.rooms.map((room) => room.graph)),
    project.courses.map((course) => course.rooms.map((room) => room.graph)),
  );
  assert.deepEqual(reopened.project.layout.courseOffsets, project.layout.courseOffsets);
  assert.equal(reopened.files.size, project.assets.length);
});

test('the cloud snapshot codec roundtrips every field without touching the manifest', () => {
  const { project, files } = fixture(),
    snapshot = C.encode(project, files),
    decoded = C.decode(snapshot.bytes);
  assert.deepEqual(decoded.project, project);
  assert.deepEqual(decoded.project.layout, project.layout);
  assert.deepEqual(decoded.project.extensionField, project.extensionField);
  assert.deepEqual(
    decoded.project.courses.map((course) => course.rooms.map((room) => room.graph)),
    project.courses.map((course) => course.rooms.map((room) => room.graph)),
  );
  // Re-encoding the decoded project reproduces the same signed manifest.
  const again = C.encode(
    decoded.project,
    decoded.files.map(([assetPath, bytes]) => ({ path: assetPath, bytes })),
  );
  assert.equal(again.fingerprint, snapshot.fingerprint);
  assert.deepEqual(again.files, snapshot.files);
  // Losing/keeping the additive layout field must not change stable IDs or parents.
  const revision = C.revision(snapshot, 'test-device', '本地快照', 'a'.repeat(64));
  assert.equal(revision.parent, 'a'.repeat(64));
  assert.equal(revision.fingerprint, snapshot.fingerprint);
  assert.deepEqual(revision.files, snapshot.files);
  assert.match(revision.id, /^[a-f0-9]{64}$/);
});

test('a worktree local draft keeps layout/graph and adds no cloud revision or tree', () => {
  const { project, files } = fixture(),
    repo = new Repository(temp());
  const tree = repo.draft(
    project,
    files.map((file) => [file.path, file.bytes]),
  );
  const before = repo.status();
  assert.equal(before.history.length, 0, 'a local draft is not a cloud version');
  assert.equal(before.trees.length, 1);
  // A one-minute local snapshot of the same project must not create new trees.
  repo.draft(
    project,
    files.map((file) => [file.path, file.bytes]),
  );
  assert.equal(repo.status().trees.length, 1);
  const working = repo.working(tree);
  assert.deepEqual(working.project, project);
  assert.deepEqual(working.project.layout, project.layout);
  assert.deepEqual(working.project.courses[2].rooms[0].graph, project.courses[2].rooms[0].graph);
  // Keep the current revision parent untouched while the project is only local.
  assert.equal(tree.head, null);
  assert.equal(tree.readRevision, null);
  assert.deepEqual(repo.status().history, []);
});
