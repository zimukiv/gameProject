'use strict';
const Registry = require('../../plugins/registry.cjs'),
  { esc, $ } = require('../dom.cjs');
const Catalog = require('../../assets/catalog.cjs'),
  Spec = require('../../assets/spec.cjs');
function slotHint(type, slot, asset) {
  const info = Spec.check(asset || { name: '', path: '' }, { type, slot }) || null;
  const expected = info?.expected;
  if (!expected) return '';
  const shape =
    info.collision === 'pad'
      ? ' · 碰撞 32×8'
      : info.collision === 'hazard-circle'
        ? ' · 伤害圆 r11'
        : '';
  return `<small class="asset-spec ${esc(info.status)}" title="${esc([...(info.issues || []), ...(info.warnings || [])].join('；'))}">规范 ${expected.width}×${expected.height}${shape}${info.issues?.length ? ' · 当前不符（可用）' : ''}</small>`;
}
function options(p, value, courseId, type, inherit = true) {
  const available = Catalog.available(p, courseId, type);
  return (
    `<option value="">${inherit ? '继承 / 占位' : '无'}</option>` +
    (value && !available.some((a) => a.id === value)
      ? `<option value="${esc(value)}" selected disabled>当前引用需重新归类（保留）</option>`
      : '') +
    available
      .map(
        (a) =>
          `<option value="${esc(a.id)}" ${a.id === value ? 'selected' : ''}>${esc(a.name)}</option>`,
      )
      .join('')
  );
}
function renderCourse(app, c, host) {
  const p = app.store.project,
    defs = [{ type: 'common.solid', name: '固定地形', slots: ['idle'] }, ...Registry.list(c.kind)];
  host.innerHTML = `<div class="panel"><p class="hint">设置本大关各状态素材；实例「外观」可覆盖，替换素材不改碰撞。</p><table class="table"><thead><tr><th>功能块</th><th>状态</th><th>本关素材</th><th>预览</th></tr></thead><tbody>${defs
    .flatMap((d) =>
      d.slots.map((slot) => {
        const value = c.artBindings[d.type]?.[slot] || '',
          asset = value ? p.assets.find((a) => a.id === value) : null;
        return `<tr><td>${esc(d.name)}</td><td>${esc(slot)}</td><td><select data-bind-type="${esc(d.type)}" data-slot="${esc(slot)}">${options(p, value, c.id, d.type)}</select></td><td>${value ? `<img class="slot-preview" src="${esc(app.assetURL(value) || '')}" alt="">` : '占位图'}${slotHint(d.type, slot, asset)}</td></tr>`;
      }),
    )
    .join('')}</tbody></table></div>`;
  host.querySelectorAll('[data-bind-type]').forEach(
    (input) =>
      (input.onchange = () =>
        app.store.change(() => {
          c.artBindings[input.dataset.bindType] = c.artBindings[input.dataset.bindType] || {};
          c.artBindings[input.dataset.bindType][input.dataset.slot] = input.value;
        })),
  );
}
function renderObject(app, o, d, host) {
  if (!d) {
    host.innerHTML = '<p class="hint">此对象使用入口/出口编辑标记。</p>';
    return;
  }
  const p = app.store.project;
  host.innerHTML =
    '<p class="hint">显示本类素材；留空继承本大关外观。</p>' +
    d.slots
      .map(
        (slot) =>
          `<label>${esc(slot)}</label><select data-object-slot="${esc(slot)}">${options(p, o.assetOverrides?.[slot] || '', app.course().id, d.type)}</select>${slotHint(d.type, slot, o.assetOverrides?.[slot] ? p.assets.find((a) => a.id === o.assetOverrides[slot]) : null)}`,
      )
      .join('');
  host.querySelectorAll('[data-object-slot]').forEach(
    (input) =>
      (input.onchange = () =>
        app.store.change(() => {
          o.assetOverrides = o.assetOverrides || {};
          o.assetOverrides[input.dataset.objectSlot] = input.value;
        })),
  );
}
module.exports = { renderCourse, renderObject, options, slotHint };
