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

// Text edits commit after a long enough pause that a burst of typing does not
// rebuild the inspector between keystrokes.
const TEXT_DEBOUNCE = 900;
// Consecutive debounced commits still belong to one typing run, so the undo
// merge window must stay wider than the debounce itself.
const UNDO_MERGE_WINDOW = TEXT_DEBOUNCE * 2;

// IME candidates are not project data yet. Any re-render/refocus while a
// composition is active drops the candidate and breaks the input, so every
// local commit and every remote rebuild is deferred until compositionend.
const composing = new WeakSet();
let composingCount = 0;
const compositionEndHandlers = new Set();
function beginComposition(el) {
  if (!el || composing.has(el)) return;
  composing.add(el);
  composingCount++;
}
function endComposition(el) {
  if (!el || !composing.delete(el)) return;
  composingCount = Math.max(0, composingCount - 1);
  if (!composingCount) for (const fn of [...compositionEndHandlers]) fn();
}
// Lets the live-field draft queue retry the commit that a composition held back.
function onCompositionEnd(fn) {
  compositionEndHandlers.add(fn);
  return () => compositionEndHandlers.delete(fn);
}
function isComposing(el) {
  return !!el && composing.has(el);
}
function anyComposing() {
  return composingCount > 0;
}

// A remote rebuild may only replace the inspector once the user stopped typing:
// the pending draft queue is flushed on a 0.9 s debounce, and an IME candidate
// lives only in the DOM until compositionend.
let lastEditAt = 0;
function noteEdit() {
  lastEditAt = Date.now();
}
function activelyEditing(now = Date.now()) {
  return anyComposing() || (lastEditAt > 0 && now - lastEditAt < TEXT_DEBOUNCE);
}

// Chromium exposes no selection API for <input type="number">: selectionStart is
// null. Treat such a focused field as "typing at the end" (the only caret the
// spinner/keypad produces in practice) so a repaint cannot reset it to 0.
function caretOf(el) {
  const value = String(el?.value ?? ''),
    start = typeof el?.selectionStart === 'number' ? el.selectionStart : null,
    end = typeof el?.selectionEnd === 'number' ? el.selectionEnd : null;
  return {
    id: el?.id,
    start,
    end,
    atEnd: start === null || (start >= value.length && (end ?? start) >= value.length),
  };
}
function captureFocus() {
  const el = typeof document !== 'undefined' ? document.activeElement : null;
  if (!el || !el.id) return null;
  if (!/^(INPUT|TEXTAREA|SELECT)$/.test(String(el.tagName || ''))) return null;
  return caretOf(el);
}
function applyCaret(el, state) {
  const value = String(el.value ?? '');
  let start, end;
  if (state.atEnd) start = end = value.length;
  else {
    // An intentional middle edit keeps its offsets, clamped to the value the
    // fresh node actually carries (the store may have trimmed/normalised it).
    start = Math.max(0, Math.min(value.length, state.start ?? 0));
    end = Math.max(start, Math.min(value.length, state.end ?? start));
  }
  if (typeof el.setSelectionRange === 'function') {
    try {
      el.setSelectionRange(start, end);
      return;
    } catch {}
  }
  // No selection API (number/date). Reassigning the value is the only supported
  // way to move that caret, and it lands at the end.
  if (state.atEnd) el.value = value;
}
function restoreFocus(state) {
  if (!state || !state.id) return;
  const el = typeof document !== 'undefined' ? document.getElementById(state.id) : null;
  if (!el) return;
  // Never steal focus or the caret from an active IME session.
  if (anyComposing() || isComposing(el)) return;
  el.focus({ preventScroll: true });
  applyCaret(el, state);
}
function write(app, key, fn) {
  // Rebuilding the inspector under an active composition would destroy it.
  if (anyComposing()) return;
  const focus = captureFocus();
  // Store.change passes the merge contract straight to History.commit, which
  // reads merge.key/window: keep the shapes identical or bursts never collapse.
  app.store.change(fn, key ? { key, window: UNDO_MERGE_WINDOW } : null);
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
  // The timer is tracked so an explicit save can flush it before reading the
  // project instead of stranding the last keystrokes in the DOM.
  for (const id of ['room-name', 'room-notes']) {
    const el = $(id);
    if (!el) continue;
    el.addEventListener('compositionstart', () => beginComposition(el));
    el.addEventListener('compositionend', () => {
      endComposition(el);
      if (el.isConnected) scheduleText(el);
    });
    el.addEventListener('input', (event) => {
      if (event?.isComposing || isComposing(el)) return;
      noteEdit();
      scheduleText(el);
    });
  }
}
const textTimers = new Map();
function scheduleText(el) {
  clearTimeout(textTimers.get(el.id));
  textTimers.set(
    el.id,
    setTimeout(() => {
      textTimers.delete(el.id);
      // Re-resolve by id: a repaint may have replaced the node since the edit.
      const current = $(el.id);
      if (!current || !current.isConnected) return;
      if (isComposing(current) || anyComposing()) {
        // Keep the text queued while the IME candidate is live and retry after
        // the composition instead of dropping the last keystrokes.
        scheduleText(current);
        return;
      }
      current.dispatchEvent(new Event('change'));
    }, TEXT_DEBOUNCE),
  );
}
// Explicit save / play / export / cloud snapshot entries call this so the last
// typed text is committed even if the debounce timer has not fired yet.
function flushPending() {
  for (const [id, timer] of [...textTimers]) {
    const el = $(id);
    if (!el || !el.isConnected) {
      clearTimeout(timer);
      textTimers.delete(id);
      continue;
    }
    // Never commit under an active composition: the timer keeps running and
    // retries once the IME session ends.
    if (isComposing(el) || anyComposing()) continue;
    clearTimeout(timer);
    textTimers.delete(id);
    el.dispatchEvent(new Event('change'));
  }
}
module.exports = {
  install,
  captureFocus,
  restoreFocus,
  caretOf,
  applyCaret,
  beginComposition,
  endComposition,
  onCompositionEnd,
  isComposing,
  anyComposing,
  noteEdit,
  activelyEditing,
  flushPending,
  TEXT_DEBOUNCE,
};
