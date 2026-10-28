'use strict';
const Traces = require('../project/play-traces.cjs');
function install(host, selector, attribute, course, recorder, drafts = new Map()) {
  for (const check of host.querySelectorAll(selector)) {
    const life = Number(check.getAttribute(selector.slice(1, -1))),
      input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 80;
    input.placeholder = '路径名称（留空用编号）';
    input.setAttribute(attribute, String(life));
    input.setAttribute('aria-label', '第 ' + life + ' 条命路径名称');
    input.value = drafts.get(life) ?? Traces.lifeName(course, recorder, life);
    input.oninput = () => drafts.set(life, input.value);
    check.closest('label').append(input);
  }
}
function read(host, attribute) {
  return Object.fromEntries(
    [...host.querySelectorAll('[' + attribute + ']')].map((el) => [
      el.getAttribute(attribute),
      el.value,
    ]),
  );
}
module.exports = { install, read };
