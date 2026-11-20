'use strict';
const Live = require('./live-room-settings.cjs');
const actions = [
  'apply-object',
  'apply-behavior',
  'apply-movable',
  'save-zone',
  'save-ai-id',
  'save-entry',
  'brick-node-save',
  'teacher-node-save',
  'rail-node-apply',
  'native-apply',
  'nr-save',
  'np-save',
  'nc-save',
];
// One shared short queue for every live field. A commit re-renders the whole
// inspector, so a per-field immediate commit on blur destroys the sibling input
// the user is already typing into (the next fill lands on a detached node).
// Instead all edits in one quick burst are drafted, applied to the still-live
// inputs, and committed by a single click when the queue settles. Selects and
// checkboxes still commit on their own event.
const DRAFT_DELAY = 180;
let pending = new Map(),
  flushTimer = null;
function schedule(delay = DRAFT_DELAY) {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, delay);
}
function draft(input, host, actionId) {
  pending.set(input.id, { id: input.id, host, actionId, value: input.value, input });
}
// A flush clicks the form action, which commits and re-renders. If that render
// (or a save triggered by the same user gesture) reaches flushAll again, the
// guard keeps it from re-entering the click handler recursively.
let flushing = false;
function flush() {
  clearTimeout(flushTimer);
  flushTimer = null;
  if (flushing) return;
  const entries = [...pending.values()];
  pending = new Map();
  const live = entries.filter((entry) => entry.input?.isConnected);
  if (!live.length) return;
  // Do not let one half-typed number block the valid drafts beside it. The
  // invalid text stays in its input as a draft and is committed on a later event.
  const valid = live.filter(
    (entry) => !(entry.input.type === 'number' && !entry.input.validity.valid),
  );
  for (const entry of valid) {
    const el = entry.host.querySelector('#' + entry.id);
    if (el && el.isConnected && el.value !== entry.value) el.value = entry.value;
  }
  const action = valid
    .map((entry) => entry.host.querySelector('#' + entry.actionId))
    .find((button) => button && !button.disabled);
  if (!action) return;
  // The button handler reads every field from the current form, so the draft
  // values above are all committed in this single render pass.
  const focus = Live.captureFocus();
  flushing = true;
  try {
    action.click();
  } finally {
    flushing = false;
    Live.restoreFocus(focus);
  }
}
function install(host) {
  const buttons = actions.map((id) => host.querySelector('#' + id)).filter(Boolean);
  for (const b of buttons) b.hidden = true;
  function action(input) {
    const id = input.id;
    const specific = id.startsWith('brick-node-')
      ? 'brick-node-save'
      : id.startsWith('teacher-node-')
        ? 'teacher-node-save'
        : id.startsWith('rail-node-')
          ? 'rail-node-apply'
          : id.startsWith('native-')
            ? 'native-apply'
            : id.startsWith('nr-')
              ? 'nr-save'
              : id.startsWith('np-')
                ? 'np-save'
                : id.startsWith('nc-')
                  ? 'nc-save'
                  : null;
    if (specific) return host.querySelector('#' + specific);
    const form = input.closest('#object-form');
    return form && buttons.find((b) => form.contains(b));
  }
  for (const input of host.querySelectorAll('input,select,textarea')) {
    if (
      input.dataset.liveField ||
      ['object-collision', 'object-lock', 'native-lock'].includes(input.id)
    )
      continue;
    const button = action(input);
    if (!button) continue;
    input.dataset.liveField = '1';
    const commit = () => {
      if (!input.isConnected || button.disabled) return;
      if (input.type === 'number' && !input.validity.valid) {
        // A half-typed number never reaches the project data.
        input.reportValidity();
        return;
      }
      const focus = Live.captureFocus();
      button.click();
      Live.restoreFocus(focus);
    };
    input.addEventListener('change', () => {
      if (!input.isConnected) return;
      if (input.tagName === 'SELECT' || input.type === 'checkbox' || input.type === 'radio') {
        draft(input, host, button.id);
        flush();
        return;
      }
      draft(input, host, button.id);
      schedule();
    });
    // Typing applies as well (short debounce), not only blur/Enter.
    input.addEventListener('input', () => {
      if (!input.isConnected) return;
      draft(input, host, button.id);
      schedule();
    });
    // Keep commit for programmatic flows that still dispatch change events.
    input.commitLiveField = commit;
  }
  for (const id of ['brick-node-seconds', 'native-seconds', 'teacher-node-seconds']) {
    const input = host.querySelector('#' + id);
    if (!input || input.parentElement.dataset.timeStepper) continue;
    const wrap = document.createElement('div');
    wrap.dataset.timeStepper = '1';
    wrap.style.cssText = 'display:flex;gap:6px;align-items:stretch';
    input.before(wrap);
    wrap.append(input);
    input.style.minWidth = '0';
    input.style.flex = '1';
    const buttons = document.createElement('div');
    buttons.style.cssText = 'display:grid;grid-template-columns:repeat(2,46px);gap:3px';
    wrap.append(buttons);
    for (const delta of [-1, 1, -0.5, 0.5]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = (delta > 0 ? '+' : '−') + Math.abs(delta);
      b.dataset.timeDelta = String(delta);
      b.title = '调整 ' + delta + ' 秒';
      b.style.cssText = 'padding:3px;font-size:12px';
      b.disabled = !!action(input)?.disabled;
      b.onpointerdown = (e) => e.preventDefault();
      b.onclick = () => {
        const min = Number(input.min) || 0.05,
          max = Number(input.max) || 60;
        input.value = String(
          Math.round(Math.max(min, Math.min(max, (Number(input.value) || min) + delta)) * 100) /
            100,
        );
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };
      buttons.append(b);
    }
  }
}
// Real navigation, save, play and cloud/export snapshots must never strand a
// typed draft: flush it into the store before the project is read or the page is
// replaced. Callers only read the project afterwards, so no extra render loop.
function flushAll() {
  flush();
}
module.exports = { install, flushAll };
