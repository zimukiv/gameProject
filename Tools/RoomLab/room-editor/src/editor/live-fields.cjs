'use strict';
const actions = [
  'apply-object',
  'apply-behavior',
  'apply-movable',
  'save-zone',
  'save-ai-id',
  'save-entry',
  'brick-node-save',
  'rail-node-apply',
  'native-apply',
  'nr-save',
  'np-save',
  'nc-save',
];
function install(host) {
  const buttons = actions.map((id) => host.querySelector('#' + id)).filter(Boolean);
  for (const b of buttons) b.hidden = true;
  function action(input) {
    const id = input.id;
    const specific = id.startsWith('brick-node-')
      ? 'brick-node-save'
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
    input.addEventListener('change', () => {
      if (!input.isConnected || button.disabled) return;
      if (input.type === 'number' && !input.validity.valid) {
        input.reportValidity();
        return;
      }
      button.click();
    });
  }
  for (const id of ['brick-node-seconds', 'native-seconds']) {
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
module.exports = { install };
