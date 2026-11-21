'use strict';
// Live fields must coalesce a fast cross-field burst into ONE commit that sees
// every drafted value. This reproduces the real failure: an immediate commit on
// blur re-rendered the inspector and the next fill landed on a detached input.
const test = require('node:test'),
  assert = require('node:assert/strict');
const LiveFields = require('../src/editor/live-fields.cjs');

function input(host, id, value = '', type = 'number') {
  const el = {
    id,
    value,
    type,
    tagName: 'INPUT',
    dataset: {},
    isConnected: true,
    disabled: false,
    validity: { valid: true },
    // Pretend the time-stepper wrapper is already installed so install() skips
    // the DOM construction that this focused fixture does not implement.
    parentElement: { dataset: { timeStepper: '1' } },
    listeners: {},
    addEventListener(type, fn) {
      (this.listeners[type] ||= []).push(fn);
    },
    dispatch(type, event = {}) {
      for (const fn of this.listeners[type] || []) fn({ target: this, ...event });
    },
    closest() {
      return null;
    },
    focus() {
      global.document.activeElement = this;
    },
  };
  host.inputs.push(el);
  return el;
}
function hostWith(ids) {
  const host = {
    inputs: [],
    buttons: new Map(),
    clicks: [],
    querySelector(selector) {
      const id = selector.slice(1);
      return this.buttons.get(id) || this.inputs.find((el) => el.id === id) || null;
    },
    querySelectorAll() {
      return this.inputs;
    },
  };
  const button = {
    id: 'native-apply',
    hidden: false,
    disabled: false,
    click() {
      // The real handler reads the whole form in one pass; snapshot it.
      host.clicks.push(host.inputs.map((el) => el.value));
      // A commit re-renders and detaches every current input.
      for (const el of host.inputs) el.isConnected = false;
    },
  };
  host.buttons.set(button.id, button);
  for (const id of ids) input(host, id);
  global.document = {
    activeElement: null,
    getElementById: (id) => host.inputs.find((el) => el.id === id) || null,
  };
  return host;
}

test('rapid cross-field fills commit together with every value', async () => {
  const host = hostWith(['native-x', 'native-y', 'native-seconds']);
  LiveFields.install(host);
  const [x, y, seconds] = host.inputs;
  for (const [el, value] of [
    [x, '6'],
    [y, '14'],
    [seconds, '2.5'],
  ]) {
    el.focus();
    el.value = value;
    el.dispatch('input');
  }
  // Nothing is committed while the burst is still being typed.
  assert.equal(host.clicks.length, 0);
  await new Promise((resolve) => setTimeout(resolve, 260));
  assert.equal(host.clicks.length, 1, 'one commit for the whole burst');
  assert.deepEqual(host.clicks[0], ['6', '14', '2.5']);
});

test('a select commits immediately and still carries pending drafts', () => {
  const host = hostWith(['native-x', 'native-y']);
  LiveFields.install(host);
  const [x, y] = host.inputs;
  x.value = '9';
  x.dispatch('input');
  y.value = '7';
  y.dispatch('input');
  // Selects are not in this fixture; exercise flushAll as the immediate path.
  LiveFields.flushAll();
  assert.equal(host.clicks.length, 1);
  assert.deepEqual(host.clicks[0], ['9', '7']);
});

test('flushAll applies a draft before navigation replaces the page', () => {
  const host = hostWith(['native-x']);
  LiveFields.install(host);
  host.inputs[0].value = '3';
  host.inputs[0].dispatch('input');
  LiveFields.flushAll();
  assert.deepEqual(host.clicks[0], ['3']);
});

test('a commit that re-enters flushAll does not recurse or double click', () => {
  const host = hostWith(['native-x']);
  LiveFields.install(host);
  const button = host.buttons.get('native-apply');
  let clicks = 0;
  const realClick = button.click;
  button.click = function () {
    clicks++;
    // A store commit re-renders and can reach the same save/export entry which
    // calls flushAll again; the guard must stop the recursion right there.
    LiveFields.flushAll();
    realClick.call(this);
  };
  host.inputs[0].value = '4';
  host.inputs[0].dispatch('input');
  LiveFields.flushAll();
  assert.equal(clicks, 1, 'the action is clicked once');
  assert.deepEqual(host.clicks[0], ['4']);
});

