'use strict';
const A = require('../../assets/manager.cjs'),
  C = require('../../assets/catalog.cjs');
const { esc, $, field, select, modal } = require('../dom.cjs');
function render(app) {
  const p = app.store.project,
    courseId = app.state.assetCourse || 'all',
    group = app.state.assetGroup || null,
    sub = app.state.assetSub || null;
  const scoped = p.assets.filter((a) => courseId === 'all' || a.courseId === courseId);
  const matches = (a, g, s) => {
    const f = C.classification(p, a);
    return f.category === g && (!s || f.subcategory === s);
  };
  const groupName = C.GROUPS.find((g) => g.id === group)?.name,
    subName = C.children(group).find((s) => s.id === sub)?.name;
  app.state.assetImportFolder =
    group && sub
      ? {
          category: group,
          subcategory: sub,
          courseId: courseId === 'all' ? app.course().id : courseId,
        }
      : {
          category: 'unsorted',
          subcategory: 'unsorted',
          courseId: courseId === 'all' ? app.course().id : courseId,
        };
  const crumbs = `<div class="asset-crumbs"><button data-asset-home>素材分类</button>${group ? `<span>›</span><button data-asset-parent>${esc(groupName)}</button>` : ''}${sub ? `<span>›</span><strong>${esc(subName)}</strong>` : ''}</div>`;
  const folderCard = (id, name, glyph, items, attribute) =>
    `<button class="asset-folder" ${attribute}="${esc(id)}"><div class="folder-preview">${items[0] ? `<img src="${esc(app.assetURL(items[0].id) || '')}" alt="">` : `<span>${glyph}</span>`}</div><div><strong>${esc(name)}</strong><span>${items.length} 个素材</span></div><b>›</b></button>`;
  let content;
  if (!group)
    content = `<div class="asset-folder-grid">${C.GROUPS.map((g) =>
      folderCard(
        g.id,
        g.name,
        g.glyph,
        scoped.filter((a) => matches(a, g.id)),
        'data-asset-group',
      ),
    ).join('')}</div>`;
  else if (!sub)
    content = `<div class="asset-folder-grid">${C.children(group)
      .map((s) =>
        folderCard(
          s.id,
          s.name,
          '□',
          scoped.filter((a) => matches(a, group, s.id)),
          'data-asset-sub',
        ),
      )
      .join('')}</div>`;
  else {
    const items = scoped.filter((a) => matches(a, group, sub));
    content = `<div class="asset-grid">${items.map((a) => `<article class="card asset-card"><img src="${esc(app.assetURL(a.id) || '')}" alt="${esc(a.name)}"><h3>${esc(a.name)}</h3><p>${a.width} × ${a.height} · ${A.usage(p, a.id).length} 处引用</p><p>${esc(p.courses.find((c) => c.id === a.courseId)?.name || '通用素材')}</p><div class="actions"><button data-meta="${esc(a.id)}">资料 / 归类</button><button data-replace="${esc(a.id)}">替换</button><button data-remove="${esc(a.id)}" class="danger">移除</button></div></article>`).join('')}</div>${!items.length ? '<div class="asset-empty"><h2>这个分类还没有素材</h2><p>点击「导入图片 / 图集」，新素材会直接放到当前分类。</p></div>' : ''}`;
  }
  $('app').innerHTML =
    `<div class="page-title"><div><h1>项目素材库</h1><p class="muted">先选大类，再选子类，最后管理图片。应用到方块时自动筛选对应类别。</p></div><button id="add-assets" class="primary">导入图片 / 图集</button></div><div class="asset-library-toolbar">${crumbs}<select id="asset-filter" aria-label="素材所属大关"><option value="all">全部大关</option><option value="common">通用素材</option>${p.courses.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></div>${group && sub ? `<p class="asset-folder-hint">当前目录：${esc(groupName)} / ${esc(subName)} · 在这里导入将自动归入此类</p>` : ''}${content}`;
  $('asset-filter').value = courseId;
  $('asset-filter').onchange = (e) => {
    app.state.assetCourse = e.target.value;
    app.render();
  };
  $('app')
    .querySelectorAll('[data-asset-home]')
    .forEach(
      (b) =>
        (b.onclick = () => {
          app.state.assetGroup = null;
          app.state.assetSub = null;
          app.render();
        }),
    );
  $('app')
    .querySelectorAll('[data-asset-parent]')
    .forEach(
      (b) =>
        (b.onclick = () => {
          app.state.assetSub = null;
          app.render();
        }),
    );
  $('app')
    .querySelectorAll('[data-asset-group]')
    .forEach(
      (b) =>
        (b.onclick = () => {
          app.state.assetGroup = b.dataset.assetGroup;
          app.state.assetSub = null;
          app.render();
        }),
    );
  $('app')
    .querySelectorAll('[data-asset-sub]')
    .forEach(
      (b) =>
        (b.onclick = () => {
          app.state.assetSub = b.dataset.assetSub;
          app.render();
        }),
    );
  $('add-assets').onclick = () => app.pickAssets();
  $('app')
    .querySelectorAll('[data-replace]')
    .forEach((b) => (b.onclick = () => app.pickAssets(b.dataset.replace)));
  $('app')
    .querySelectorAll('[data-meta]')
    .forEach(
      (b) =>
        (b.onclick = () =>
          editMeta(
            app,
            p.assets.find((a) => a.id === b.dataset.meta),
          )),
    );
  $('app')
    .querySelectorAll('[data-remove]')
    .forEach(
      (b) =>
        (b.onclick = () => {
          const a = p.assets.find((a) => a.id === b.dataset.remove),
            used = A.usage(p, a.id);
          modal(
            '移除素材',
            `<p>${esc(a.name)} 有 ${used.length} 处引用。移除后引用保留并显示占位图，可撤销恢复。</p>`,
            [
              { label: '取消' },
              {
                label: '移除并保留引用',
                primary: true,
                action: () =>
                  app.store.change((v) => {
                    v.assets = v.assets.filter((item) => item.id !== a.id);
                  }),
              },
            ],
          );
        }),
    );
}
function editMeta(app, a) {
  const p = app.store.project,
    f = C.classification(p, a);
  modal(
    '素材资料与分类',
    `<div class="form">${field('名称', 'asset-name', a.name)}${select('所属大关', 'asset-course', a.courseId, [['common', '通用'], ...p.courses.map((c) => [c.id, c.name])])}<div class="row">${select(
      '大类',
      'asset-category',
      f.category,
      C.GROUPS.map((g) => [g.id, g.name]),
    )}${select(
      '子类',
      'asset-subcategory',
      f.subcategory,
      C.children(f.category).map((s) => [s.id, s.name]),
    )}</div><div class="row">${field('图集单帧宽（0 为整图）', 'frame-w', a.frameWidth, { type: 'number', min: 0 })}${field('图集单帧高', 'frame-h', a.frameHeight, { type: 'number', min: 0 })}</div>${field('动画 FPS', 'frame-fps', a.fps, { type: 'number', min: 1, max: 60 })}<p class="hint">${esc(A.usage(p, a.id).join('；') || '未使用')}。分类决定应用时的候选图片，已有绑定和素材 ID 保留。</p></div>`,
    [
      { label: '取消' },
      {
        label: '保存资料',
        primary: true,
        action: () => {
          const values = {
            name: $('asset-name').value.trim() || a.name,
            courseId: $('asset-course').value,
            category: $('asset-category').value,
            subcategory: $('asset-subcategory').value,
            frameWidth: Number($('frame-w').value),
            frameHeight: Number($('frame-h').value),
            fps: Number($('frame-fps').value) || 6,
          };
          app.state.assetGroup = values.category;
          app.state.assetSub = values.subcategory;
          app.store.change(() => Object.assign(a, values));
        },
      },
    ],
  );
  $('asset-category').onchange = () => {
    $('asset-subcategory').innerHTML = C.children($('asset-category').value)
      .map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`)
      .join('');
  };
}
module.exports = { render };
