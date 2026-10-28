'use strict';
const { $, esc } = require('./dom.cjs');
function forest(items, card, idKey = 'id', parentKey = 'parentId') {
  const byId = new Map(items.map((t) => [t[idKey], t])),
    seen = new Set();
  const level = (parent) =>
    '<ul role="group">' +
    items
      .filter((t) => (byId.has(t[parentKey]) ? t[parentKey] : null) === parent)
      .map((t) => {
        if (seen.has(t[idKey])) return '';
        seen.add(t[idKey]);
        return `<li role="treeitem">${card(t)}${level(t[idKey])}</li>`;
      })
      .join('') +
    '</ul>';
  return level(null);
}
function render(s) {
  return `<section class="worktree-manager"><h3>工作树关系图</h3><p class="muted">拖动节点左侧 ⋮⋮ 到另一节点，调整本机关联；也可在「管理」中选择父节点。版本原始来源保留，手动保存仍从最后读取的云端版本分支。</p>
  <div id="worktree-confirm" role="alert" hidden></div>
  <div class="worktree-layout"><div class="worktree-scroll"><div id="worktree-root" tabindex="0">拖到此处移为根节点</div><div id="worktree-forest" role="tree" aria-label="工作树关联">${forest(
    s.trees,
    (
      t,
    ) => `<article class="cloud-tree ${t.id === s.current ? 'active' : ''}" data-tree-card="${esc(t.id)}" data-parent-id="${esc(t.parentId || '')}">
    <div class="tree-card-heading"><span data-tree-handle="${esc(t.id)}" draggable="false" tabindex="0" title="拖动调整关联，或点管理使用下拉选项">⋮⋮</span><strong>${esc(t.name)}</strong>${t.id === s.current ? '<b class="tree-badge">当前</b>' : ''}</div>
    <small>${esc(t.branch)} · ${t.unsaved ? '有未保存草稿' : t.pending ? '本机版本待上传' : t.head ? '已保存' : '草稿'}<br>版本来源：${esc((t.readRevision || t.base || '根').slice(0, 12))}</small>
    <div class="tree-courses">${(t.courses || []).map((c) => `<span>${esc(c.name)} · ${c.rooms} 房</span>`).join('')}</div>
    <small class="tree-file">${t.localFile ? `${t.localFile.exists ? '本地文件' : '⚠ 文件已缺失'}：${esc(t.localFile.path)}` : '尚未关联本地大关文件'}</small>
    ${t.duplicateFile || t.duplicateName ? `<small class="tree-warning">${t.duplicateFile ? '⚠ 多个工作树关联同一文件，保存时注意覆盖。' : ''}${t.duplicateName ? '⚠ 存在同名节点。' : ''}</small>` : ''}
    <div class="button-row"><button data-checkout="${esc(t.id)}" ${t.id === s.current ? 'disabled' : ''}>切换</button><button data-manage-tree="${esc(t.id)}">管理</button></div></article>`,
  )}</div></div>
    <aside id="worktree-inspector"><p>点击节点「管理」，查看文件关联、改名、移动和删除。</p></aside></div>
    <details id="worktree-trash"><summary>回收站（${(s.trash || []).length}）</summary><p>删除仅移除本机节点显示；快照、草稿及云端分支保留，子节点提升一级。恢复不会自动抢回已提升的子节点。</p>${(s.trash || []).map((t) => `<p>${esc(t.name)} <button data-recover-tree="${esc(t.id)}">恢复</button></p>`).join('')}</details></section>`;
}
function history(s) {
  return `<div class="cloud-history" role="tree" aria-label="不可变版本来源">${forest(s.history, (r) => `<article><strong>${esc(r.message)}</strong><small>${esc(new Date(r.createdAt).toLocaleString())} · ${esc(r.id.slice(0, 8))}<br>${r.parent ? '来源 ' + esc(r.parent.slice(0, 12)) : '根版本'}</small><button data-restore="${esc(r.id)}">读取到草稿</button></article>`, 'id', 'parent')}</div>`;
}
function bind(controller, run) {
  const s = controller.status;
  const action = (name, p) =>
    run(async () => {
      controller.status = await controller.api.cloud(name, p);
      controller.updateBadge();
    });
  const confirm = (text, fn) => {
    const box = $('worktree-confirm');
    box.hidden = false;
    box.innerHTML = `<p>${esc(text)}</p><button id="worktree-confirm-no">取消</button> <button id="worktree-confirm-yes" class="primary">确认</button>`;
    $('worktree-confirm-no').onclick = () => {
      box.hidden = true;
    };
    $('worktree-confirm-yes').onclick = run(fn);
    box.scrollIntoView({ block: 'nearest' });
  };
  const move = (id, parentId) => {
    const t = s.trees.find((t) => t.id === id),
      parent = s.trees.find((t) => t.id === parentId);
    if (!t) return;
    confirm(
      `将「${t.name}」移到${parent ? '「' + parent.name + '」下' : '根节点'}？只调整本机关联，保留版本原始来源。`,
      async () => {
        controller.status = await controller.api.cloud('moveTree', { id, parentId });
      },
    );
  };
  for (const h of document.querySelectorAll('[data-tree-handle]'))
    h.onpointerdown = (event) => {
      if (controller.dialogBusy || event.button !== 0) return;
      event.preventDefault();
      const start = { x: event.clientX, y: event.clientY };
      let target = null,
        moved = false;
      const clear = () => {
        target?.classList.remove('tree-drop');
      };
      const pointermove = (e) => {
        moved ||= Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6;
        if (!moved) return;
        clear();
        target = document
          .elementFromPoint(e.clientX, e.clientY)
          ?.closest('[data-tree-card], #worktree-root');
        target?.classList.add('tree-drop');
      };
      const done = (e) => {
        document.removeEventListener('pointermove', pointermove);
        document.removeEventListener('pointerup', done);
        document.removeEventListener('pointercancel', cancel);
        clear();
        if (moved && target && !controller.dialogBusy)
          move(h.dataset.treeHandle, target.dataset.treeCard || null);
      };
      const cancel = () => {
        target = null;
        done();
      };
      document.addEventListener('pointermove', pointermove);
      document.addEventListener('pointerup', done, { once: true });
      document.addEventListener('pointercancel', cancel, { once: true });
    };
  for (const b of document.querySelectorAll('[data-manage-tree]'))
    b.onclick = () => {
      const t = s.trees.find((t) => t.id === b.dataset.manageTree),
        panel = $('worktree-inspector');
      panel.innerHTML = `<h3>${esc(t.name)}</h3><label>名称<input id="tree-rename" maxlength="80" value="${esc(t.name)}"></label><button id="tree-rename-save">保存名称</button>
      <label>关联父节点<select id="tree-parent"><option value="">根节点</option>${s.trees
        .filter((x) => x.id !== t.id && x.projectId === t.projectId)
        .map(
          (x) =>
            `<option value="${esc(x.id)}" ${x.id === t.parentId ? 'selected' : ''}>${esc(x.name)}</option>`,
        )
        .join('')}</select></label><button id="tree-move">移动关联</button>
      <h4>本地文件关联</h4><p class="tree-file">${esc(t.localFile?.path || '尚未关联')}</p><p>包含大关：${esc((t.courses || []).map((c) => c.name).join('、'))}</p><p class="muted">关联仅记录文件位置，不读取替换草稿，也不自动写回文件。保存项目时需确认覆盖。路径只在本机保存。</p><button id="tree-link">选择关联 JSON</button>${t.localFile ? '<button id="tree-unlink">解除关联</button><button id="tree-reveal">打开所在文件夹</button>' : ''}
      <hr><button id="tree-delete" ${t.id === s.current ? 'disabled' : ''}>删除节点</button><p class="muted">当前节点须先切换到其他节点才能删除。可从回收站恢复。</p>`;
      const rename = (allow) =>
        controller.api.cloud('renameTree', {
          id: t.id,
          name: $('tree-rename').value.trim(),
          allowDuplicateName: allow,
        });
      $('tree-rename-save').onclick = () => {
        const name = $('tree-rename').value.trim();
        if (s.trees.some((x) => x.id !== t.id && x.name === name))
          confirm('名称重复，仍然使用相同名称？', () => rename(true));
        else run(() => rename(false))();
      };
      $('tree-move').onclick = () => move(t.id, $('tree-parent').value || null);
      $('tree-delete').onclick = () =>
        confirm(
          `删除「${t.name}」并放入本机回收站？其子节点提升一级；已有快照和云端分支保留。`,
          () => controller.api.cloud('deleteTree', { id: t.id }),
        );
      $('tree-link').onclick = run(() => controller.api.cloud('linkFile', { id: t.id }));
      if ($('tree-unlink'))
        $('tree-unlink').onclick = () =>
          confirm('解除文件关联？文件及关卡内容会保留。', () =>
            controller.api.cloud('unlinkFile', { id: t.id }),
          );
      if ($('tree-reveal'))
        $('tree-reveal').onclick = run(() => controller.api.cloud('revealFile', { id: t.id }));
    };
  for (const b of document.querySelectorAll('[data-recover-tree]'))
    b.onclick = action('recoverTree', { id: b.dataset.recoverTree });
  return { confirm };
}
module.exports = { render, bind, history };
