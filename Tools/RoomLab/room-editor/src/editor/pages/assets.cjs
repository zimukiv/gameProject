'use strict';
const A = require('../../assets/manager.cjs'),
  C = require('../../assets/catalog.cjs'),
  Spec = require('../../assets/spec.cjs'),
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
// Advisory spec line for the asset library. Legacy names/sizes are shown as a
// hint and remain fully usable; nothing here rewrites or rebinds an asset.
function specLine(a) {
  const info = Spec.check(a);
  if (!info) return '';
  const notes = [...info.issues, ...(info.warnings || [])].join('；');
  return `<p class="asset-spec ${esc(info.status)}" title="${esc(notes || info.note || '')}">${esc(info.label)}${info.canonical ? ' · 命名 ' + esc(info.canonical) : ''}</p>`;
}
function render(app) {
  const p = app.store.project,
    // The asset page always browses the whole project. asset.courseId is still
    // read for compatibility/import ownership, but never hides an asset and is
    // never rewritten here.
    courseId = 'all',
    active = app.course(),
    group = app.state.assetGroup || null,
    sub = app.state.assetSub || null;
  const scoped = p.assets;
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
    content = `<div class="asset-grid">${items
      .map(
        (a) =>
          `<article class="card asset-card"><img src="${esc(app.assetURL(a.id) || '')}" alt="${esc(a.name)}" loading="lazy"><h3>${esc(a.name)}</h3><p>${a.width} × ${a.height} · ${A.usage(p, a.id).length} 处引用</p>${specLine(a)}<p>${esc(p.courses.find((c) => c.id === a.courseId)?.name || '通用素材')}</p><div class="actions"><button data-meta="${esc(a.id)}">资料 / 归类</button><button data-replace="${esc(a.id)}">替换</button><button data-remove="${esc(a.id)}" class="danger">移除</button></div></article>`,
      )
      .join(
        '',
      )}</div>${!items.length ? '<div class="asset-empty"><h2>这个分类还没有素材</h2><p>点击「导入图片 / 图集」，新素材会直接放到当前分类。</p></div>' : ''}`;
  }
  $('app').innerHTML =
    `<div class="page-title"><div><h1>项目素材库</h1><p class="muted">按归属 → 大类 → 子类 → 图片浏览；新导入素材归当前归属，旧存档归属继续兼容。</p><p class="asset-spec-note">规范：32 PPU · 地块 32×32 · Pad 32×8 · 签到块视觉 32×32 / 碰撞 32×8 · Token 10 / 18 · 背景 512×512 · 中景 1920×360。旧素材只提示，仍可绑定使用。</p></div><button id="add-assets" class="primary">导入图片 / 图集</button></div><div class="asset-library-toolbar">${crumbs}<span class="muted">全部素材</span></div>${group && sub ? `<p class="asset-folder-hint">当前目录：${esc(groupName)} / ${esc(subName)} · 导入自动归入此类</p>` : ''}${content}`;
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
    info = Spec.check(a),
    specNotes = info ? [...info.issues, ...(info.warnings || [])].join('；') : '',
    scopes = [['common', '通用'], ...p.courses.map((c) => [c.id, courseLabel(c)])];
  if (!owner && a.courseId && a.courseId !== 'common')
    scopes.push([a.courseId, '原归属：' + a.courseId]);
  modal(
    '素材资料与分类',
    `<div class="form">${field('名称', 'asset-name', a.name)}${select('素材归属（旧存档兼容）', 'asset-course', a.courseId, scopes)}<div class="row">${select(
      '大类',
      'asset-category',
      f.category,
      C.GROUPS.map((g) => [g.id, g.name]),
    )}${select(
      '子类',
      'asset-subcategory',
      f.subcategory,
      folders(p, f.category, owner, [a]).map((s) => [s.id, s.name]),
    )}</div>${info ? `<div class="asset-spec-box ${esc(info.status)}"><strong>素材规范：${esc(info.label)}</strong>${info.canonical ? `<p>规范命名：${esc(info.canonical)}</p>` : ''}${info.note ? `<p>${esc(info.note)}</p>` : ''}${info.animation ? `<p>${esc(info.animation.frames + ' 帧 / ' + info.animation.fps + ' FPS' + (info.animation.holdLast ? ' · 末帧保持' : ''))}</p>` : ''}${specNotes ? `<p class="warn-text">${esc(specNotes)}（旧素材可继续使用）</p>` : ''}</div>` : ''}<div class="row">${field('图集单帧宽（0 为整图）', 'frame-w', a.frameWidth, { type: 'number', min: 0 })}${field('图集单帧高', 'frame-h', a.frameHeight, { type: 'number', min: 0 })}</div>${field('动画 FPS', 'frame-fps', a.fps, { type: 'number', min: 1, max: 60 })}<p class="hint">使用位置：${esc(A.usage(p, a.id).join('；') || '未使用')}。分类决定应用候选，已有绑定与素材 ID 保留。</p></div>`,
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
