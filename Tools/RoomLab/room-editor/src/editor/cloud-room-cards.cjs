'use strict';
const { esc } = require('./dom.cjs');
const Draw = require('./draw.cjs');

// Metadata loads first. Only visible cards request verified project geometry;
// images and full asset files are still fetched only when opening room details.
function create({ graph, api, alive, choose }) {
  const previews = new Map(),
    queue = [];
  let active = 0,
    observer,
    scale = 1,
    rooms = [],
    selected = null;
  function paint(id) {
    if (!alive()) return;
    const card = graph.querySelector(`[data-library-room="${CSS.escape(id)}"]`),
      data = previews.get(id);
    if (!card || !data) return;
    const note = card.querySelector('.cloud-thumb-state');
    if (data.project) {
      const room = data.project.courses[0].rooms[0],
        canvas = card.querySelector('canvas');
      Draw.miniature(canvas.getContext('2d'), room, 0, 0, canvas.width, canvas.height);
      card.dataset.preview = 'ready';
      card.title = room.name + (room.notes ? ' · ' + room.notes : '');
      note.hidden = true;
    } else {
      card.dataset.preview = data.error ? 'error' : 'loading';
      note.textContent = data.error ? '点选查看详情' : '加载预览…';
    }
  }
  function pump() {
    while (alive() && active < 2 && queue.length) {
      const id = queue.shift();
      active++;
      api('roomLibraryPreview', { id })
        .then(
          (data) => previews.set(id, data),
          (e) => previews.set(id, { error: e.message }),
        )
        .finally(() => {
          active--;
          paint(id);
          pump();
        });
    }
  }
  function render(nextRooms = rooms, nextSelected = selected) {
    rooms = nextRooms;
    selected = nextSelected;
    observer?.disconnect();
    graph.style.setProperty('--cloud-card-width', Math.round(190 * scale) + 'px');
    graph.innerHTML = `<div class="cloud-room-preview-grid">${rooms.map((r) => `<button class="cloud-room-preview-card ${r.id === selected ? 'selected' : ''}" data-library-room="${esc(r.id)}" aria-pressed="${r.id === selected}" title="${esc(r.name)} · ${esc(new Date(r.uploadedAt).toLocaleString())}"><span class="cloud-room-thumb"><canvas width="400" height="240" aria-label="${esc(r.name)}内容预览"></canvas><span class="cloud-thumb-state">加载预览…</span></span><span class="cloud-room-name">${esc(r.name)}</span><small>${r.cols} × ${r.rows}</small></button>`).join('')}</div>`;
    observer = new IntersectionObserver(
      (entries) => {
        for (const item of entries)
          if (item.isIntersecting) {
            const id = item.target.dataset.libraryRoom;
            if (!previews.has(id)) {
              previews.set(id, { loading: true });
              queue.push(id);
            }
            observer.unobserve(item.target);
          }
        pump();
      },
      { root: graph, rootMargin: '160px' },
    );
    graph.querySelectorAll('[data-library-room]').forEach((card) => {
      card.onclick = () => choose(card.dataset.libraryRoom);
      paint(card.dataset.libraryRoom);
      observer.observe(card);
    });
  }
  graph.onwheel = (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    scale = Math.max(0.65, Math.min(2.5, scale * Math.exp(-e.deltaY * 0.0015)));
    render();
  };
  return {
    render,
    reset(nextRooms, nextSelected) {
      scale = 1;
      render(nextRooms, nextSelected);
    },
    remember(id, project) {
      previews.set(id, { project });
      paint(id);
    },
    dispose() {
      observer?.disconnect();
      queue.length = 0;
      graph.onwheel = null;
    },
  };
}
module.exports = { create };
