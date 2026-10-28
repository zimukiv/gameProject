'use strict';
const Registry = require('../plugins/registry.cjs');
const { esc } = require('./dom.cjs');

function card(app, course, { tool, type, label, glyph, hint }) {
  const d = type && Registry.get(type);
  const slot = d?.slots.find((s) => course.artBindings?.[type]?.[s]);
  const asset = type
    ? course.artBindings?.[type]?.[slot]
    : tool === 'tile'
      ? course.artBindings?.['common.solid']?.idle
      : null;
  const url = app.assetURL(asset);
  const short =
    {
      'physics.jet': '喷气板',
      'physics.ice': '冰块',
      'physics.thermal': '温控板',
      'physics.rail': '电磁炮',
      'common.aiStart': 'AI 启动板',
      'common.aiStartHollow': 'AI 空心',
    }[type] || label;
  return `<button class="block-card" ${type ? `data-block-type="${esc(type)}"` : `data-tool="${tool}"`} aria-label="${esc(tool === 'tile' ? '▦ 地形' : label)}" title="${esc(hint || label)}" aria-pressed="false"><span class="block-icon">${url ? `<img src="${esc(url)}" alt="">` : esc(glyph)}</span><span>${esc(short)}</span></button>`;
}
function render(app, course) {
  const defs = Registry.list(course.kind);
  const groups = [
    ['地形', [{ tool: 'tile', label: '地形', glyph: '▦', hint: '拖动画地形，Shift 画矩形' }]],
    [
      '物理机关',
      defs
        .filter((d) => d.type.startsWith('physics.'))
        .flatMap((d) => [
          { type: d.type, label: d.name, glyph: d.glyph },
          ...(d.type === 'physics.thermal'
            ? [
                {
                  tool: 'zone',
                  label: '温控区域',
                  glyph: '℃',
                  hint: '拖画冷热区域，选中后四角缩放',
                },
              ]
            : []),
        ]),
    ],
    [
      '收集与危险',
      defs
        .filter((d) =>
          ['common.coin', 'common.small', 'common.collectible', 'common.spike'].includes(d.type),
        )
        .map((d) => ({ type: d.type, label: d.name, glyph: d.glyph })),
    ],
    [
      '流程与存档',
      defs
        .filter((d) => d.type === 'common.checkpoint')
        .map((d) => ({ type: d.type, label: d.name, glyph: d.glyph })),
    ],
    [
      '房间接口',
      [
        { tool: 'entry', label: '房间入口', glyph: '↪' },
        { tool: 'exit', label: '房间出口', glyph: '↗' },
      ],
    ],
    [
      'AI 与其他',
      defs
        .filter(
          (d) =>
            !d.type.startsWith('physics.') &&
            ![
              'common.coin',
              'common.small',
              'common.collectible',
              'common.spike',
              'common.checkpoint',
            ].includes(d.type),
        )
        .map((d) => ({ type: d.type, label: d.name, glyph: d.glyph })),
    ],
  ];
  return groups
    .filter(([, items]) => items.length)
    .map(
      ([name, items]) =>
        `<div class="palette-group"><span class="palette-group-name">${name}</span><div>${items.map((item) => card(app, course, item)).join('')}</div></div>`,
    )
    .join('');
}
module.exports = { render };
