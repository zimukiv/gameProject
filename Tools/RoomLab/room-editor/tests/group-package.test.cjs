'use strict';
// Group ZIP round trip: export a cross-course user group, pack/unpack it with the
// shared archive layer, then import it into a project whose IDs all collide.
const test = require('node:test'),
  assert = require('node:assert/strict'),
  M = require('../src/project/model.cjs'),
  A = require('../src/project/archive.cjs'),
  Org = require('../src/project/room-organization.cjs'),
  MapCompat = require('../src/project/map-compat.cjs'),
  AIPorts = require('../src/project/ai-ports.cjs'),
  GroupExport = require('../src/project/group-export.cjs'),
  GroupImport = require('../src/project/group-import.cjs'),
  Seeds = require('../src/assets/seeds.cjs');

function fixture() {
  const project = M.themedExample(),
    seeds = Seeds.seeds({ allThemes: true }),
    physics = project.courses[0],
    calculus = project.courses[1],
    insideA = physics.rooms[0],
    insideB = calculus.rooms[0],
    insideC = physics.rooms[1],
    outside = physics.rooms[2];
  project.assets = seeds.assets;
  for (const course of project.courses) course.artBindings = M.clone(seeds.allBindings);
  project.layout = {
    version: 1,
    courseOffsets: { [physics.id]: { x: 0, y: 0 }, [calculus.id]: { x: 1200, y: 80 } },
  };
  const out = M.object('ai-out', 'common.portalOut', 4, 4),
    entrance = M.object('ai-in', 'common.portalIn', 5, 5);
  insideA.objects.push(out);
  insideB.objects.push(entrance);
  insideA.aiExitBindings = [{ exitId: insideA.exits[0].id, aiExitId: out.id }];
  project.map = {
    version: 1,
    connections: [
      {
        id: 'wire-cross',
        from: { courseId: calculus.id, roomId: insideB.id, exitId: insideB.exits[0].id },
        to: { courseId: physics.id, roomId: insideC.id, entryId: insideC.entries[0].id },
        velocity: 'keep',
        meta: { label: '跨课程', weight: 7 },
      },
      {
        id: 'wire-same-course',
        from: { courseId: physics.id, roomId: insideA.id, exitId: insideA.exits[0].id },
        to: { courseId: physics.id, roomId: insideC.id, entryId: insideC.entries[0].id },
        velocity: 'reset',
        meta: { label: '同课程' },
      },
      {
        id: 'wire-boundary',
        from: { courseId: physics.id, roomId: outside.id, exitId: outside.exits[0].id },
        to: { courseId: physics.id, roomId: insideA.id, entryId: insideA.entries[0].id },
        velocity: 'keep',
        meta: { label: '分组外' },
      },
    ],
    aiConnections: [
      {
        id: 'ai-cross',
        from: { courseId: physics.id, roomId: insideA.id, aiExitId: out.id },
        to: { courseId: calculus.id, roomId: insideB.id, aiEntranceId: entrance.id },
        meta: { label: 'AI 跨课程' },
      },
      {
        id: 'ai-boundary',
        from: { courseId: physics.id, roomId: outside.id, aiExitId: 'missing-out' },
        to: { courseId: physics.id, roomId: insideA.id, aiEntranceId: entrance.id },
        meta: { label: 'AI 分组外' },
      },
    ],
  };
  // Keep only the valid boundary AI wire relevant to the group; the other one is
  // deliberately dropped by validation-safe export.
  project.map.aiConnections = project.map.aiConnections.slice(0, 1);
  const group = {
    id: 'group-cross',
    name: '跨课程分组',
    color: '#e7b867',
    roomIds: [insideB.id, insideC.id, insideA.id],
  };
  project.roomOrganization = { version: 1, favorites: [], groups: [group] };
  return {
    project,
    seeds,
    group,
    physics,
    calculus,
    insideA,
    insideB,
    insideC,
    outside,
  };
}