// Save / play / export / cloud-sync entries must flush the same 180ms draft
// queue as navigation does. These are source-level assertions because the real
// entries live in the browser app module.
test('save, play, cloud snapshot and export entries flush pending drafts', () => {
  const fs = require('node:fs'),
    path = require('node:path'),
    app = fs.readFileSync(path.join(__dirname, '../src/editor/app.cjs'), 'utf8'),
    cloud = fs.readFileSync(path.join(__dirname, '../src/editor/cloud-controller.cjs'), 'utf8');
  const flush = "require('./live-fields.cjs').flushAll()";
  const body = (name, size = 1600) => {
    const start = app.indexOf('  ' + name);
    assert.notEqual(start, -1, name + ' entry exists');
    return app.slice(start, start + size);
  };
  assert.ok(body('async saveNativeNow').includes(flush), 'save flushes drafts');
  assert.ok(body('startPlay(').includes(flush), 'playtest flushes drafts');
  assert.ok(body('async exportRoom').includes(flush), 'room export flushes drafts');
  assert.ok(
    app.includes("require('./live-fields.cjs').flushAll();\n      try {"),
    'project export flushes drafts',
  );
  const capture = cloud.slice(cloud.indexOf('  capture()'), cloud.indexOf('  changed()'));
  assert.ok(capture.includes(flush), 'cloud snapshot flushes drafts');
});

// Ctrl+S must save even while an input has focus, while every other shortcut
// keeps the browser's native text editing (Ctrl+C/V) inside that input.
test('Ctrl+S saves from a focused input and other shortcuts stay native', () => {
  const fs = require('node:fs'),
    path = require('node:path'),
    app = fs.readFileSync(path.join(__dirname, '../src/editor/app.cjs'), 'utf8');
  const start = app.indexOf("document.addEventListener('keydown'"),
    end = app.indexOf('\n      if (this.game) {', start);
  assert.notEqual(start, -1, 'keydown handler exists');
  assert.notEqual(end, -1, 'game key branch marks the end of the editor guard');
  // The guard now also contains the F11 fullscreen branch; slice to the game
  // branch instead of a fixed character count so unrelated additions cannot
  // silently truncate the input handling being asserted.
  const guard = app.slice(start, end);
  assert.ok(guard.includes("closest?.('input,textarea,select')"));
  assert.ok(guard.includes("e.code === 'KeyS'"));
  assert.ok(guard.includes("$('save-project').click()"));
  assert.ok(!guard.includes("e.code === 'KeyC'"), 'Ctrl+C is not intercepted in inputs');
  assert.ok(!guard.includes("e.code === 'KeyV'"), 'Ctrl+V is not intercepted in inputs');
});

// Typing while an IME composition is active must never draft or repaint: the
// candidate text lives in the live input until compositionend.
test('an IME composition defers the commit and compositionend lands it once', async () => {
  const host = hostWith(['native-x']);
  LiveFields.install(host);
  const x = host.inputs[0];
  x.focus();
  x.dispatch('compositionstart');
  x.value = '5';
  x.dispatch('input', { isComposing: true });
  x.dispatch('change', { isComposing: true });
  await new Promise((resolve) => setTimeout(resolve, 260));
  assert.equal(host.clicks.length, 0, 'nothing committed mid-composition');
  x.dispatch('compositionend');
  await new Promise((resolve) => setTimeout(resolve, 260));
  assert.equal(host.clicks.length, 1);
  assert.deepEqual(host.clicks[0], ['5']);
});

test('flushAll during a composition keeps the draft for compositionend', async () => {
  const host = hostWith(['native-x']);
  LiveFields.install(host);
  const x = host.inputs[0];
  x.focus();
  x.value = '8';
  x.dispatch('input');
  x.dispatch('compositionstart');
  LiveFields.flushAll();
  assert.equal(host.clicks.length, 0, 'no rebuild under the IME candidate');
  x.dispatch('compositionend');
  await new Promise((resolve) => setTimeout(resolve, 260));
  assert.equal(host.clicks.length, 1);
  assert.deepEqual(host.clicks[0], ['8']);
});

test('text fields use the long delay while an explicit save flushes them now', async () => {
  const host = hostWith(['native-name']);
  host.inputs[0].type = 'text';
  LiveFields.install(host);
  const el = host.inputs[0];
  assert.equal(LiveFields.TEXT_DRAFT_DELAY, 900);
  el.value = '新名称';
  el.dispatch('input');
  await new Promise((resolve) => setTimeout(resolve, 260));
  assert.equal(host.clicks.length, 0, 'text waits ~900ms before the repaint');
  LiveFields.flushAll();
  assert.equal(host.clicks.length, 1, 'explicit save flushes pending text');
  assert.deepEqual(host.clicks[0], ['新名称']);
});

test('a checkbox still commits immediately on change', () => {
  const host = hostWith(['native-flag']);
  const box = host.inputs[0];
  box.type = 'checkbox';
  box.value = 'on';
  LiveFields.install(host);
  box.dispatch('change');
  assert.equal(host.clicks.length, 1, 'checkbox commits without waiting');
});
