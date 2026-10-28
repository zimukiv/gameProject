'use strict';
const Order = require('../project/room-order.cjs');
function bind(app, course, host) {
  let drag = null,
    raf;
  const buttons = [...host.querySelectorAll('[data-nav-room]')],
    clear = () => {
      cancelAnimationFrame(raf);
      buttons.forEach((b) =>
        b.classList.remove('room-tab-dragging', 'room-tab-before', 'room-tab-after'),
      );
      drag = null;
    };
  function target() {
    buttons.forEach((b) => b.classList.remove('room-tab-before', 'room-tab-after'));
    const bounds = host.getBoundingClientRect();
    if (drag.y < bounds.top - 25 || drag.y > bounds.bottom + 25) {
      drag.target = null;
      return;
    }
    const others = buttons.filter((b) => b.dataset.navRoom !== drag.id);
    let chosen = others.at(-1),
      after = true;
    for (const button of others) {
      const box = button.getBoundingClientRect();
      if (drag.x < box.x + box.width / 2) {
        chosen = button;
        after = false;
        break;
      }
    }
    if (chosen) {
      drag.target = chosen.dataset.navRoom;
      drag.after = after;
      chosen.classList.add(after ? 'room-tab-after' : 'room-tab-before');
    }
  }
  function scroll() {
    if (!host.isConnected) {
      clear();
      return;
    }
    if (!drag?.active) return;
    const b = host.getBoundingClientRect();
    if (drag.x < b.left + 30) host.scrollLeft -= 10;
    else if (drag.x > b.right - 30) host.scrollLeft += 10;
    target();
    raf = requestAnimationFrame(scroll);
  }
  for (const button of buttons) {
    button.title = (button.title ? button.title + ' · ' : '') + '按住拖动调整顺序；最左为首房';
    button.style.touchAction = 'pan-y';
    button.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || buttons.length < 2) return;
      drag = {
        id: button.dataset.navRoom,
        x: e.clientX,
        y: e.clientY,
        start: e.clientX,
        pointer: e.pointerId,
        button,
        active: false,
      };
    });
    const navigate = button.onclick;
    button.onclick = (e) => {
      if (performance.now() < (app.state.roomTabClickAfter || 0)) {
        e.preventDefault();
        return;
      }
      navigate?.(e);
    };
  }
  host.addEventListener('pointermove', (e) => {
    if (!drag) return;
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (!drag.active && Math.abs(e.clientX - drag.start) > 7) {
      drag.active = true;
      host.setPointerCapture(e.pointerId);
      drag.button.classList.add('room-tab-dragging');
      raf = requestAnimationFrame(scroll);
    }
    if (drag.active) {
      e.preventDefault();
      target();
    }
  });
  host.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const action = { ...drag };
    if (action.active) {
      e.preventDefault();
      app.state.roomTabClickAfter = performance.now() + 250;
    }
    clear();
    if (host.hasPointerCapture(e.pointerId)) host.releasePointerCapture(e.pointerId);
    if (action.active && action.target)
      app.store.change(() => Order.move(course, action.id, action.target, action.after));
  });
  host.addEventListener('pointercancel', clear);
  host.addEventListener('lostpointercapture', clear);
}
module.exports = { bind };
