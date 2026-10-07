// Projects section: the sector filter shows the matching stand photos; clicking a photo opens it large in the
// viewer dialog, where the arrows step through the stands currently shown.
// (The 360° model viewer built earlier is parked in ./3d/ and not loaded.)

import { t } from '../i18n.js';

const dialog = document.getElementById('viewer');
const cards = [...document.querySelectorAll('.project[data-photo]')];
const filters = [...document.querySelectorAll('.projects-filter button[data-filter]')];
const pad2 = (n) => String(n).padStart(2, '0');
const shown = () => cards.filter((card) => !card.hidden);

function initFilter() {
  for (const button of filters) {
    button.addEventListener('click', () => {
      const sector = button.dataset.filter;
      filters.forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
      cards.forEach((card) => { card.hidden = sector !== 'all' && card.dataset.sector !== sector; });
    });
  }
}

function initViewer() {
  if (!dialog || !cards.length || typeof dialog.showModal !== 'function') return;
  const photo = dialog.querySelector('#viewer-photo');
  const title = dialog.querySelector('#viewer-title');
  const count = dialog.querySelector('#viewer-count');
  let current = null;

  function show(card) {
    const list = shown();
    current = card;
    const name = card.dataset.name || '';
    title.textContent = name;
    count.textContent = `${pad2(list.indexOf(card) + 1)} / ${pad2(list.length)}`;
    photo.alt = t(`${name} standı`, `${name} stand`);
    photo.src = card.dataset.photo;
  }

  function step(by) {
    const list = shown();
    show(list[(list.indexOf(current) + by + list.length) % list.length]);
  }

  cards.forEach((card) => card.addEventListener('click', () => {
    show(card);
    dialog.showModal();
  }));
  dialog.querySelectorAll('.viewer-nav').forEach((button) => {
    button.addEventListener('click', () => step(Number(button.dataset.step)));
  });
  dialog.querySelector('.viewer-close')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'ArrowLeft') step(-1);
  });
  dialog.addEventListener('close', () => current?.focus());
}

initFilter();
initViewer();
