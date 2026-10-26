'use strict';
const MIN_COLS = 6,
  MIN_ROWS = 5,
  MAX_COLS = 256,
  MAX_ROWS = 256;
const valid = (cols, rows) =>
  Number.isInteger(cols) &&
  Number.isInteger(rows) &&
  cols >= MIN_COLS &&
  cols <= MAX_COLS &&
  rows >= MIN_ROWS &&
  rows <= MAX_ROWS;
module.exports = {
  MIN_COLS,
  MIN_ROWS,
  MAX_COLS,
  MAX_ROWS,
  valid,
  description: '尺寸需 6–256 列、5–256 行',
};
