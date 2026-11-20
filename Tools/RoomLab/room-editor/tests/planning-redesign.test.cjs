'use strict';
// Room-first planning contract (stage 3): the main screen has no course chips,
// legend or "进入大关" step; it shows one horizontal strip of real room
// thumbnails, 全部 / 收藏 / group filters, and keeps legacy course management
// reachable only from the collapsed advanced panel / Tools menu.
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const M = require('../src/project/model.cjs'),
  Org = require('../src/project/room-organization.cjs'),
  Nav = require('../src/editor/planning-nav.cjs'),
  Library = require('../src/editor/room-library-panel.cjs'),
  Board = require('../src/editor/graph-board.cjs');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('src/editor/index.html');
const appSource = read('src/editor/app.cjs');

function menuIds(id) {
  const panel = html.match(new RegExp(`id="${id}"[\\s\\S]*?</div>`));
  assert.ok(panel, `menu ${id} must exist`);
  return [...panel[0].matchAll(/<button[^>]*id="([^"]+)"/g)].map((match) => match[1]);
}
function fakeApp(project = M.themedExample()) {
  return {
    store: { project },
    state: { courseId: project.courses[0].id, graphSelection: null, roomFilter: 'all' },
    course() {
      return (
        project.courses.find((course) => course.id === this.state.courseId) || project.courses[0]
      );
    },
    roomOwner(roomId) {
      for (const course of project.courses)
        for (const room of course.rooms) if (room.id === roomId) return { course, room };
      return null;
    },
  };
}

test('project and tools menus keep legacy management reachable', () => {
  assert.deepEqual(menuIds('menu-project'), [
    'open-project',
    'save-as',
    'export-room',
    'import-room',
  ]);
  assert.deepEqual(menuIds('menu-tools'), ['open-assets', 'open-definitions', 'export-project']);
  assert.match(html, /<button id="save-project" class="primary">保存项目<\/button/);
  assert.match(html, /id="cloud-room-library"[^>]*class="primary"/);
  assert.equal(html.includes('id="open-course-tools"'), false);
});

test('the planning strip is room-first: every room, no course chips or legend', () => {
  const app = fakeApp(),
    strip = Nav.strip(app),
    rooms = app.store.project.courses.flatMap((course) => course.rooms);
  for (const room of rooms) {
    assert.ok(strip.includes(`data-strip-room="${room.id}"`), 'every room has a thumbnail');
    assert.ok(strip.includes(`data-strip-mini="${room.id}"`), 'the thumbnail paints room content');
    assert.ok(strip.includes(`data-strip-edit="${room.id}"`), 'every room has an edit control');
    assert.ok(strip.includes(`data-fav="${room.id}"`), 'every room has a favourite star');
    assert.ok(strip.includes(`title="${room.name}`), 'the name is truncated in CSS, full in title');
  }
  for (const removed of [
    'data-select-course',
    'data-enter=',
    'data-course-menu',
    'data-course=',
    'class="course-chip',
    '进入大关',
  ])
    assert.equal(strip.includes(removed), false, `${removed} must not be on the main screen`);
  assert.equal(strip.includes('＋ 新建大关'), false);
});

test('thumbnail boxes retain each room aspect ratio', () => {
  const wide = Nav.thumbSize({ cols: 40, rows: 10 }),
    tall = Nav.thumbSize({ cols: 10, rows: 40 });
  assert.equal(wide.height, 48, 'very wide rooms clamp to the minimum height');
  assert.ok(tall.height > wide.height, 'taller rooms get taller thumbnails');
  assert.equal(Nav.thumbSize({ cols: 30, rows: 17 }).width, 112);
});

test('新建房间 targets the selected room owner, else the active course', () => {
  const app = fakeApp();
  app.state.graphSelection = { kind: 'room', id: app.store.project.courses[1].rooms[0].id };
  const selected = Nav.addTarget(app);
  assert.equal(selected.course.id, app.store.project.courses[1].id);
  assert.equal(selected.fromSelection, true);
  app.state.graphSelection = null;
  const fallback = Nav.addTarget(app);
  assert.equal(fallback.course.id, app.store.project.courses[0].id);
  assert.equal(fallback.fromSelection, false);
  const tools = Nav.tools(app);
  assert.match(tools, /id="add-room"/);
  assert.match(tools, new RegExp(app.store.project.courses[0].name));
  assert.match(tools, /title="[^"]*沿用当前项目/);
});

test('advanced course entry is removed from planning and menus', () => {
  assert.equal(read('src/editor/pages/planning.cjs').includes('Nav.advanced(app)'), false);
  assert.equal(html.includes('open-course-tools'), false);
});

test('organisation filters are 全部 / 收藏 / user groups', () => {
  const app = fakeApp(),
    project = app.store.project,
    roomA = project.courses[0].rooms[0].id,
    roomB = project.courses[1].rooms[0].id;
  project.roomOrganization = Org.createGroup(Org.toggleFavorite(Org.empty(), roomA), '跨大关', [
    roomA,
    roomB,
  ]);
  const filters = Nav.filters(app);
  assert.match(filters, /data-room-filter="all"/);
  assert.match(filters, /data-room-filter="favorites"/);
  assert.match(filters, /data-room-filter="group:group-1"/);
  assert.match(filters, /跨大关/);
  assert.deepEqual(Org.filterRoomIds(project, 'favorites'), [roomA]);
  assert.deepEqual(Org.filterRoomIds(project, 'group:group-1'), [roomA, roomB]);
  app.state.roomFilter = 'group:group-1';
  const strip = Nav.strip(app);
  assert.ok(strip.includes(roomA) && strip.includes(roomB));
  assert.equal(
    (strip.match(/data-strip-room=/g) || []).length,
    2,
    'the group filter narrows the strip without reordering rooms',
  );
});

