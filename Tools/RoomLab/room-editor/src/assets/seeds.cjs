'use strict';
const { strToU8 } = require('fflate');
const Spec = require('./spec.cjs');
let builtIns;
function restoreBuiltIns(assets, files) {
  builtIns ||= seeds({ allThemes: true });
  for (const asset of assets) {
    if (files.has(asset.path)) continue;
    const original = builtIns.assets.find((item) => item.id === asset.id);
    if (original && asset.path === original.path && asset.hash === original.hash)
      files.set(asset.path, builtIns.files.get(asset.path).slice());
  }
  return files;
}
function seeds({ allThemes = false } = {}) {
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
    [
      'calculus-integral',
      '积分 · 聚合',
      svg(
        '#3c3a63',
        '<path d="M22 8h20v48H22" fill="none" stroke="#c9b6ff" stroke-width="5"/><path d="M42 32H14" stroke="#8ff0e6" stroke-width="4"/><path d="M20 24l-8 8 8 8M36 24l8 8-8 8" fill="none" stroke="#8ff0e6" stroke-width="4"/>',
      ),
    ],
    [
      'calculus-derivative',
      '求导 · 展开',
      svg(
        '#3a4663',
        '<path d="M18 10h28M18 54h28" stroke="#b7c8ff" stroke-width="5"/><path d="M32 48V16" stroke="#8ff0e6" stroke-width="5"/><path d="M18 24l14-12 14 12" fill="none" stroke="#8ff0e6" stroke-width="4"/>',
      ),
    ],
    [
      'slacker-checkin',
      '签到 · 记录',
      svg(
        '#2c5346',
        '<path d="M10 14h44v36H10z" fill="none" stroke="#9fe8bf" stroke-width="4"/><path d="M20 32l9 9 17-18" fill="none" stroke="#9fe8bf" stroke-width="6"/>',
      ),
    ],
    [
      'slacker-awake',
      '清醒 · 加速',
      svg(
        '#4c5238',
        '<path d="M24 14h22v26a11 11 0 01-22 0z" fill="none" stroke="#ffe08a" stroke-width="4"/><path d="M24 22h-6M46 22h6M34 10l4-6 4 6" stroke="#ffe08a" stroke-width="4" fill="none"/><path d="M34 30v12M28 36h12" stroke="#ffb571" stroke-width="4"/>',
      ),
    ],
    [
      'slacker-teacher',
      '巡查 · 老师',
      svg(
        '#4a3b2a',
        '<circle cx="32" cy="19" r="10" fill="#e9c39b" stroke="#fff0cf" stroke-width="3"/><path d="M20 15c2-7 22-9 25 2-8 2-18 2-25-2z" fill="#37475a"/><path d="M18 56V34c0-7 7-11 14-11s14 4 14 11v22z" fill="#6d8e73" stroke="#d5ead5" stroke-width="3"/><path d="M24 31h16M26 31v15M38 31v15" stroke="#f3f7e7" stroke-width="2"/><rect x="23" y="16" width="7" height="5" rx="1" fill="none" stroke="#223041"/><rect x="34" y="16" width="7" height="5" rx="1" fill="none" stroke="#223041"/><path d="M30 18h4M23 18h-3M41 18h3" stroke="#223041"/>',
      ),
    ],
    [
      'submit-assignment',
      '提交作业',
      svg(
        '#3d365f',
        '<path d="M13 9h38v46H13z" fill="#dce8f5" stroke="#b8c9ff" stroke-width="3"/><path d="M20 20h24M20 28h24M20 36h15" stroke="#506b8c" stroke-width="4"/><circle cx="45" cy="46" r="11" fill="#5ac7a0" stroke="#b8ffe3" stroke-width="3"/><path d="M39 46l4 4 8-9" fill="none" stroke="#173d32" stroke-width="4"/>',
      ),
    ],
    [
      'spike',
      '尖刺 · 占位',
      svg(
        '#263b50',
        '<path d="M5 55L11 21l5 12 6-22 6 22 5-12 6 34z" fill="#9ebdb5" stroke="#172238" stroke-width="1"/>',
      ),
    ],
    [
      'token-small',
      '小 token · 占位',
      svg(
        '#d49a40',
        '<path d="M10 10h44v44H10z" fill="#f6ebc8" stroke="#172238" stroke-width="2"/>',
      ),
    ],
    [
      'token-big',
      '大 token · 占位',
      svg(
        '#3a9a9a',
        '<circle cx="32" cy="32" r="24" fill="#b8f2f0" stroke="#172238" stroke-width="2"/><path d="M32 15l5 12 13 1-10 9 3 13-11-7-11 7 3-13-10-9 13-1z" fill="#74d9d9"/>',
      ),
    ],
    [
      'aistart',
      'AI 启动板 · 占位',
      svg(
        '#466b73',
        '<rect x="8" y="8" width="48" height="48" fill="#74d9d9" stroke="#172238" stroke-width="2"/><path d="M22 23l18 9-18 9z" fill="#172238"/>',
      ),
    ],
    [
      'aistart-hollow',
      'AI 启动板 · 空心占位',
      svg(
        'none',
        '<rect x="8" y="8" width="48" height="48" fill="none" stroke="#74d9d9" stroke-width="2" stroke-dasharray="5 4"/><path d="M22 23l18 9-18 9z" fill="none" stroke="#74d9d9" stroke-width="2"/>',
      ),
    ],
    [
      'checkpoint-idle',
      '存档点 · 待机',
      svg(
        '#46505f',
        '<path d="M18 54V12h28v42" fill="#9ebdb5" stroke="#172238" stroke-width="1"/><path d="M24 22h16M24 30h12" stroke="#466b73" stroke-width="3"/>',
      ),
    ],
    [
      'checkpoint-active',
      '存档点 · 激活',
      svg(
        '#46505f',
        '<path d="M18 54V12h28v42" fill="#d49a40" stroke="#172238" stroke-width="1"/><path d="M24 22h16M24 30h12" stroke="#f6ebc8" stroke-width="3"/>',
      ),
    ],
    [
      'portal-in',
      '传送入口 · 占位',
      svg(
        '#263b50',
        '<ellipse cx="32" cy="34" rx="18" ry="24" fill="#74d9d9" stroke="#172238" stroke-width="2"/><path d="M22 20l20 14-20 14z" fill="#172238"/>',
      ),
    ],
    [
      'portal-out',
      '传送出口 · 占位',
      svg(
        '#263b50',
        '<ellipse cx="32" cy="34" rx="18" ry="24" fill="#183a44" stroke="#74d9d9" stroke-width="2"/><path d="M42 20L22 34l20 14z" fill="#b8f2f0"/>',
      ),
    ],
    [
      'bg-far',
      '远景坐标格 · 占位（512×512）',
      svg(
        '#9ebdb5',
        '<path d="M0 16h64M0 32h64M0 48h64M16 0v64M32 0v64M48 0v64" stroke="#8aa9a5" stroke-width="1"/><path d="M8 8h4v4H8zM40 24h4v4h-4zM20 44h4v4h-4z" fill="#c9b78a"/>',
      ),
    ],
    [
      'bg-mid',
      '中景曲线 · 占位（1920×360）',
      svg(
        'none',
        '<path d="M0 32h40v-16h40v32h40v-16h40v24h40v-24h40v16h40v-32h40v48h40v-16h40v16h40v-24h40v32h40v-16h40v16h40" fill="none" stroke="#172238" stroke-width="2"/><path d="M0 50h40v-8h40v16h40v-8h40v12h40v-12h40v8h40v-16h40v24h40v-8h40v8h40v-12h40v16h40v-8h40v8h40" fill="none" stroke="#466b73" stroke-width="1"/>',
      ),
    ],
    [
      'coffee',
      '咖啡',
      svg(
        '#4a3529',
        '<path d="M14 20h29v22a11 11 0 01-11 11H25a11 11 0 01-11-11z" fill="#d9a269" stroke="#ffe0ae" stroke-width="3"/><path d="M43 24h5a8 8 0 010 16h-5M20 12c4-4 0-7 4-10M30 12c4-4 0-7 4-10M40 12c4-4 0-7 4-10" fill="none" stroke="#f6e8cf" stroke-width="3"/>',
      ),
    ],
    [
      'calculator',
      '计算器',
      svg(
        '#34485e',
        '<rect x="13" y="7" width="38" height="50" rx="4" fill="#dbe8f0" stroke="#9fd8ea" stroke-width="3"/><rect x="19" y="13" width="26" height="10" fill="#213546"/><g fill="#3d5c73"><rect x="18" y="29" width="7" height="6"/><rect x="29" y="29" width="7" height="6"/><rect x="40" y="29" width="7" height="6"/><rect x="18" y="40" width="7" height="6"/><rect x="29" y="40" width="7" height="6"/><rect x="40" y="40" width="7" height="6"/><rect x="18" y="49" width="18" height="5"/><rect x="40" y="49" width="7" height="5"/></g>',
      ),
    ],
    [
      'phone',
      '手机',
      svg(
        '#2c3b56',
        '<rect x="18" y="5" width="28" height="54" rx="6" fill="#dce9f5" stroke="#9ebcf2" stroke-width="3"/><rect x="22" y="12" width="20" height="36" fill="#365475"/><circle cx="32" cy="53" r="3" fill="#6c86a3"/><path d="M26 6h12" stroke="#7891ad" stroke-width="2"/>',
      ),
    ],
    [
      'iced-tea',
      '冰红茶',
      svg(
        '#4b3025',
        '<path d="M17 17h30l-4 39H21z" fill="#c96f42" stroke="#ffd0a6" stroke-width="3"/><path d="M34 6L43 17M32 15L37 6" stroke="#8ee5f2" stroke-width="4"/><path d="M21 34h22" stroke="#f2a466" stroke-width="3"/><g fill="#d9f7ff" opacity=".9"><rect x="25" y="23" width="8" height="8" transform="rotate(12 29 27)"/><rect x="36" y="31" width="7" height="7" transform="rotate(-15 39 34)"/></g>',
      ),
    ],
  ];
  const itemIds = new Set(['coffee', 'calculator', 'phone', 'iced-tea']),
    commonIds = new Set([
      'metal',
      'submit-assignment',
      'spike',
      'token-small',
      'token-big',
      'common-spike',
      'aistart',
      'aistart-hollow',
      'checkpoint-idle',
      'checkpoint-active',
      'portal-in',
      'portal-out',
      'bg-far',
      'bg-mid',
    ]),
    // Seed ids stay stable (old saves reference them), but their canvases and
    // metadata follow the Demo artwork specification so built-in previews match
    // the calibrated art targets.
    typeById = {
      metal: 'common.solid',
      'submit-assignment': 'common.assignmentSubmit',
      'slacker-teacher': 'slacker.teacher',
      spike: 'common.spike',
      'common-spike': 'common.spike',
      'token-small': 'common.small',
      'token-big': 'common.coin',
      aistart: 'common.aiStart',
      'aistart-hollow': 'common.aiStartHollow',
      'checkpoint-idle': 'common.checkpoint',
      'checkpoint-active': 'common.checkpoint',
      'portal-in': 'common.portalIn',
      'portal-out': 'common.portalOut',
      'bg-far': 'background',
      'bg-mid': 'backgroundMid',
    };
  const files = new Map(),
    assets = items
      .filter(([id]) => allThemes || !/^(calculus|slacker)-/.test(id))
      .map(([id, name, data]) => {
        const path = 'assets/seed-' + id + '.svg';
        const isItem = itemIds.has(id),
          isCommon = commonIds.has(id),
          theme = isCommon
            ? 'common'
            : id.startsWith('calculus-')
              ? 'calculus'
              : id.startsWith('slacker-')
                ? 'slacker'
                : 'physics',
          head = id.split('-')[0],
          tail = id.slice(id.indexOf('-') + 1),
          type =
            typeById[id] ||
            (isItem
              ? 'item.' + (id === 'iced-tea' ? 'icedTea' : id)
              : theme + '.' + (theme === 'physics' ? head : tail)),
          spec = Spec.forType(type),
          width = spec?.canvas.width || 64,
          height = spec?.canvas.height || 64;
        const calibrated =
          width === 64 && height === 64
            ? data
            : data.replace(
                '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"',
                `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"`,
              );
        files.set(path, strToU8(calibrated));
        return {
          id: 'seed-' + id,
          name,
          path,
          mime: 'image/svg+xml',
          width,
          height,
          courseId: isCommon ? 'common' : theme,
          category: Spec.categoryForType(type),
          subcategory: type,
          frameWidth: 0,
          frameHeight: 0,
          fps: 6,
          hash: 'seed-' + id,
        };
      });
  const bindings = {
    'common.solid': { idle: 'seed-metal' },
    'physics.ice': { solid: 'seed-ice-solid', cracked: 'seed-ice-cracked' },
    'physics.jet': { idle: 'seed-jet-idle', active: 'seed-jet-active' },
    'physics.thermal': { cold: 'seed-thermal-cold', hot: 'seed-thermal-hot' },
    'physics.rail': { idle: 'seed-rail-idle', active: 'seed-rail-active' },
  };
  const deviceBindings = {
    'common.assignmentSubmit': { idle: 'seed-submit-assignment', active: 'seed-submit-assignment' },
  };
  const itemBindings = {
    'item.coffee': { idle: 'seed-coffee' },
    'item.calculator': { idle: 'seed-calculator' },
    'item.phone': { idle: 'seed-phone' },
    'item.icedTea': { idle: 'seed-iced-tea' },
  };
  const themeBindings = {
    physics: bindings,
    calculus: {
      'common.solid': { idle: 'seed-metal' },
      'calculus.integral': { idle: 'seed-calculus-integral', active: 'seed-calculus-integral' },
      'calculus.derivative': {
        idle: 'seed-calculus-derivative',
        active: 'seed-calculus-derivative',
      },
    },
    slacker: {
      'common.solid': { idle: 'seed-metal' },
      'slacker.checkin': { idle: 'seed-slacker-checkin', active: 'seed-slacker-checkin' },
      'slacker.awake': { idle: 'seed-slacker-awake', active: 'seed-slacker-awake' },
      'slacker.teacher': { idle: 'seed-slacker-teacher', active: 'seed-slacker-teacher' },
    },
  };
  return {
    assets,
    files,
    bindings,
    themeBindings,
    allBindings: {
      ...themeBindings.physics,
      ...themeBindings.calculus,
      ...themeBindings.slacker,
      ...itemBindings,
      ...deviceBindings,
    },
  };
}
module.exports = { seeds, restoreBuiltIns };
