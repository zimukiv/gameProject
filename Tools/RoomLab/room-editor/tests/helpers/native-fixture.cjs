'use strict';
const M = require('../../src/project/model.cjs'),
  N = require('../../src/project/native-compat.cjs');
function fixture() {
  const p = M.themedExample();
  p.nativeCampaign = {
    id: 'deadline-rework-v2',
    network: true,
    guided: true,
    unknown: { preserve: 17 },
  };
  p.courses.forEach(N.initCourse);
  const c = p.courses.find((c) => c.kind === 'calculus'),
    r = c.rooms[0];
  c.nativeCampaign.signals = ['beta'];
  r.nativeCampaign.switches = ['alpha'];
  r.nativeCampaign.platforms = [
    {
      id: 'native-platform',
      x: 3,
      y: 3,
      w: 2,
      h: 1,
      toX: 6,
      toY: 5,
      seconds: 1,
      switch: 'alpha',
      signal: 'beta',
    },
  ];
  r.nativeCampaign.patrols = [
    {
      id: 'native-patrol',
      speed: 95,
      nodes: [
        { x: 1.5, y: 2.55 },
        { x: 5.5, y: 2.55 },
      ],
    },
  ];
  r.nativeCampaign.signs = [{ x: 2, y: 2, text: 'α' }];
  r.objects[0].rework = { signal: 'beta', switch: 'alpha', value: true, unrecognized: { x: 8 } };
  return { p, c, r };
}

module.exports = { fixture };
