'use strict';
// One geometry source for drawing, hit testing, fit-to-all and port projection.
const CELL_SIZE = 10.5,
  PADDING = 8,
  TITLE_HEIGHT = 32;
function card(room) {
  const thumb = {
    x: PADDING,
    y: TITLE_HEIGHT,
    width: room.cols * CELL_SIZE,
    height: room.rows * CELL_SIZE,
  };
  return {
    width: thumb.width + PADDING * 2,
    height: thumb.y + thumb.height + 7 + 48 + PADDING,
    titleHeight: TITLE_HEIGHT,
    thumb,
    notesY: thumb.y + thumb.height + 7,
  };
}
module.exports = { CELL_SIZE, PADDING, TITLE_HEIGHT, card };
