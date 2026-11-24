'use strict';
// Focused, GUI-free checks for the room editor group/path interactions:
// 1. clicking any grouped member resolves the inspector to one representative,
// 2. Space-peek node hits resolve their per-brick owner (and honour locks),
// 3. room thumbnail cards use the shared drag binder that supports group tabs,
// 4. the redundant second F11 fallback stays out of the room shortcut branch.
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const M = require('../src/project/model.cjs'),
  G = require('../src/project/block-groups.cjs'),
  Room = require('../src/editor/pages/room.cjs'),
  OrgUI = require('../src/editor/room-org-ui.cjs');
const R = require('../src/plugins/registry.cjs');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

function fixture() {
  const p = M.example(),
    c = p.courses[0],
    r = c.rooms[0];
  r.tiles = [{ x: 4, y: 6 }];
  r.objects = [R.instantiate(p, 'common.spike', 'spike', 5, 6)];
  r.movables = [
    { id: 'brick', x: 5, y: 5, targetX: 10, targetY: 5, padId: '', collision: true },
    { id: 'brick-2', x: 9, y: 5, targetX: 10, targetY: 5, padId: '', collision: true },
  ];
  return { p, c, r };
}

test('clicking any grouped member selects the assembly representative', () => {
  const { r } = fixture(),
    refs = [
      { kind: 'tiles', x: 4, y: 6 },
      { kind: 'objects', id: 'spike' },
      { kind: 'movables', id: 'brick' },
    ],
    leader = G.create(r, refs);
  assert.equal(leader.id, 'brick', 'the movable leader is the group representative');
  for (const ref of refs) {
    const state = { selection: { ...ref } };
    Room.selectRepresentative(r, state);
    assert.deepEqual(state.selection, leader, `member ${ref.kind} resolves to one representative`);
  }
  // Unrelated selections are untouched.
  const unrelated = { selection: { kind: 'entries', id: r.entries[0].id } };
  Room.selectRepresentative(r, unrelated);
  assert.deepEqual(unrelated.selection, { kind: 'entries', id: r.entries[0].id });
});

test('clicking a non-assembly brick group selects its geometric representative', () => {
  const { r } = fixture();
  r.movables[0].x = 4;
  r.movables[0].y = 5;
  r.movables[1].x = 6;
  r.movables[1].y = 5;
  r.movables[0].brickGroup = r.movables[1].brickGroup = 'group-a';
  const state = { selection: { kind: 'movables', id: 'brick-2' } };
  Room.selectRepresentative(r, state);
  assert.equal(state.selection.kind, 'movables');
  assert.ok(['brick', 'brick-2'].includes(state.selection.id));
  // Both bricks sit symmetrically around the centroid: the first member wins.
  assert.equal(state.selection.id, 'brick');
});

test('Space-peek node hits resolve the owning brick and reject locked nodes', () => {
  const { r } = fixture();
  r.movables[0].motionPath = [{ x: 3, y: 2, seconds: 0.5, mode: 'linear' }];
  r.movables[1].motionPath = [{ x: 7, y: 6, seconds: 0.5, mode: 'linear' }];
  const first = Room.brickPathNodeHit(r, { x: 3.2, y: 2.2 });
  assert.equal(first.brick.id, 'brick');
  assert.equal(first.index, 0);
  const second = Room.brickPathNodeHit(r, { x: 7.2, y: 6.2 });
  assert.equal(second.brick.id, 'brick-2');
  assert.equal(second.index, 0);
  // Exact overlap prefers the brick currently selected in the inspector.
  r.movables[1].motionPath = [{ x: 3, y: 2, seconds: 0.5, mode: 'linear' }];
  assert.equal(Room.brickPathNodeHit(r, { x: 3.2, y: 2.2 }, 'brick-2').brick.id, 'brick-2');
  assert.equal(Room.brickPathNodeHit(r, { x: 3.2, y: 2.2 }, 'brick').brick.id, 'brick');
  // A locked brick is skipped, so the overlapping unlocked brick owns the hit.
  r.movables[0].locked = true;
  assert.equal(Room.brickPathNodeHit(r, { x: 3.2, y: 2.2 }).brick.id, 'brick-2');
  r.movables[0].locked = false;
  r.movables[1].brickGroup = 'locked-group';
  r.movables[0].brickGroup = 'locked-group';
  r.movables[0].locked = true;
  assert.equal(Room.brickPathNodeHit(r, { x: 3.2, y: 2.2 }), null);
  // The brick's own start cell is not a trajectory node.
  r.movables[1].motionPath = [{ x: 9, y: 5, seconds: 0.5, mode: 'linear' }];
  r.movables[0].motionPath = [];
  r.movables[0].locked = false;
  assert.equal(Room.brickPathNodeHit(r, { x: 9.5, y: 5.5 }), null);
});

