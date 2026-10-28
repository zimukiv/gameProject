'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  Palette = require('../src/editor/palette.cjs');
test('thermal zone tool is directly beside the thermal controller in the physics group', () => {
  const html = Palette.render({ assetURL: () => null }, { kind: 'physics' }),
    thermal = html.indexOf('data-block-type="physics.thermal"'),
    zone = html.indexOf('data-tool="zone"'),
    rail = html.indexOf('data-block-type="physics.rail"');
  assert.ok(thermal < zone && zone < rail);
});
