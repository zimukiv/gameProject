'use strict';
const base = {
  version: '1.0.0',
  category: '道具',
  courses: ['*'],
  slots: ['idle'],
  schema: [],
  defaults: {},
  collider: false,
  defaultCollision: false,
  trigger: 'region',
  collectible: true,
  item: true,
};
module.exports = [
  { ...base, type: 'item.coffee', name: '咖啡', glyph: '☕' },
  { ...base, type: 'item.calculator', name: '计算器', glyph: '=' },
  { ...base, type: 'item.phone', name: '手机', glyph: '▯' },
  { ...base, type: 'item.icedTea', name: '冰红茶', glyph: '🥤' },
];
