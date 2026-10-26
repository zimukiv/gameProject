'use strict';
const Registry = require('../../plugins/registry.cjs'),
  Room = require('./room.cjs'),
  { esc, $, field, area } = require('../dom.cjs');
function render(app) {
  const p = app.store.project,
    selected = app.state.definitionType || 'physics.jet',
    d = Registry.get(selected),
    config = p.blockDefaults[selected] || {},
    params = Registry.params(p, { type: selected, params: config.params || {} });
  const fields = d.schema.filter((f) => !['zone', 'path'].includes(f.kind));
  $('app').innerHTML =
    `<div class="page-title"><div><h1>功能块定义</h1><p class="muted">实例参数与默认定义分开。行为源码各在独立模块，界面由参数定义生成。</p></div></div><div class="graph-layout"><div class="cards">${Registry.all()
      .filter((d) => d.courses.includes('physics') || d.courses.includes('*'))
      .map(
        (v) =>
          `<article class="card"><span class="badge">${esc(v.type)} · ${v.version}</span><h2>${esc(v.name)}</h2><p>${esc(v.category)} · 素材槽：${esc(v.slots.join(', '))}</p><button data-definition="${esc(v.type)}">编辑定义</button></article>`,
      )
      .join(
        '',
      )}</div><aside class="panel form"><h2>${esc(d.name)}</h2>${field('显示名称', 'definition-name', config.name || d.name)}${area('维护说明', 'definition-notes', config.notes || '')}${fields.map((f) => Room.schemaField(f, params[f.key], app.room())).join('')}<button id="save-definition" class="primary apply">保存默认定义</button><p class="hint">只影响以后新建实例。已有实例参数保留；要更新已有对象，请明确应用到它们。</p><p class="definition-code">src/plugins/${selected.startsWith('physics.') ? 'physics/' + selected.split('.')[1] + '.cjs' : 'common.cjs'}</p></aside></div>`;
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
      app.store.change((v) => {
        v.blockDefaults[selected] = {
          ...config,
          name: $('definition-name').value.trim() || d.name,
          notes: $('definition-notes').value,
          params: { ...config.params, ...values },
        };
      });
    } catch (e) {
      app.message(e.message, true);
    }
  };
}
module.exports = { render };
