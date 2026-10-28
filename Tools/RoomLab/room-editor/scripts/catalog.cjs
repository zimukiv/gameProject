'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  Registry = require('../src/plugins/registry.cjs');
function generate() {
  const lines = [
    '# 功能块参数目录',
    '',
    '> 由 `pnpm docs` 从注册表生成，请修改模块源码后重新生成。',
    '',
  ];
  for (const d of Registry.all()) {
    lines.push(
      '## ' + d.name + ' · ' + d.type,
      '',
      '版本：' +
        d.version +
        '；大关：' +
        d.courses.join(' / ') +
        '；触发：' +
        d.trigger +
        '；素材状态：' +
        d.slots.join(' / '),
      '',
      '| 参数 | 说明 | 类型 | 默认值 | 范围/选项 |',
      '| --- | --- | --- | --- | --- |',
    );
    for (const f of d.schema)
      lines.push(
        '| ' +
          f.key +
          ' | ' +
          f.label +
          ' | ' +
          f.kind +
          ' | `' +
          JSON.stringify(d.defaults[f.key]) +
          '` | ' +
          (f.values?.join(' / ') ?? (f.min !== undefined ? f.min + '–' + f.max : '')) +
          ' |',
      );
    lines.push('');
  }
  fs.writeFileSync(path.resolve(__dirname, '../docs/BLOCK_CATALOG.md'), lines.join('\n'));
}
if (require.main === module) generate();
module.exports = { generate };
