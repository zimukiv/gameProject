'use strict';
const { esc } = require('./dom.cjs');
const tools = { tile: 'B', select: 'Z', erase: 'X', marquee: 'M' };
const common = [
  [
    `${tools.tile} / ${tools.select} / ${tools.erase} / ${tools.marquee}`,
    '地形 / 选择 / 擦除 / 框选',
  ],
  ['Shift＋左键 / Shift＋右键', '选择或框选时，点选或拖框追加 / 反选'],
  ['拖动 / Shift＋拖动', '涂地形 / 画矩形地形'],
  ['滚轮 / 中键拖动', '缩放 / 平移画布'],
  ['左键选择后拖动', '移动对象或已选组。同格连续点选可切换对象'],
  ['Delete / Esc', '删除所选 / 清空选择'],
  ['Ctrl＋Z / Ctrl＋Y', '撤销 / 重做'],
  ['A/D / 空格 / Shift / R / Esc', '试玩移动 / 跳跃 / 冲刺 / 重试 / 暂停'],
];
const themes = {
  physics: [
    ['选中电磁炮＋右键', '在画布点击添加一个轨道节点。按 Alt 可精细定位'],
    ['左键拖动轨道节点', '调整节点位置。Alt 可精细移动'],
    ['拖画温控区域', '从方块栏选温控区域后拖画，选中后拖四角调整尺寸'],
  ],
  calculus: [
    ['选中机关砖＋右键', '添加一个路径节点。成组时编辑代表砖的路线'],
    [
      '选中积分或求导板＋右键',
      '点击绑定机关砖，按住右键拖框批量绑定。同一批砖全已绑定时，再操作即解绑',
    ],
    ['多选机关砖', '属性栏可编组并绑定。金色「代表」标记指向可编辑路线的砖'],
  ],
  slacker: [
    ['方块栏＋左键', '选择签到板或清醒板，再点击画布放置。左键拖动可连续放置'],
    ['选择板块后点「行为」', '设置签到或清醒效果的参数'],
  ],
};
function help(kind, native = false) {
  const extra =
    native && kind === 'calculus'
      ? [
          [
            '选中机关砖＋右键',
            '设置节点 I（开启位置）；再次右键调整该点。当前关卡为 0 / I 两态运动',
          ],
          [
            '选中积分或求导板＋右键',
            '点选或拖框绑定机关砖，重复操作解绑；同一开关的两种板共同控制',
          ],
          ['拖动节点 / 机关砖', '调整终点 / 整体平移起终点；属性中设置运动时间'],
        ]
      : themes[kind] || [];
  return `<table class="table">${[...extra, ...common]
    .map(([key, action]) => `<tr><td>${esc(key)}</td><td>${esc(action)}</td></tr>`)
    .join('')}</table>`;
}
module.exports = { tools, help };
