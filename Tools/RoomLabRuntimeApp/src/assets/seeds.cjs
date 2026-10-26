'use strict';
const { strToU8 } = require('fflate');
function seeds() {
  const svg = (bg, inside) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect x="1" y="1" width="62" height="62" rx="5" fill="${bg}" stroke="#9dbacb" stroke-width="2"/>${inside}</svg>`;
  const items = [
    [
      'metal',
      '金属地形',
      svg(
        '#243f53',
        '<path d="M8 8h48v48H8zM8 22h48M8 42h48" fill="none" stroke="#426b84"/><circle cx="12" cy="12" r="2" fill="#9ddfdc"/><circle cx="52" cy="52" r="2" fill="#9ddfdc"/>',
      ),
    ],
    [
      'ice-solid',
      '冰块 · 完整',
      svg(
        '#528ec2',
        '<path d="M10 8L54 56M8 34L34 8M30 56L56 30" stroke="#bce6ff" stroke-width="3"/><path d="M5 58L58 5" stroke="#e2f5ff" opacity=".5"/>',
      ),
    ],
    [
      'ice-cracked',
      '冰块 · 裂纹',
      svg(
        '#49779f',
        '<path d="M32 1l-7 20 15 9-15 12 8 21M25 21L5 28M40 30l20-12M25 42L9 60" fill="none" stroke="#d8f0ff" stroke-width="3"/>',
      ),
    ],
    [
      'jet-idle',
      '喷气 · 待机',
      svg(
        '#234e58',
        '<path d="M20 49h24V27H20zM24 27V16h16v11" fill="#6dcac9" stroke="#bcf5ef"/><path d="M28 12l4-6 4 6" fill="none" stroke="#b8edea"/>',
      ),
    ],
    [
      'jet-active',
      '喷气 · 喷发',
      svg(
        '#1f5360',
        '<path d="M20 54h24V33H20z" fill="#64c6cc"/><path d="M24 31L20 8l12 11L42 5l-2 27" fill="#b5fbff"/>',
      ),
    ],
    [
      'thermal-cold',
      '温控 · 冷',
      svg(
        '#265380',
        '<path d="M32 8v48M11 20l42 24M11 44l42-24" stroke="#9fe0fb" stroke-width="4"/>',
      ),
    ],
    [
      'thermal-hot',
      '温控 · 热',
      svg(
        '#814b2b',
        '<path d="M33 6c7 15-3 18 8 23 10-12 13 4 10 15-5 20-34 19-37 1-1-12 16-23 19-39z" fill="#ffc071"/>',
      ),
    ],
    [
      'rail-idle',
      '电磁炮 · 待机',
      svg(
        '#4c456b',
        '<path d="M18 15v24a14 14 0 0028 0V15" fill="none" stroke="#c0b4ed" stroke-width="10"/><path d="M18 8v14M46 8v14" stroke="#84e6e2" stroke-width="10"/>',
      ),
    ],
    [
      'rail-active',
      '电磁炮 · 加速',
      svg(
        '#615382',
        '<path d="M18 15v24a14 14 0 0028 0V15" fill="none" stroke="#cec0fa" stroke-width="10"/><path d="M33 9L25 31h10l-8 25 17-31H33z" fill="#7cfff0"/>',
      ),
    ],
  ];
  const files = new Map(),
    assets = items.map(([id, name, data]) => {
      const path = 'assets/seed-' + id + '.svg';
      files.set(path, strToU8(data));
      return {
        id: 'seed-' + id,
        name,
        path,
        mime: 'image/svg+xml',
        width: 64,
        height: 64,
        courseId: 'physics',
        category: id === 'metal' ? 'terrain' : 'mechanism',
        subcategory: id === 'metal' ? 'common.solid' : 'physics.' + id.split('-')[0],
        frameWidth: 0,
        frameHeight: 0,
        fps: 6,
        hash: 'seed-' + id,
      };
    });
  return {
    assets,
    files,
    bindings: {
      'common.solid': { idle: 'seed-metal' },
      'physics.ice': { solid: 'seed-ice-solid', cracked: 'seed-ice-cracked' },
      'physics.jet': { idle: 'seed-jet-idle', active: 'seed-jet-active' },
      'physics.thermal': { cold: 'seed-thermal-cold', hot: 'seed-thermal-hot' },
      'physics.rail': { idle: 'seed-rail-idle', active: 'seed-rail-active' },
    },
  };
}
module.exports = { seeds };
