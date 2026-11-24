'use strict';
const Registry = require('../plugins/registry.cjs');
const { esc, $, modal } = require('./dom.cjs');
const descriptions = {
  'physics.jet': '踩踏后按设定方向与力度弹射，可设置冷却和 AI 施力范围。',
  'physics.ice': '冷态形成实体；受热融化，也会累计站立时间融化，冷态下延迟再生成。',
  'physics.thermal': '踩踏切换绑定温控区的冷热；未指定区域时控制环境温度。',
  'physics.rail': '沿节点轨道加速，按终点角度抛出；可设置跳跃、冲刺脱离。右键添加节点。',
  'calculus.integral':
    '控制绑定机关砖聚合。选中后右键点选或框选绑定，再次选择取消；运动路线和每段时间在机关砖节点图设置。',
  'calculus.derivative':
    '控制绑定机关砖展开。选中后右键点选或框选绑定，再次选择取消；运动路线和每段时间在机关砖节点图设置。',
  'slacker.checkin': '踩踏记录签到；可绑定巡查老师，完成全部指定签到后消除老师。',
  'slacker.awake':
    '持有咖啡时按进入速度的 45° 八向加速通过（右方为 -22.5° 至 +22.5°），持续数帧后回落；每次触发后冷却 3 秒，碰撞开关独立于触发。零速站立不会触发，也不会凭空产生方向。未持有咖啡时保持实体阻挡，站上去会提示“需要咖啡”。',
  'slacker.teacher':
    '在属性“节点图”规划二维路线：0 节点在老师自身，右键或“画布加点”逐格添加，可拖动节点并设置每段用时/运动/循环往返；没有路线时沿用旧平台边界巡查。首次碰到扣除一半 token，再次碰到死亡。',
  'item.coffee': '拾取后可穿过清醒板并获得短暂加速。',
  'item.calculator': '拾取后可触发积分、求导板。',
  'item.phone': '拾取后可使用签到板。',
  'item.icedTea': '拾取后启用付费冲刺蓄力。',
  'common.coin': '可拾取的大 token。',
  'common.small': '可拾取的小 token。',
  'common.collectible': '可拾取的收藏品。',
  'common.spike': '触碰造成死亡，危险判定与实体碰撞开关独立。',
  'common.checkpoint': '接触后更新死亡回退位置。',
  'common.aiStart':
    '踩踏启动配置的 AI；可在属性里指定本房间的 AI 出现点，未指定或出现点被删除时仍在玩家旁出现。死亡重试后可再次启动。',
  'common.aiSpawn':
    '非实体标记，不参与碰撞。放置后可被同房间的 AI 启动板选为出现位置，启动后 AI 在该点生成；删除标记会自动清除启动板绑定。',
  'common.assignmentSubmit': 'AI 激活时踩踏提交作业，停止追逐并给予一次奖励。',
  'common.portalIn': 'AI 传送入口，与相同传送路径 ID 的出口配对；玩家换房使用房间端口。',
  'common.portalOut': 'AI 传送出口，与相同传送路径 ID 的入口配对。',
};
function entries(kind) {
  return [
    {
      type: 'tile',
      name: '地形',
      glyph: '▦',
      description: '拖动画地形，Shift 画矩形；作为实体地面或墙壁。',
    },
    {
      type: 'movable',
      name: '机关砖',
      glyph: '▣',
      description:
        '选中后右键添加运动节点；每段可调整时间、运动方式和移动碰撞。组合方块随中心元运动并共享碰撞设置。',
    },
    {
      type: 'zone',
      name: '温控区域',
      glyph: '℃',
      description: '拖画冷热区域，可缩放；区域内冰块随温度变化，由温控板单向控制。',
    },
    {
      type: 'entry',
      name: '房间入口',
      glyph: '↪',
      description: '玩家进入房间的位置，在路线图连接房间出口。',
    },
    {
      type: 'exit',
      name: '房间出口',
      glyph: '↗',
      description: '玩家离开房间的端口，在路线图设置目标入口。',
    },
    ...Registry.list(kind).map((d) => ({
      ...d,
      description: descriptions[d.type] || '兼容导入方块；可在属性栏查看可用参数。',
    })),
  ];
}
function valueText(value, schema) {
  if (schema.kind === 'path') return `${Array.isArray(value) ? value.length : 0} 个节点`;
  if (typeof value === 'boolean') return value ? '开启' : '关闭';
  return schema.labels?.[value] || String(value ?? '未设置');
}
function open(app) {
  const items = entries(app.course().kind);
  modal(
    '方块说明',
    `<div class="block-guide"><input id="block-guide-search" aria-label="搜索方块" placeholder="搜索方块名称或用途"><p class="muted">碰撞开关控制实体阻挡，触发条件单独判断。</p><div id="block-guide-list"></div></div>`,
    [{ label: '关闭' }],
  );
  const render = () => {
    const query = $('block-guide-search').value.trim().toLowerCase();
    const filtered = items.filter((d) =>
      `${d.name} ${d.type} ${d.description} ${d.requiresItem ? Registry.get(d.requiresItem).name : ''}`
        .toLowerCase()
        .includes(query),
    );
    $('block-guide-list').innerHTML =
      filtered
        .map((d) => {
          const trigger = { foot: '踩踏触发', region: '接触范围触发' }[d.trigger];
          const prerequisite = d.requiresItem ? `需要：${Registry.get(d.requiresItem).name}` : '';
          return `<details class="block-guide-card"><summary><span>${esc(d.glyph)} ${esc(d.name)}</span><small>${esc([trigger, prerequisite].filter(Boolean).join(' · '))}</small></summary><p>${esc(d.description)}</p>${d.schema?.length ? `<dl>${d.schema.map((s) => `<dt>${esc(s.label)}（出厂默认）</dt><dd>${esc(valueText(d.defaults?.[s.key], s))}</dd>`).join('')}</dl>` : ''}</details>`;
        })
        .join('') || '<p class="muted">未找到方块</p>';
  };
  $('block-guide-search').oninput = render;
  render();
}
module.exports = { entries, open };
