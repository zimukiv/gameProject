'use strict';
const Registry = require('../../plugins/registry.cjs'),
  Themes = require('../../project/themes.cjs'),
  Bindings = require('./bindings.cjs'),
  Room = require('./room.cjs'),
  { esc, $, field, area, select } = require('../dom.cjs');
function render(app) {
  const p = app.store.project,
    c = app.store.course(app.state.definitionCourse || app.course().id),
    defs = Registry.list(c.kind),
    d = defs.find((v) => v.type === app.state.definitionType) || defs[0],
    selected = d.type,
    config = Registry.courseDefaults(p, c, selected),
    local = c.blockDefaults?.[selected],
    params = Registry.params(p, { type: selected, params: config.params || {} });
  const fields = d.schema.filter(
    (f) => !['zone', 'path'].includes(f.kind) && f.key !== 'unlockPadId',
  );
  $('app').innerHTML =
    `<div class="page-title"><div><h1>功能块定义</h1><p class="muted">按大关设置专属机关和通用功能块的默认值。</p></div><div class="form">${select(
      '选择大关',
      'definition-course',
      c.id,
      p.courses.map((v) => [v.id, v.name + '（' + Themes.theme(v.kind).label + '）']),
    )}</div></div><div class="graph-layout"><div class="cards">${defs
      .map(
        (v) =>
          `<article class="card"><span class="badge">${esc(v.type)} · ${v.version}</span><h2>${esc(v.name)}</h2><p>${esc(v.category)} · 素材槽：${esc(v.slots.join(', '))}</p><button data-definition="${esc(v.type)}">编辑定义</button></article>`,
      )
      .join(
        '',
      )}</div><aside class="panel form"><h2>${esc(d.name)}</h2><p class="muted">${esc(c.name)}</p>${field('显示名称', 'definition-name', config.name || d.name)}${area('维护说明', 'definition-notes', config.notes || '')}${fields.map((f) => Room.schemaField(f, params[f.key], c.rooms[0])).join('')}<h3>新放置方块的素材</h3>${d.slots.map((slot) => `<label>${esc(slot)}<select data-definition-slot="${esc(slot)}">${Bindings.options(p, local?.assets?.[slot] || '', c.id, selected)}</select></label>`).join('')}<button id="save-definition" class="primary apply">保存本大关默认定义</button><p class="hint">名称、参数与此处选定的素材只应用于本大关以后放置的同类方块。留空时继承大关的美术绑定。</p></aside></div>`;
  $('definition-course').onchange = (e) => {
    app.state.definitionCourse = e.target.value;
    app.render();
  };
  $('app')
    .querySelectorAll('[data-definition]')
    .forEach(
      (b) =>
        (b.onclick = () => {
          app.state.definitionType = b.dataset.definition;
          app.render();
        }),
    );
  $('save-definition').onclick = () => {
    try {
      const values = {};
      for (const f of fields) values[f.key] = Room.readField(f);
      const assets = Object.fromEntries(
        [...$('app').querySelectorAll('[data-definition-slot]')]
          .filter((input) => input.value)
          .map((input) => [input.dataset.definitionSlot, input.value]),
      );
      app.store.change(() => {
        c.blockDefaults ||= {};
        c.blockDefaults[selected] = {
          ...local,
          name: $('definition-name').value.trim() || d.name,
          notes: $('definition-notes').value,
          params: { ...local?.params, ...values },
          assets,
        };
      });
    } catch (e) {
      app.message(e.message, true);
    }
  };
}
module.exports = { render };
