'use strict';
// Room properties and mechanism parameters apply as you edit them. The explicit
// 应用房间设置 button is gone: text/number fields commit on change (and, for text,
// on a short debounce), selects and checkboxes commit immediately.
//
// Rules
// - A half-typed or invalid number never writes: inputs are validated first and
//   the stored value is left untouched, so no corrupt data is persisted.
// - A full re-render happens on every commit (the app redraws on store changes),
//   so focus, caret position and the room view are restored afterwards.
// - Room shrinking keeps out-of-bounds objects (stage contract) and reports once
//   through the status message instead of a dialog on every keystroke.
// - Bursts on the same field collapse into one undo step (store merge).
const M = require('../project/model.cjs'),
  Limits = require('../project/room-limits.cjs'),
  PlaytestItems = require('../project/playtest-items.cjs'),
  CameraPanel = require('./room-camera-panel.cjs'),
  { $ } = require('./dom.cjs');

const TEXT_DEBOUNCE = 400;

function captureFocus() {
  const el = document.activeElement;
  if (!el || !el.id) return null;
  return {
    id: el.id,
    start: typeof el.selectionStart === 'number' ? el.selectionStart : null,
    end: typeof el.selectionEnd === 'number' ? el.selectionEnd : null,
  };
}
function restoreFocus(state) {
  if (!state) return;
  const el = document.getElementById(state.id);
  if (!el) return;
  el.focus({ preventScroll: true });
  if (state.start !== null && typeof el.setSelectionRange === 'function') {
    try {
      el.setSelectionRange(state.start, state.end ?? state.start);
    } catch {}
  }
}
function write(app, key, fn) {
  const focus = captureFocus();
  // Store.change passes the merge contract straight to History.commit, which
  // reads merge.key/window: keep the shapes identical or bursts never collapse.
  app.store.change(fn, key ? { key, window: 900 } : null);
  restoreFocus(focus);
  app.currentDraw?.();
}
function textValue(input) {
  return input.value.replace(/^\s+|\s+$/g, '');
}
function install(app, r) {
  const bind = (id, handler, events = ['change']) => {
    const el = $(id);
    if (!el) return;
    for (const event of events) el.addEventListener(event, handler);
  };

  bind('room-name', () => {
    const name = textValue($('room-name'));
    if (!name) {
      // Empty names are rejected without touching the stored room.
      app.message('房间名称不能为空，已保留原名称。', true);
      return;
    }
    if (name === r.name) return;
    write(app, 'room-name:' + r.id, () => {
      r.name = name;
    });
  });

  bind('room-notes', () => {
    const notes = $('room-notes').value;
    if (notes === (r.notes || '')) return;
    write(app, 'room-notes:' + r.id, () => {
      r.notes = notes;
    });
  });

  bind('room-ai-id', () => {
    const value = textValue($('room-ai-id')) || null;
    if (value === (r.aiId ?? null)) return;
    write(app, 'room-ai:' + r.id, () => {
      r.aiId = value;
    });
  });

  bind('room-ai-policy', () => {
    const value = $('room-ai-policy').value;
    if (value === r.aiPolicy) return;
    write(app, 'room-ai-policy:' + r.id, () => {
      r.aiPolicy = value;
    });
  });

  bind('room-env', () => {
    const el = $('room-env');
    if (!el || el.value === r.environment) return;
    write(app, 'room-env:' + r.id, () => {
      r.environment = el.value;
    });
  });

  // Size: only integers inside the supported range are written. Shrinking keeps
  // out-of-bounds data and reports it once; there is no dialog per key press.
  const resize = () => {
    const cols = Number($('room-cols').value),
      rows = Number($('room-rows').value);
    if (!Limits.valid(cols, rows)) return;
    if (cols === r.cols && rows === r.rows) return;
    const result = M.resizeRoom(r, cols, rows);
    // Each deliberate resize is its own undo step.
    write(app, null, () => {
      Object.assign(r, result.room);
    });
    if (result.out.length)
      app.message(
        '已缩小到 ' +
          cols +
          ' × ' +
          rows +
          '，' +
          result.out.length +
          ' 个元素越界（数据保留并标红，试玩前需移回）。',
      );
  };
  bind('room-cols', resize, ['input', 'change']);
  bind('room-rows', resize, ['input', 'change']);

  const writePlaytest = () => {
    const mode = $('room-playtest-mode')?.value,
      items = [...document.querySelectorAll('[data-playtest-item]')]
        .filter((box) => box.checked)
        .map((box) => box.dataset.playtestItem);
    if (mode === 'explicit') {
      const current = PlaytestItems.read(r);
      if (
        current.configured &&
        current.items.length === items.length &&
        current.items.every((item) => items.includes(item))
      )
        return;
      write(app, 'room-playtest:' + r.id, () => PlaytestItems.write(r, items));
    } else if (PlaytestItems.read(r).configured) {
      write(app, 'room-playtest:' + r.id, () => PlaytestItems.write(r, null));
    }
  };
  bind('room-playtest-mode', writePlaytest);
  for (const box of document.querySelectorAll('[data-playtest-item]'))
    box.addEventListener('change', writePlaytest);

  // Play camera: invalid/partial values keep the previous camera.
  const camera = () => {
    let value;
    try {
      value = CameraPanel.read();
    } catch {
      return;
    }
    const current = require('../project/play-camera.cjs').resolve(r);
    if (JSON.stringify(current) === JSON.stringify(value)) return;
    write(app, 'room-camera:' + r.id, () => {
      r.playCamera = value;
    });
  };
  for (const id of ['room-camera-mode', 'room-camera-cols', 'room-camera-rows'])
    bind(id, camera, ['input', 'change']);

  // Text fields also apply on a short debounce so the user does not have to
  // leave the field to see the change, while still coalescing one undo step.
  for (const id of ['room-name', 'room-notes']) {
    const el = $(id);
    if (!el) continue;
    let timer = null;
    el.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (el.isConnected) el.dispatchEvent(new Event('change'));
      }, TEXT_DEBOUNCE);
    });
  }
}
module.exports = { install, captureFocus, restoreFocus };
