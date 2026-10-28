'use strict';
const defaults = {
  speed: 220,
  gravity: 1500,
  jump: 560,
  maxFall: 900,
  dashSpeed: 850,
  dashDeceleration: 2100,
  dashTime: 0.22,
  coyote: 0.1,
  buffer: 0.12,
};
function resolve(settings) {
  const result = { ...defaults };
  for (const key of Object.keys(defaults))
    if (settings?.performance?.[key] !== undefined) {
      const n = settings.performance[key];
      if (typeof n !== 'number' || !Number.isFinite(n))
        throw Error('运动参数 ' + key + ' 需要有效数字');
      result[key] = n;
    }
  return result;
}
module.exports = { defaults, resolve };
