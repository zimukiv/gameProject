'use strict';
const { overlap } = require('../shared/utils.cjs');
// Preserve the existing spike hit shape for old non-solid spikes.
function spikeContact(player, spike, rect) {
  const contact = { x: player.x - 0.2, y: player.y - 0.2, w: player.w + 0.4, h: player.h + 0.4 };
  return (
    (spike.collision === true && overlap(contact, rect)) ||
    overlap(player, { ...rect, y: rect.y + 22, h: 10 })
  );
}
module.exports = { spikeContact };
