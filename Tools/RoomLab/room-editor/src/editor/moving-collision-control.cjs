'use strict';
const { check } = require('./dom.cjs');
function install(app, room, ref, item, host) {
  if (!item || !['movables', 'platforms'].includes(ref?.kind)) return;
  host.insertAdjacentHTML(
    'afterbegin',
    check('移动时具有碰撞体积', 'brick-moving-collision', item.movingCollision !== false) +
      '<p class="hint">取消后仅移动期间可穿过，停下恢复原碰撞设置。附着方块各自判定。</p>',
  );
  host.querySelector('#brick-moving-collision').onchange = (event) => {
    const value = event.target.checked;
    app.store.change(() => {
      const members =
        ref.kind === 'movables'
          ? require('../project/brick-motion.cjs').groupMembers(room, item)
          : [item];
      for (const member of members) member.movingCollision = value;
    });
  };
}
module.exports = { install };