test('room library is all rooms with no course headings or course filter', () => {
  const app = fakeApp(),
    markup = Library.markup(app),
    rooms = app.store.project.courses.flatMap((course) => course.rooms);
  for (const room of rooms) assert.ok(markup.includes(`data-room-card="${room.id}"`));
  assert.equal((markup.match(/data-mini="/g) || []).length, rooms.length);
  assert.equal((markup.match(/data-fav="/g) || []).length, rooms.length);
  assert.equal(markup.includes('library-course-heading'), false);
  assert.equal(markup.includes('data-library-course'), false);
  assert.equal(markup.includes('data-course-section'), false);
  assert.match(markup, /data-room-rename=/);
  assert.match(markup, /data-room-copy=/);
  assert.match(markup, /data-room-export=/);
  assert.match(markup, /data-room-delete=/);
  assert.match(markup, /data-room-import/);
  assert.match(markup, /data-room-clipboard-copy disabled/);
  assert.match(markup, /data-room-clipboard-paste disabled/);
  assert.match(markup, /class="group-control"/);
  // The course page still locks the library to one owner (compatibility).
  const locked = Library.markup(app, { courseId: app.store.project.courses[1].id });
  assert.equal(
    (locked.match(/data-room-card="/g) || []).length,
    app.store.project.courses[1].rooms.length,
  );
});

test('map markup drops the course legend and moves help behind a summary', () => {
  const markup = Board.markup(fakeApp());
  assert.match(markup, /id="graph"/);
  assert.match(markup, /id="graph-snap"[^>]*checked/);
  assert.match(markup, /id="graph-fit"/);
  assert.match(markup, /id="graph-focus-selection"/);
  assert.equal(markup.includes('当前大关'), false);
  assert.match(markup, /全部房间/);
  assert.equal(markup.includes('graph-legend'), false);
  assert.equal(markup.includes('course-chip'), false);
  assert.match(markup, /<details class="graph-help"><summary/);
  assert.match(markup, /id="graph-inspector"/);
  assert.match(read('src/editor/draw.cjs'), /favorites = null/);
});

test('the map tab renders the board markup before mounting it', () => {
  const source = read('src/editor/pages/planning.cjs'),
    markupAt = source.indexOf("$('planning-content').innerHTML = Board.markup(app)"),
    mountAt = source.indexOf('Board.mount(app)');
  assert.ok(markupAt > -1 && mountAt > -1 && markupAt < mountAt);
  assert.ok(
    source.indexOf('\'<div id="planning-content"></div>\'') < markupAt,
    'the planning template owns the container the board is rendered into',
  );
});

test('Planning.render mounts the map only after inserting its markup', () => {
  const nodes = new Map(),
    node = (id) => {
      if (!nodes.has(id)) nodes.set(id, { id, innerHTML: '', textContent: '', onclick: null });
      return nodes.get(id);
    },
    Planning = require('../src/editor/pages/planning.cjs'),
    saved = {
      bind: Nav.bind,
      tabs: Nav.tabs,
      tools: Nav.tools,
      filters: Nav.filters,
      strip: Nav.strip,
      advanced: Nav.advanced,
      contextMenu: Nav.contextMenu,
      roomsOf: Nav.roomsOf,
      ensureProjectLayout: Board.ensureProjectLayout,
      markup: Board.markup,
      mount: Board.mount,
    },
    order = [];
  global.document = { getElementById: node, createElement: () => node('created') };
  Nav.bind = () => {};
  Nav.tabs = () => '<div class="tabs"></div>';
  Nav.tools = () => '';
  Nav.filters = () => '';
  Nav.strip = () => '';
  Nav.advanced = () => '';
  Nav.contextMenu = () => '';
  Nav.roomsOf = () => [];
  Board.ensureProjectLayout = () => false;
  Board.markup = () => {
    order.push('markup');
    return '<div class="graph-layout planning-map"><canvas id="graph"></canvas></div>';
  };
  Board.mount = () => {
    order.push('mount');
    assert.match(
      node('planning-content').innerHTML,
      /<canvas id="graph">/,
      'the board canvas must exist in #planning-content before mount runs',
    );
  };
  try {
    const app = fakeApp();
    app.state.planningTab = 'map';
    Planning.render(app);
  } finally {
    Object.assign(Nav, {
      bind: saved.bind,
      tabs: saved.tabs,
      tools: saved.tools,
      filters: saved.filters,
      strip: saved.strip,
      advanced: saved.advanced,
      contextMenu: saved.contextMenu,
      roomsOf: saved.roomsOf,
    });
    Object.assign(Board, {
      ensureProjectLayout: saved.ensureProjectLayout,
      markup: saved.markup,
      mount: saved.mount,
    });
    delete global.document;
  }
  assert.deepEqual(order, ['markup', 'mount']);
});

test('empty projects still get an onboarding entry', () => {
  assert.match(appSource, /start-import/);
  assert.match(appSource, /start-new/);
  assert.match(appSource, /newThemedProject/);
  assert.match(appSource, /planningTab: 'map'/);
});