test('group ZIP round trip preserves group order/color, content, cross-course wires, AI wires and offsets', () => {
  const source = fixture(),
    before = JSON.stringify(source.project),
    pkg = GroupExport.standalone(source.project, source.group.id);
  assert.equal(JSON.stringify(source.project), before, 'export must not mutate the source');
  assert.equal(pkg.courses.flatMap((course) => course.rooms).length, 3);
  assert.equal(pkg.groupExport.group.roomIds.length, 3);
  assert.deepEqual(pkg.groupExport.group.roomIds, source.group.roomIds);
  assert.equal(pkg.groupExport.group.color, '#e7b867');
  assert.equal(pkg.map.connections.length, 2, 'only in-group player wires are exported');
  assert.equal(pkg.map.aiConnections.length, 1, 'only the in-group AI wire is exported');
  assert.ok(pkg.groupExport.boundaryConnections.length >= 1);
  assert.ok(
    pkg.groupExport.boundaryConnections.some((entry) => entry.wire.meta?.label === '分组外'),
  );
  assert.equal(pkg.groupExport.boundaryAI.length, 0);
  assert.ok(
    pkg.groupExport.boundaryConnections.every(
      (entry) => entry.boundary.fromInside !== entry.boundary.toInside,
    ),
  );
  const packed = A.pack(pkg, source.seeds.files),
    incoming = A.unpack(packed);
  assert.equal(incoming.project.groupExport.group.roomIds.length, 3);

  // Target intentionally keeps the same room/object IDs as the source package.
  const target = M.themedExample(),
    targetBefore = JSON.stringify(target),
    result = GroupImport.prepare(
      target,
      new Map(source.seeds.files),
      incoming.project,
      incoming.files,
      target.courses[0].id,
      true,
    );
  assert.equal(JSON.stringify(target), targetBefore, 'import must not mutate the target');
  assert.equal(result.rooms.length, 3);
  const imported = new Set(result.rooms.map((room) => room.id)),
    allRooms = result.project.courses.flatMap((course) => course.rooms),
    importedRooms = allRooms.filter((room) => imported.has(room.id));
  assert.equal(importedRooms.length, 3);
  // Colliding IDs are remapped: no imported room keeps a source room id.
  assert.equal(imported.has(source.insideA.id), false);
  assert.equal(imported.has(source.insideB.id), false);
  assert.equal(imported.has(source.insideC.id), false);

  const org = Org.ensure(result.project),
    group = org.groups.find((candidate) => candidate.name === source.group.name);
  assert.ok(group, 'the imported group is recreated');
  assert.equal(group.color, source.group.color);
  assert.deepEqual(group.roomIds, result.rooms.map((room) => room.id));

  // Room content survives remapping (objects, thermal zone refs and AI bindings).
  const sourceA = source.insideA,
    importedA = importedRooms.find((room) => room.name.startsWith(sourceA.name)),
    importedC = importedRooms.find((room) => room.name.startsWith(source.insideC.name));
  assert.ok(importedA && importedC);
  assert.equal(importedA.objects.length, sourceA.objects.length);
  assert.equal(importedA.zones.length, sourceA.zones.length);
  assert.deepEqual(
    importedA.objects.map((object) => object.type),
    sourceA.objects.map((object) => object.type),
  );
  const binding = AIPorts.bindings(importedA)[0];
  assert.ok(binding, 'AI exit binding is preserved');
  assert.ok(importedA.exits.some((exit) => exit.id === binding.exitId));
  assert.ok(importedA.objects.some((object) => object.id === binding.aiExitId));

  const playerWires = result.project.map.connections;
  assert.equal(playerWires.length, 2);
  const cross = playerWires.find((wire) => wire.meta?.label === '跨课程'),
    same = playerWires.find((wire) => wire.meta?.label === '同课程');
  assert.ok(cross && same, 'wire metadata is preserved');
  assert.equal(cross.velocity, 'keep');
  assert.equal(cross.meta.weight, 7);
  assert.equal(same.velocity, 'reset');
  for (const wire of playerWires) {
    assert.ok(imported.has(wire.from.roomId));
    assert.ok(imported.has(wire.to.roomId));
    const from = allRooms.find((room) => room.id === wire.from.roomId),
      to = allRooms.find((room) => room.id === wire.to.roomId);
    assert.ok(from.exits.some((exit) => exit.id === wire.from.exitId));
    assert.ok(to.entries.some((entry) => entry.id === wire.to.entryId));
  }
  const ai = result.project.map.aiConnections[0];
  assert.equal(ai.meta.label, 'AI 跨课程');
  assert.ok(imported.has(ai.from.roomId) && imported.has(ai.to.roomId));
  const aiFrom = allRooms.find((room) => room.id === ai.from.roomId),
    aiTo = allRooms.find((room) => room.id === ai.to.roomId);
  assert.equal(AIPorts.isExit(aiFrom.objects.find((object) => object.id === ai.from.aiExitId)), true);
  assert.equal(
    AIPorts.isEntrance(aiTo.objects.find((object) => object.id === ai.to.aiEntranceId)),
    true,
  );
  // Boundary wires are metadata only and never attach to an unrelated room.
  assert.ok(result.boundaryConnections >= 1);
  assert.equal(
    result.project.map.connections.some((wire) => wire.meta?.label === '分组外'),
    false,
  );
  assert.equal(
    result.project.map.connections.some((wire) => wire.from.roomId === source.outside.id),
    false,
  );

  // Relative world offsets across source courses survive the import.
  const sourceWorld = new Map(
      pkg.groupExport.rooms.map((room) => [room.roomId, { x: room.worldX, y: room.worldY }]),
    ),
    importedOrder = result.rooms.map((room) => allRooms.find((candidate) => candidate.id === room.id)),
    firstSource = sourceWorld.get(result.rooms[0].sourceRoomId);
  for (const [index, room] of importedOrder.entries()) {
    const sourcePoint = sourceWorld.get(result.rooms[index].sourceRoomId);
    assert.equal(room.graph.x - importedOrder[0].graph.x, sourcePoint.x - firstSource.x);
    assert.equal(room.graph.y - importedOrder[0].graph.y, sourcePoint.y - firstSource.y);
  }
  assert.equal(MapCompat.validate(result.project).errors.length, 0);
  assert.equal(AIPorts.validate(result.project).errors.length, 0);
  // The imported package still packs/unpacks with the shared asset archive.
  const reexport = GroupExport.standalone(result.project, group.id),
    repacked = A.unpack(A.pack(reexport, new Map(result.files)));
  assert.equal(repacked.project.groupExport.group.roomIds.length, 3);
  assert.equal(repacked.project.groupExport.group.color, source.group.color);
});
