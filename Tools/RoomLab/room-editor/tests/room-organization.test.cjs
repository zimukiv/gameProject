'use strict';
// Pure organisation tests (stage 3): favourites and user-named groups are an
// additive project field, independent of course ownership, undo-friendly and
// safe around stale/deleted room IDs. Also covers JSON/ZIP/cloud-codec
// roundtrips and single-room export containment.
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const M = require('../src/project/model.cjs'),
  Org = require('../src/project/room-organization.cjs'),
  Export = require('../src/project/room-export.cjs'),
  Archive = require('../src/project/archive.cjs'),
  Files = require('../src/desktop/project-files.cjs'),
  C = require('../src/cloud/codec.cjs'),
  { seeds } = require('../src/assets/seeds.cjs');

function fixture() {
  const seed = seeds({ allThemes: true }),
    project = M.migrate(M.themedExample());
  project.assets = seed.assets.map((asset) => ({ ...asset }));
  for (const course of project.courses)
    course.artBindings = { ...(seed.allBindings || seed.bindings) };
  project.layout = { version: 1, courseOffsets: {} };
  project.courses.forEach((course, index) => {
    project.layout.courseOffsets[course.id] = { x: index * 1200, y: index * 40 };
    course.rooms.forEach((room, roomIndex) => {
      room.graph = { x: 11 * (index + 1) + roomIndex, y: 7 * (index + 1) - roomIndex };
    });
  });
  project.extensionField = { keep: true };
  return { project, seed };
}
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'room-lab-org-'));
const roomId = (project, courseIndex, roomIndex) =>
  project.courses[courseIndex].rooms[roomIndex].id;

test('favourite toggle is pure, idempotent and undo/redo friendly', () => {
  const id = 'room-a',
    empty = Org.empty();
  assert.deepEqual(empty, { version: 1, favorites: [], groups: [] });
  const starred = Org.toggleFavorite(empty, id);
  assert.deepEqual(starred.favorites, [id]);
  assert.deepEqual(empty.favorites, [], 'the input value is never mutated');
  assert.equal(Org.isFavorite(starred, id), true);
  const unstarred = Org.toggleFavorite(starred, id);
  assert.equal(Org.isFavorite(unstarred, id), false);
  // Re-applying the same value is stable (undo snapshots stay comparable).
  assert.deepEqual(Org.setFavorite(starred, id, true), starred);
  assert.deepEqual(Org.setFavorite(starred, id, false), unstarred);
  assert.deepEqual(Org.toggleFavorite(Org.empty(), ''), Org.empty());
});

test('groups are cross-course, allow multiple groups and keep project order', () => {
  const { project } = fixture(),
    first = roomId(project, 0, 0),
    second = roomId(project, 1, 0),
    third = roomId(project, 2, 1);
  let org = Org.createGroup(Org.empty(), '关卡节奏', [first, second]);
  org = Org.createGroup(org, '待调整', [second, third]);
  project.roomOrganization = org;
  const group = org.groups[0];
  assert.equal(group.id, 'group-1');
  assert.deepEqual(group.roomIds, [first, second]);
  assert.deepEqual(Org.groupOf(org, 'group-2').roomIds, [second, third]);
  assert.equal(Org.groupsContaining(org, second).length, 2, 'a room may belong to 2 groups');
  assert.deepEqual(Org.filterRoomIds(project, 'all'), Org.roomIdList(project));
  assert.deepEqual(Org.filterRoomIds(project, 'group:group-1'), [first, second]);
  // Filtering never reorders the authored room arrays.
  const order = project.courses.map((course) => course.rooms.map((room) => room.id));
  Org.filterRoomIds(project, 'group:group-2');
  assert.deepEqual(
    project.courses.map((course) => course.rooms.map((room) => room.id)),
    order,
  );
  // The favourites filter keeps project order even if favourites were added late.
  const favourites = Org.toggleFavorite(Org.toggleFavorite(Org.empty(), third), first);
  project.roomOrganization = favourites;
  assert.deepEqual(Org.filterRoomIds(project, 'favorites'), [first, third]);
});

test('rename keeps room IDs; delete keeps rooms; unassign keeps both', () => {
  const { project } = fixture(),
    first = roomId(project, 0, 0),
    second = roomId(project, 1, 0),
    idsBefore = project.courses.flatMap((course) => course.rooms.map((room) => room.id));
  let org = Org.createGroup(Org.empty(), '旧名字', [first, second]);
  org = Org.renameGroup(org, 'group-1', '新名字');
  assert.equal(org.groups[0].name, '新名字');
  assert.deepEqual(org.groups[0].roomIds, [first, second], 'rename never touches room IDs');
  const assigned = Org.assign(org, 'group-1', [roomId(project, 2, 0)]);
  assert.equal(assigned.groups[0].roomIds.length, 3);
  const unassigned = Org.unassign(assigned, 'group-1', [first]);
  assert.equal(Org.groupOf(unassigned, 'group-1').roomIds.includes(first), false);
  const deleted = Org.deleteGroup(unassigned, 'group-1');
  assert.deepEqual(deleted.groups, []);
  assert.deepEqual(
    project.courses.flatMap((course) => course.rooms.map((room) => room.id)),
    idsBefore,
    'deleting a group never deletes rooms',
  );
  assert.equal(Org.renameGroup(org, 'missing', 'x').groups[0].name, '新名字');
  assert.deepEqual(Org.deleteGroup(org, 'group-1').groups, []);
  assert.equal(Org.createGroup(org, '   ').groups.length, 1, 'empty group names are refused');
});

