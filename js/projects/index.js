// Photo cards of the projects section: clicking a photo opens it large in the viewer dialog, where the arrows step
// through the photos shown in the same grid. The sector filter decides which stands are shown.
// (The 360° model viewer built earlier is parked in ./3d/ and not loaded.)

import { t } from '../i18n.js';

const dialog = document.getElementById('viewer');
const cards = [...document.querySelectorAll('.project[data-photo]')];
const filters = [...document.querySelectorAll('.projects-filter button[data-filter]')];
const pad2 = (n) => String(n).padStart(2, '0');
/** The cards currently shown in the same grid as `card`. */
const shown = (card) => cards.filter((other) => other.parentElement === card.parentElement && !other.hidden);

function initFilter() {
  const sectorCards = cards.filter((card) => card.dataset.sector);
  for (const button of filters) {
    button.addEventListener('click', () => {
      const sector = button.dataset.filter;
      filters.forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
      sectorCards.forEach((card) => { card.hidden = sector !== 'all' && card.dataset.sector !== sector; });
    });
  }
}

function initViewer() {
  if (!dialog || !cards.length || typeof dialog.showModal !== 'function') return;
  const photo = dialog.querySelector('#viewer-photo');
  const title = dialog.querySelector('#viewer-title');
  const count = dialog.querySelector('#viewer-count');
  let current = null;
  const reveal = () => photo.classList.remove('is-loading');
  photo.addEventListener('load', reveal);
  photo.addEventListener('error', reveal);

  function show(card) {
    const list = shown(card);
    current = card;
    const name = card.dataset.name || '';
    title.textContent = name;
    count.textContent = `${pad2(list.indexOf(card) + 1)} / ${pad2(list.length)}`;
    photo.alt = t(`${name} standı`, `${name} stand`);
    // An <img> keeps showing its previous picture until the new one has loaded, so it stays hidden until then.
    if (photo.getAttribute('src') !== card.dataset.photo) {
      photo.classList.add('is-loading');
      photo.src = card.dataset.photo;
    }
  }

  function step(by) {
    const list = shown(current);
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
