'use strict';
const { $, esc } = require('./dom.cjs'),
  { key } = require('../project/room-import-batch.cjs');
function render(node, project, picks, current, error) {
  const total = project?.courses.reduce((n, c) => n + c.rooms.length, 0) ?? node.summary?.roomCount;
  return `<h4 class="cloud-project-name">${esc(project?.name || node.summary?.projectName || '正在读取项目名称…')}</h4>${project ? `<p>${esc(project.notes || '')}</p><p>${project.courses.length} 个大关 · ${total} 个房间</p><div class="button-row"><button id="cloud-rooms-all">全选</button><button id="cloud-rooms-invert">反选</button><span id="cloud-room-count">已选 ${picks.size}</span></div><div class="cloud-room-list">${project.courses.map((c) => `<details open><summary>${esc(c.name)} · ${c.rooms.length} 房</summary>${c.rooms.map((r) => `<label class="cloud-room-choice"><input type="checkbox" data-cloud-room="${esc(key(c.id, r.id))}" ${picks.has(key(c.id, r.id)) ? 'checked' : ''}><span><b>${esc(r.name)}</b><small>${r.cols} × ${r.rows} 格 · ${r.objects.length} 个机关 / 道具 · ${r.entries.length} 入 / ${r.exits.length} 出</small><em>${esc(r.notes || '无备注')}</em></span></label>`).join('')}</details>`).join('')}</div>` : `<p>${esc(error || '正在读取房间详情，仅下载项目说明，不下载素材。')}</p>${error ? '<button id="cloud-project-retry">重试读取房间信息</button>' : ''}`}<div class="cloud-room-actions"><button id="cloud-node-import" class="primary" ${project && picks.size ? '' : 'disabled'}>导入所选房间</button><button id="cloud-node-checkout">切换到完整版本</button><button id="cloud-node-upload">上传当前草稿到此节点下方</button></div>${node.id === current ? '<p class="cloud-current-label">● 当前读取版本</p>' : ''}<details class="cloud-version-meta"><summary>保存说明与版本信息</summary><p>${esc(node.message || '无保存说明')}</p><p>${esc(node.createdAt ? new Date(node.createdAt).toLocaleString() : '')}</p><code class="cloud-node-id">${esc(node.id)}</code><p>图中父节点：${esc(node.parent?.slice(0, 12) || '根')}<br>原始来源：${esc(node.sourceParent?.slice(0, 12) || '根')}<br>设备：${esc(node.device || '—')}</p></details>`;
}
function bind(project, picks, onChange) {
  const choices = project.courses.flatMap((c) => c.rooms.map((r) => key(c.id, r.id))),
    update = () => {
      $('cloud-room-count').textContent = '已选 ' + picks.size;
      $('cloud-node-import').disabled = !picks.size;
      onChange();
    };
  for (const input of $('cloud-node-detail').querySelectorAll('[data-cloud-room]'))
    input.onchange = () => {
      input.checked ? picks.add(input.dataset.cloudRoom) : picks.delete(input.dataset.cloudRoom);
      update();
    };
  function set(invert) {
    for (const k of choices) invert && picks.has(k) ? picks.delete(k) : picks.add(k);
    for (const el of $('cloud-node-detail').querySelectorAll('[data-cloud-room]'))
      el.checked = picks.has(el.dataset.cloudRoom);
    update();
  }
  $('cloud-rooms-all').onclick = () => set(false);
  $('cloud-rooms-invert').onclick = () => set(true);
}
module.exports = { render, bind };