test('stale or deleted room IDs are ignored and cleaned safely', () => {
  const { project } = fixture(),
    first = roomId(project, 0, 0),
    stale = 'room-that-no-longer-exists';
  const dirty = {
    version: 1,
    favorites: [stale, first, first, 42],
    groups: [
      { id: 'group-1', name: '保留', roomIds: [first, stale, first] },
      { id: 'group-1', name: '重复 ID', roomIds: [first] },
      { id: 'group-2', name: '', roomIds: [first] },
      null,
      { name: '没有 ID', roomIds: [first] },
    ],
  };
  project.roomOrganization = dirty;
  const org = Org.ensure(project);
  assert.deepEqual(org.favorites, [first]);
  assert.equal(org.groups.length, 1);
  assert.deepEqual(org.groups[0].roomIds, [first]);
  // A deleted room is forgotten everywhere; the group and other rooms stay.
  const forgotten = Org.forgetRoom(org, first);
  assert.deepEqual(forgotten.favorites, []);
  assert.deepEqual(forgotten.groups[0].roomIds, []);
  assert.equal(forgotten.groups[0].name, '保留');
  // Loading a project drops stale IDs without raising.
  const loaded = M.migrate(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(loaded.roomOrganization.favorites, [first]);
  assert.equal(loaded.extensionField.keep, true, 'unknown root fields stay preserved');
});

test('an absent organisation field is never fabricated by reading', () => {
  const { project } = fixture();
  assert.equal(project.roomOrganization, undefined);
  Org.ensure(project);
  assert.equal(project.roomOrganization, undefined, 'rendering must not dirty the project');
  const migrated = M.migrate(JSON.parse(JSON.stringify(project)));
  assert.equal(migrated.roomOrganization, undefined);
});

test('JSON, ZIP, local recovery and cloud codec roundtrips retain organisation', () => {
  const { project, seed } = fixture(),
    first = roomId(project, 0, 0),
    second = roomId(project, 1, 0);
  project.roomOrganization = Org.createGroup(Org.toggleFavorite(Org.empty(), second), '跨大关', [
    first,
    second,
  ]);
  const files = [...seed.files].map(([assetPath, bytes]) => ({ path: assetPath, bytes }));
  // JSON project file (same writer as manual save / autosave).
  const root = temp(),
    json = path.join(root, '组织.json');
  Files.writeProject(json, project, files);
  const reopened = Files.readProject(json);
  assert.deepEqual(reopened.project.roomOrganization, project.roomOrganization);
  assert.deepEqual(reopened.project.layout, project.layout);
  // ZIP archive used by 导出项目包 / cloud snapshot.
  const packed = Archive.unpack(
    (() => {
      const map = new Map(files.map((file) => [file.path, file.bytes]));
      return Archive.pack(project, map);
    })(),
  );
  assert.deepEqual(packed.project.roomOrganization, project.roomOrganization);
  // Cloud codec (encode -> decode) keeps favourites/groups and global layout.
  const encoded = C.encode(project, new Map(files.map((file) => [file.path, file.bytes])));
  const decoded = C.decode(encoded.bytes);
  assert.deepEqual(decoded.project.roomOrganization, project.roomOrganization);
  assert.deepEqual(decoded.project.layout, project.layout);
  assert.equal(
    JSON.stringify(C.canonical(decoded.project.roomOrganization)),
    JSON.stringify(C.canonical(project.roomOrganization)),
  );
});

test('single-room export never leaks project-wide group references', () => {
  const { project } = fixture(),
    course = project.courses[1],
    room = course.rooms[0];
  project.roomOrganization = Org.createGroup(Org.toggleFavorite(Org.empty(), room.id), '组', [
    room.id,
    roomId(project, 0, 0),
  ]);
  const pkg = Export.standalone(project, course.id, room.id);
  assert.equal(pkg.roomOrganization, undefined);
  assert.equal(pkg.layout, undefined);
  assert.equal(pkg.courses.length, 1);
  assert.deepEqual(
    pkg.courses[0].rooms.map((item) => item.id),
    [room.id],
  );
  assert.equal(M.validate(pkg).errors.length, 0);
});
