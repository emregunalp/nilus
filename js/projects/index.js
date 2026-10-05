// Projects section: clicking a stand photo opens it large in the viewer dialog; arrows step through the stands.
// (The 360° model viewer built earlier is parked in ./3d/ and not loaded.)

import { t } from '../i18n.js';

const dialog = document.getElementById('viewer');
const cards = [...document.querySelectorAll('.project[data-photo]')];
const pad2 = (n) => String(n).padStart(2, '0');

function init() {
  if (!dialog || !cards.length || typeof dialog.showModal !== 'function') return;
  const photo = dialog.querySelector('#viewer-photo');
  const title = dialog.querySelector('#viewer-title');
  const count = dialog.querySelector('#viewer-count');
  let current = 0;

  function show(index) {
    current = (index + cards.length) % cards.length;
    const card = cards[current];
    const name = card.dataset.name || '';
    title.textContent = name;
    count.textContent = `${pad2(current + 1)} / ${pad2(cards.length)}`;
    photo.alt = t(`${name} standı`, `${name} stand`);
    photo.src = card.dataset.photo;
  }

  cards.forEach((card, i) => card.addEventListener('click', () => {
    show(i);
    dialog.showModal();
  }));
  dialog.querySelectorAll('.viewer-nav').forEach((button) => {
    button.addEventListener('click', () => show(current + Number(button.dataset.step)));
  });
  dialog.querySelector('.viewer-close')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') show(current + 1);
    else if (e.key === 'ArrowLeft') show(current - 1);
  });
  dialog.addEventListener('close', () => cards[current]?.focus());
}

init();
