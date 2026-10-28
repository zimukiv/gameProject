'use strict';
function install(host, selector, prefix, before) {
  const row = document.createElement('div');
  row.className = 'button-row';
  const all = document.createElement('button'),
    invert = document.createElement('button');
  all.id = prefix + '-all';
  invert.id = prefix + '-invert';
  all.textContent = '全选';
  invert.textContent = '反选';
  row.append(all, invert);
  before.before(row);
  all.onclick = () => host.querySelectorAll(selector).forEach((el) => (el.checked = true));
  invert.onclick = () =>
    host.querySelectorAll(selector).forEach((el) => (el.checked = !el.checked));
}
module.exports = { install };
