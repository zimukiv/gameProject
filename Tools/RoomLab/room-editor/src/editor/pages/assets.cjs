'use strict';
const A = require('../../assets/manager.cjs'),
  C = require('../../assets/catalog.cjs'),
  Themes = require('../../project/themes.cjs');
const { esc, $, field, select, modal } = require('../dom.cjs');
function folders(project, group, course, assets) {
  const list = C.children(group, course?.kind);
  // Keep legacy or manually recategorised assets reachable in their stored folder.
  for (const a of assets) {
    const f = C.classification(project, a);
    if (f.category === group && !list.some((v) => v.id === f.subcategory))
      list.push(
        C.children(group).find((v) => v.id === f.subcategory) || {
          id: f.subcategory,
          name: f.subcategory,
        },
      );
  }
  return list;
}
const courseLabel = (c) => c.name + '（' + Themes.theme(c.kind).label + '）';
function render(app) {
  const p = app.store.project,
    scope = app.state.assetCourse,
    course = p.courses.find((c) => c.id === scope),
    courseId = scope === 'all' || scope === 'common' ? scope : (course || app.course()).id,
    active = p.courses.find((c) => c.id === courseId),
    group = app.state.assetGroup || null,
    sub = app.state.assetSub || null;
  const scoped = p.assets.filter((a) => {
    if (courseId === 'all' || a.courseId === courseId) return true;
    if (!active || !C.inCourse(a, active)) return false;
    const f = C.classification(p, a);
    return C.children(f.category, active.kind).some((v) => v.id === f.subcategory);
  });
  const matches = (a, g, s) => {
    const f = C.classification(p, a);
    return f.category === g && (!s || f.subcategory === s);
  };
  const groupName = C.GROUPS.find((g) => g.id === group)?.name,
    subName = folders(p, group, active, scoped).find((s) => s.id === sub)?.name || sub;
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
    content = `<div class="asset-folder-grid">${folders(p, group, active, scoped)
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
    `<div class="page-title"><div><h1>项目素材库</h1><p class="muted">大关 → 大类 → 子类 → 图片。大关视图也显示适用的通用素材；新导入的图片归当前大关。</p></div><button id="add-assets" class="primary">导入图片 / 图集</button></div><div class="asset-library-toolbar">${crumbs}<select id="asset-filter" aria-label="素材所属大关"><option value="all">全部大关</option><option value="common">通用素材</option>${p.courses.map((c) => `<option value="${esc(c.id)}">${esc(courseLabel(c))}</option>`).join('')}</select></div>${group && sub ? `<p class="asset-folder-hint">当前目录：${esc(groupName)} / ${esc(subName)} · 在这里导入将自动归入此类</p>` : ''}${content}`;
  $('asset-filter').value = courseId;
  $('asset-filter').onchange = (e) => {
    app.state.assetCourse = e.target.value;
    app.state.assetGroup = null;
    app.state.assetSub = null;
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
    f = C.classification(p, a),
    owner = p.courses.find((c) => c.id === a.courseId),
    scopes = [['common', '通用'], ...p.courses.map((c) => [c.id, courseLabel(c)])];
  if (!owner && a.courseId && a.courseId !== 'common')
    scopes.push([a.courseId, '原归属：' + a.courseId]);
  modal(
    '素材资料与分类',
    `<div class="form">${field('名称', 'asset-name', a.name)}${select('所属大关', 'asset-course', a.courseId, scopes)}<div class="row">${select(
      '大类',
      'asset-category',
      f.category,
      C.GROUPS.map((g) => [g.id, g.name]),
    )}${select(
      '子类',
      'asset-subcategory',
      f.subcategory,
      folders(p, f.category, owner, [a]).map((s) => [s.id, s.name]),
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
          app.state.assetCourse =
            values.courseId === 'common' || p.courses.some((c) => c.id === values.courseId)
              ? values.courseId
              : 'all';
          app.store.change(() => Object.assign(a, values));
        },
      },
    ],
  );
  const refresh = () => {
    const next = p.courses.find((c) => c.id === $('asset-course').value),
      current = $('asset-subcategory').value;
    $('asset-subcategory').innerHTML = folders(p, $('asset-category').value, next, [])
      .map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`)
      .join('');
    if ([...$('asset-subcategory').options].some((option) => option.value === current))
      $('asset-subcategory').value = current;
  };
  $('asset-category').onchange = $('asset-course').onchange = refresh;
}
module.exports = { render };
