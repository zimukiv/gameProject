'use strict';
// Accessible collapse menus for the global top bar. Kept in its own module so
// the header wiring in app.cjs stays small.
function install(doc = document) {
  const menus = [...doc.querySelectorAll('[data-menu]')];
  if (!menus.length) return;
  const triggerOf = (menu) => menu.querySelector('[data-menu-trigger]');
  const panelOf = (menu) => menu.querySelector('[data-menu-panel]');
  const close = (menu, focusTrigger = false) => {
    const trigger = triggerOf(menu),
      panel = panelOf(menu);
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    menu.classList.remove('open');
    if (focusTrigger) trigger.focus();
  };
  const open = (menu) => {
    for (const other of menus) if (other !== menu) close(other);
    const trigger = triggerOf(menu),
      panel = panelOf(menu);
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    menu.classList.add('open');
  };
  for (const menu of menus) {
    const trigger = triggerOf(menu),
      panel = panelOf(menu);
    if (!trigger || !panel) continue;
    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (panel.hidden) open(menu);
      else close(menu);
    });
    // Clicking an action executes it and collapses the menu. A dialog opened by
    // the action keeps working; disabled buttons simply close the menu.
    panel.addEventListener('click', (event) => {
      if (event.target.closest('button')) close(menu);
    });
    menu.addEventListener('keydown', (event) => {
      const items = [...panel.querySelectorAll('button')].filter((b) => !b.disabled);
      if (!items.length) return;
      if (event.key === 'Escape' && !panel.hidden) {
        event.preventDefault();
        event.stopPropagation();
        close(menu, true);
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (panel.hidden) open(menu);
        const index = items.indexOf(doc.activeElement);
        const next =
          event.key === 'ArrowDown'
            ? (index + 1) % items.length
            : index <= 0
              ? items.length - 1
              : index - 1;
        items[next]?.focus();
      }
    });
    menu.addEventListener('focusout', (event) => {
      if (!menu.contains(event.relatedTarget)) close(menu);
    });
  }
  doc.addEventListener('click', (event) => {
    for (const menu of menus) if (!menu.contains(event.target)) close(menu);
  });
  doc.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    for (const menu of menus) if (!panelOf(menu).hidden) close(menu, true);
  });
}
module.exports = { install };