test('room thumbnail cards join the shared drag binder for group tabs and reorder', () => {
  assert.match(OrgUI.CARD_SELECTOR, /\[data-nav-room\]/);
  assert.equal(OrgUI.cardId({ dataset: { navRoom: 'room-a' } }), 'room-a');
  assert.equal(OrgUI.cardId({ dataset: { stripRoom: 'room-b' } }), 'room-b');
  const nav = read('src/editor/room-navigation.cjs');
  assert.ok(nav.includes('OrgUI.bindCardDrag(app, host)'), 'thumbnail strip uses the shared binder');
  assert.ok(
    !nav.includes('room-tab-order.cjs'),
    'the old separate thumbnail reorder binder is no longer wired',
  );
});

// Minimal DOM stub: enough of Element/classList/pointer capture to exercise the
// shared binder without a browser or Electron window.
const datasetKey = (name) =>
  name.replace(/^data-/, '').replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
function matchesSelector(node, selector) {
  return selector.split(',').some((raw) => {
    const s = raw.trim();
    if (!s) return false;
    if (s.startsWith('.')) return node.classes.has(s.slice(1));
    if (['button', 'a', 'input', 'select', 'textarea'].includes(s)) return node.tag === s;
    const attr = s.match(/^\[([\w-]+)(?:\^?=\s*"([^"]*)")?\]$/);
    if (!attr) return false;
    const value = node.dataset[datasetKey(attr[1])];
    if (attr[2] === undefined) return value !== undefined;
    if (s.includes('^=')) return String(value || '').startsWith(attr[2]);
    return String(value) === attr[2];
  });
}
class FakeElement {
  constructor(dataset = {}, tag = 'div') {
    this.dataset = dataset;
    this.tag = tag;
    this.parent = null;
    this.children = [];
    this.classes = new Set();
    this.listeners = new Map();
    this.box = { x: 0, y: 0, width: 100, height: 40 };
    this.classList = {
      add: (...names) => names.forEach((name) => this.classes.add(name)),
      remove: (...names) => names.forEach((name) => this.classes.delete(name)),
      contains: (name) => this.classes.has(name),
    };
  }
  append(child) {
    child.parent = this;
    this.children.push(child);
    return child;
  }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }
  dispatch(type, event = {}) {
    event.target ||= this;
    for (const fn of this.listeners.get(type) || []) fn(event);
  }
  closest(selector) {
    for (let node = this; node; node = node.parent)
      if (matchesSelector(node, selector)) return node;
    return null;
  }
  descendants() {
    return this.children.flatMap((child) => [child, ...child.descendants()]);
  }
  querySelectorAll(selector) {
    return this.descendants().filter((node) => matchesSelector(node, selector));
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
  setPointerCapture() {}
  hasPointerCapture() {
    return true;
  }
  releasePointerCapture() {}
  getBoundingClientRect() {
    return this.box;
  }
}
test('shared binder assigns a thumbnail dropped on a group tab and reorders in-group', () => {
  const project = {
      courses: [
        {
          id: 'c',
          rooms: [
            { id: 'a', name: 'A' },
            { id: 'b', name: 'B' },
          ],
        },
      ],
      roomOrganization: { version: 1, favorites: [], groups: [] },
    },
    org = require('../src/project/room-organization.cjs');
  project.roomOrganization = org.createGroup(org.empty(), '目标组', ['b']);
  const app = {
    state: { roomFilter: 'all' },
    store: {
      project,
      change(fn) {
        fn(project);
      },
    },
    message() {},
  };
  const host = new FakeElement(),
    tab = host.append(new FakeElement({ roomFilter: 'group:group-1' }, 'button')),
    cardA = host.append(new FakeElement({ navRoom: 'a' }, 'button')),
    cardB = host.append(new FakeElement({ navRoom: 'b' }, 'button'));
  cardA.box = { x: 0, y: 0, width: 100, height: 40 };
  cardB.box = { x: 200, y: 0, width: 100, height: 40 };
  tab.box = { x: 0, y: 80, width: 90, height: 30 };
  const points = new Map();
  const previousDocument = global.document;
  global.document = {
    elementFromPoint: (x, y) => points.get(x + ',' + y) || null,
  };
  try {
    OrgUI.bindCardDrag(app, host);
    const fire = (node, type, x, y) =>
      node.dispatch(type, {
        button: 0,
        pointerId: 1,
        clientX: x,
        clientY: y,
        preventDefault() {},
      });
    // Drop card A on the named group tab.
    points.set('10,10', cardA);
    points.set('20,90', tab);
    fire(cardA, 'pointerdown', 10, 10);
    fire(cardA, 'pointermove', 20, 90);
    assert.ok(tab.classes.has('group-tab-drop'), 'group tab shows the drop target');
    fire(cardA, 'pointerup', 20, 90);
    assert.deepEqual(org.groupOf(project.roomOrganization, 'group-1').roomIds, ['b', 'a']);

    // Inside a group filter, dropping B after A only reorders the group list.
    app.state.roomFilter = 'group:group-1';
    const coursesBefore = JSON.stringify(project.courses);
    points.set('210,10', cardB);
    points.set('90,10', cardA);
    fire(cardB, 'pointerdown', 210, 10);
    fire(cardB, 'pointermove', 90, 10);
    fire(cardB, 'pointerup', 90, 10);
    assert.deepEqual(org.groupOf(project.roomOrganization, 'group-1').roomIds, ['a', 'b']);
    assert.equal(JSON.stringify(project.courses), coursesBefore, 'project room order is untouched');
  } finally {
    global.document = previousDocument;
  }
});

test('the room shortcut branch keeps a single F11 handler', () => {
  const app = read('src/editor/app.cjs'),
    matches = app.match(/if \(e\.code === 'F11'\)/g) || [];
  assert.equal(matches.length, 1, 'only the input-safe room guard handles F11');
  assert.ok(app.includes('setRoomPathPeek?.(true)'), 'Space turns the peek on');
  assert.ok(app.includes('setRoomPathPeek?.(false)'), 'keyup/blur turns the peek off');
});

// ---------------------------------------------------------------------------
// Build-8 group order/sidebar checks. Group order comes from group.roomIds, the
// All view can reorder a shared group when it is unambiguous, and the sidebar
// exposes collapsible group/ungrouped lists without touching project order.
function orderApp(rooms, groups) {
  const p = {
    courses: [{ id: 'c', kind: 'physics', rooms }],
    roomOrganization: { version: 1, favorites: [], groups },
  };
  return {
    state: { roomFilter: 'all', graphSelection: null, roomMulti: [] },
    store: {
      project: p,
      change(fn) {
        fn(p);
      },
    },
    message() {},
    render() {},
  };
}
function sampleRooms() {
  return ['a', 'b', 'c', 'd'].map((id) => ({
    id,
    name: id.toUpperCase(),
    cols: 10,
    rows: 8,
    entries: [{ id: id + '-entry' }],
    exits: [],
  }));
}
const roomOrderIn = (html, selector = 'data-strip-room') =>
  [...html.matchAll(new RegExp(selector + '="([^"]+)"', 'g'))].map((match) => match[1]);

test('planning and room-page thumbnail strips render group.roomIds order', () => {
  const rooms = sampleRooms(),
    groups = [
      { id: 'group-1', name: '节奏组', roomIds: ['c', 'a'] },
      { id: 'group-2', name: '另一组', roomIds: ['b'] },
    ],
    app = orderApp(rooms, groups);
  app.state.roomFilter = 'group:group-1';
  const planning = require('../src/editor/planning-nav.cjs').strip(app);
  assert.deepEqual(roomOrderIn(planning), ['c', 'a']);
  const page = require('../src/editor/room-navigation.cjs').strip(app);
  assert.deepEqual(roomOrderIn(page, 'data-nav-room'), ['c', 'a']);
  // The underlying project arrays keep their own order.
  assert.deepEqual(
    app.store.project.courses[0].rooms.map((room) => room.id),
    ['a', 'b', 'c', 'd'],
  );
});

test('an All-view drag reorders a shared group only when unambiguous', () => {
  const rooms = sampleRooms(),
    groups = [
      { id: 'group-1', name: '节奏组', roomIds: ['a', 'b'] },
      { id: 'group-2', name: '另一组', roomIds: ['a', 'b'] },
    ],
    app = orderApp(rooms, groups),
    org = require('../src/project/room-organization.cjs');
  assert.equal(OrgUI.reorderGroupId(app, 'a', 'b'), null, 'two shared groups are ambiguous');
  app.store.project.roomOrganization = {
    version: 1,
    favorites: [],
    groups: [{ id: 'group-1', name: '节奏组', roomIds: ['a', 'b'] }],
  };
  assert.equal(OrgUI.reorderGroupId(app, 'a', 'b'), 'group-1');

  const host = new FakeElement(),
    cardA = host.append(new FakeElement({ navRoom: 'a' }, 'button')),
    cardB = host.append(new FakeElement({ navRoom: 'b' }, 'button'));
  cardA.box = { x: 0, y: 0, width: 100, height: 40 };
  cardB.box = { x: 200, y: 0, width: 100, height: 40 };
  const points = new Map();
  const previousDocument = global.document;
  global.document = { elementFromPoint: (x, y) => points.get(x + ',' + y) || null };
  try {
    OrgUI.bindCardDrag(app, host);
    const fire = (node, type, x, y) =>
      node.dispatch(type, {
        button: 0,
        pointerId: 1,
        clientX: x,
        clientY: y,
        preventDefault() {},
      });
    points.set('10,10', cardA);
    points.set('290,10', cardB);
    fire(cardA, 'pointerdown', 10, 10);
    fire(cardA, 'pointermove', 290, 10);
    fire(cardA, 'pointerup', 290, 10);
    assert.deepEqual(org.groupOf(app.store.project.roomOrganization, 'group-1').roomIds, [
      'b',
      'a',
    ]);
    assert.deepEqual(
      app.store.project.courses[0].rooms.map((room) => room.id),
      ['a', 'b', 'c', 'd'],
      'project room order is untouched',
    );
  } finally {
    global.document = previousDocument;
  }
});

test('sidebar shows collapsible group lists and a split quick panel', () => {
  const rooms = sampleRooms(),
    app = orderApp(rooms, [
      { id: 'group-1', name: '节奏组', roomIds: ['c', 'a'] },
      { id: 'group-2', name: '另一组', roomIds: ['b'] },
    ]);
  const overview = OrgUI.quickGroupMarkup(app);
  assert.match(overview, /class="group-overview"/);
  assert.match(overview, /节奏组/);
  assert.match(overview, /另一组/);
  assert.match(overview, /未分组/);
  assert.equal((overview.match(/<details/g) || []).length, 3, 'each group plus ungrouped folds');
  const groupOrder = [...overview.matchAll(/data-group-quick-room="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(groupOrder.indexOf('c') < groupOrder.indexOf('a'), true);

  app.state.roomFilter = 'group:group-1';
  const quick = OrgUI.quickGroupMarkup(app);
  assert.equal((quick.match(/group-quick-section/g) || []).length, 2, 'in-group and rest split');
  assert.match(quick, /组内房间/);
  assert.match(quick, /未加入/);
  assert.match(quick, /group-quick-toggle/);
  assert.equal(
    quick.includes('左键点击房间加入分组，右键点击移出。开启路线图快捷模式后'),
    false,
    'the long hint is gone',
  );
  // In-group rows keep group order; the rest list contains every other room.
  const inGroup = quick.slice(quick.indexOf('组内房间'), quick.indexOf('未加入'));
  assert.deepEqual(roomOrderIn(inGroup, 'data-group-quick-room'), ['c', 'a']);
  const rest = quick.slice(quick.indexOf('未加入'));
  assert.deepEqual(roomOrderIn(rest, 'data-group-quick-room'), ['b', 'd']);
  // Left add / right remove bindings still cover every row.
  assert.ok(quick.includes('data-group-quick-group="group-1"'));
});
