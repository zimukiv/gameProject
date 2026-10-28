'use strict';
const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch],
  );
const $ = (id) => document.getElementById(id);
function field(label, key, value, { type = 'text', min = null, max = null, step = 1 } = {}) {
  return `<label for="${esc(key)}">${esc(label)}</label><input id="${esc(key)}" type="${type}" value="${esc(value)}" ${min != null ? 'min="' + min + '"' : ''} ${max != null ? 'max="' + max + '"' : ''} step="${step}">`;
}
function area(label, key, value) {
  return `<label for="${esc(key)}">${esc(label)}</label><textarea id="${esc(key)}">${esc(value)}</textarea>`;
}
function select(label, key, value, options) {
  return `<label for="${esc(key)}">${esc(label)}</label><select id="${esc(key)}">${options
    .map((o) => {
      const v = Array.isArray(o) ? o[0] : o,
        l = Array.isArray(o) ? o[1] : o;
      return `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`;
    })
    .join('')}</select>`;
}
const check = (label, key, value) =>
  `<label class="check"><input type="checkbox" id="${esc(key)}" ${value ? 'checked' : ''}>${esc(label)}</label>`;
function modal(title, html, buttons) {
  $('dialog-title').textContent = title;
  $('dialog-content').innerHTML = html;
  $('dialog-actions').replaceChildren();
  for (const config of buttons) {
    const b = document.createElement('button');
    b.textContent = config.label;
    if (config.primary) b.className = 'primary';
    b.onclick = () => {
      if (config.close !== false) $('dialog').close();
      config.action?.();
    };
    $('dialog-actions').append(b);
  }
  $('dialog').showModal();
}
function download(name, bytes, type = 'application/json') {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type }),
    url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
module.exports = { esc, $, field, area, select, check, modal, download };
