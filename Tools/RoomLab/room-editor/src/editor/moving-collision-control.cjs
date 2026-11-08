'use strict';
const { check } = require('./dom.cjs');
function install(app, room, ref, item, host) {
  if (!item || !['movables', 'platforms'].includes(ref?.kind)) return;
  item = require('../project/collision.cjs').owner(room, item, ref.kind).item;
  host.insertAdjacentHTML(
    'afterbegin',
    check('移动碰撞总开关', 'brick-moving-collision', item.movingCollision !== false) +
      '<p class="hint">开启时按各段勾选生效；关闭时所有移动段可穿过。组合成员共享代表元设置；触发与伤害独立。解散后恢复各自设置。</p>',
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
  if (ref.kind === 'platforms') {
    host.insertAdjacentHTML(
      'afterbegin',
      check('碰撞实体（组合共享代表元）', 'native-shared-collision', item.collision !== false),
    );
    const input = host.querySelector('#native-shared-collision');
    input.dataset.liveField = '1';
    input.onchange = (e) => {
      const value = e.target.checked;
      app.store.change(() => {
        item.collision = value;
      });
    };
  }
}
module.exports = { install };
