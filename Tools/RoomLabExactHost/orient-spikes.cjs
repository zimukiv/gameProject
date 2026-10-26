// Resolve existing level hazards once, persist explicit directions, and retain the reasoning for review.
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '../..');
const option = (name, fallback) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : path.resolve(process.argv[i + 1]); };
const file = option('--project', path.join(root, 'Tools/RoomLabRuntimeApp/project.json'));
const reportFile = option('--report', path.join(root, 'Validation/LatestRoomLabEvidence/spike-directions.json'));
const previousFile = option('--preserve-from', null);
const previous = previousFile ? JSON.parse(fs.readFileSync(previousFile, 'utf8')) : null;
const previousSpikes = new Map(previous?.courses.flatMap(c => c.rooms.flatMap(r => r.objects
  .filter(o => o.type === 'common.spike').map(o => [r.id + '/' + o.id, o]))) || []);
const project = JSON.parse(fs.readFileSync(file, 'utf8'));
const directions = { up: [0, -1], down: [0, 1], right: [1, 0], left: [-1, 0] };
const report = [];
for (const course of project.courses) for (const room of course.rooms) {
  const spikes = room.objects.filter(o => o.type === 'common.spike');
  if (!spikes.length) continue;
  const walls = new Set(room.tiles.filter(t => t.collision !== false).map(t => `${t.x},${t.y}`));
  // Include solid mechanism surfaces, excluding pickups and hazards.
  for (const o of room.objects) if (o.collision === true && !o.type.startsWith('common.'))
    for (let x = o.x; x < o.x + (o.w || 1); x++) for (let y = o.y; y < o.y + (o.h || 1); y++) walls.add(`${x},${y}`);
  const wall = (x, y) => walls.has(`${x},${y}`);
  const items = spikes.map(o => ({ o, embedded: wall(o.x, o.y), candidates: Object.entries(directions)
    .filter(([d, [dx, dy]]) => wall(o.x - dx, o.y - dy)).map(([d]) => d) }));
  for (const a of items) {
    const prior = previousSpikes.get(room.id + '/' + a.o.id), d = prior?.params?.direction;
    if (prior && prior.x === a.o.x && prior.y === a.o.y && directions[d] &&
        (a.embedded || !a.candidates.length || a.candidates.includes(d))) {
      a.direction = d; a.reason = 'preserved existing direction on compatible support'; a.preserved = true;
    }
  }
  for (const a of items) if (!a.direction && !a.embedded && a.candidates.length === 1) {
    a.direction = a.candidates[0]; a.reason = 'single supporting wall';
  }
  const seeds = items.filter(a => a.direction);
  for (const a of items) if (!a.direction && !a.embedded && a.candidates.length) {
    const scores = a.candidates.map(d => {
      const [dx, dy] = directions[d], tx = -dy, ty = dx;
      let score = wall(a.o.x + dx, a.o.y + dy) ? 0 : 3;
      for (let n = -4; n <= 4; n++) if (n) {
        if (wall(a.o.x - dx + tx * n, a.o.y - dy + ty * n)) score += 1 / Math.abs(n);
        if (seeds.some(b => b.direction === d && b.o.x === a.o.x + tx * n && b.o.y === a.o.y + ty * n)) score += 8 / Math.abs(n);
      }
      return { d, score };
    }).sort((a, b) => b.score - a.score);
    a.direction = scores[0].d; a.reason = 'corner: supporting wall and adjacent surface run'; a.scores = scores;
  }
  const anchors = items.filter(a => a.direction);
  for (const a of items) if (!a.direction) {
    const nearby = anchors.map(b => ({ b, distance: Math.hypot(b.o.x - a.o.x, b.o.y - a.o.y) }))
      .sort((a, b) => a.distance - b.distance);
    const nearest = nearby[0]?.distance || 1;
    const scores = new Map();
    for (const { b, distance } of nearby.filter(b => b.distance <= nearest + 1.5)) {
      const [dx, dy] = directions[b.direction];
      const tangent = dx ? b.o.x === a.o.x : b.o.y === a.o.y;
      scores.set(b.direction, (scores.get(b.direction) || 0) + (tangent ? 2 : 1) / (distance * distance));
    }
    a.direction = [...scores].sort((a, b) => b[1] - a[1])[0]?.[0] || 'up';
    // A floating run inherits its neighbours; don't move level objects to invent support.
    a.reason = a.embedded ? 'existing terrain overlap: inherit adjacent surface run' : 'floating: inherit nearby hazard group';
    a.neighbours = nearby.filter(b => b.distance <= nearest + 1.5).map(b => b.b.o.id);
  }
  for (const a of items) {
    // Reviewed corner/run exceptions from the complete room maps. Never rotate a supported
    // hazard away from a possible backing wall; embedded/floating hazards follow their run.
    let reviewed;
    if (room.name === 'AI追逐1' && a.o.y === 1) {
      if (a.o.x === 23) reviewed = 'left';
      if (a.o.x === 25) reviewed = 'right';
    }
    if (room.name === 'XX') {
      if ((a.o.y === 8 && a.o.x <= 4) || (a.o.y === 9 && a.o.x >= 5 && a.o.x <= 8)) reviewed = 'down';
      if (a.o.x >= 8 && a.o.x <= 27 && a.o.y >= 28 && a.o.y <= 30) reviewed = 'up';
    }
    if (!a.preserved && reviewed && (a.embedded || !a.candidates.length || a.candidates.includes(reviewed))) {
      a.direction = reviewed; a.reason += '; reviewed for consistent ceiling/stepped-floor/vertical-wall run';
    }
    a.o.params = { ...a.o.params, direction: a.direction };
    report.push({ room: room.name, roomId: room.id, id: a.o.id, x: a.o.x, y: a.o.y, direction: a.direction,
      supportingDirections: a.candidates, reason: a.reason, embedded: a.embedded, preserved: !!a.preserved, neighbours: a.neighbours });
  }
  const counts = {};
  for (const a of items) counts[a.direction] = (counts[a.direction] || 0) + 1;
  console.log(JSON.stringify({ room: room.name, count: spikes.length, directions: counts,
    floating: items.filter(a => !a.embedded && !a.candidates.length).length, existingTerrainOverlap: items.filter(a => a.embedded).length }));
  if (!process.argv.includes('--quiet')) console.log(Array.from({ length: room.rows }, (_, y) => String(y).padStart(2) + ' ' + Array.from({ length: room.cols }, (_, x) => {
    const a = items.find(a => a.o.x === x && a.o.y === y);
    return a ? ({ up: '^', down: 'v', left: '<', right: '>' }[a.direction]) : wall(x, y) ? '#' : '.';
  }).join('')).join('\n'));
}
fs.writeFileSync(file, JSON.stringify(project, null, 2) + '\n');
fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
