// Page UI: nav state, mobile menu, reveal-on-scroll, process rail, in-page links, lifecycle ring.
// Every piece tolerates missing DOM — a lost element must never take the page down.

import { STAGE_NAMES } from './i18n.js';

const STAGE_COUNT = STAGE_NAMES.length;
const RAIL_SHOW_FROM = -0.15;
const RAIL_HIDE_AFTER = 8.5;
const NAV_SCROLLED_Y = 8;
// A rail button lands in the middle of its stage's scroll span; the stand then plays the stage to its end by itself.
const RAIL_JUMP_OFFSET = 0.5;
// The first card comes up as the hero leaves; a card passed in a fast scroll or a jump never gets to flash up.
const CARD_FROM = -0.02;
const CARD_SWAP_MS = 130;
const REVEAL_MARGIN = '0px 0px -8% 0px';
const REVEAL_STAGGER_S = 0.08;

const root = document.documentElement;
const $ = (sel, scope = document) => scope.querySelector(sel);
const $$ = (sel, scope = document) => [...scope.querySelectorAll(sel)];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const pad2 = (n) => String(n).padStart(2, '0');

function safely(name, fn) {
  try { return fn(); } catch (err) { console.error(`[nilus] ui:${name} failed`, err); return undefined; }
}

/* ---------- nav ---------- */
function initNav({ progress, isShot }) {
  const update = () => {
    const scrolled = isShot ? progress.get() > -0.999 : window.scrollY > NAV_SCROLLED_Y;
    root.classList.toggle('nav-scrolled', scrolled);
  };
  update();
  if (!isShot) window.addEventListener('scroll', update, { passive: true });
  progress.onChange(update);
}

function initMenu() {
  const toggle = $('.nav-toggle');
  const menu = $('#nav-menu');
  if (!toggle || !menu) return;
  const setOpen = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    root.classList.toggle('menu-open', open);
  };
  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && root.classList.contains('menu-open')) { setOpen(false); toggle.focus(); }
  });
  matchMedia('(min-width: 821px)').addEventListener?.('change', (e) => { if (e.matches) setOpen(false); });
}

/* ---------- reveals ---------- */
function staggerSiblings(items) {
  const groups = new Map();
  for (const el of items) {
    const key = el.parentElement;
    const index = groups.get(key) || 0;
    el.style.setProperty('--reveal-delay', `${Math.min(index, 5) * REVEAL_STAGGER_S}s`);
    groups.set(key, index + 1);
  }
}

function initReveals({ isShot, reducedMotion }) {
  const items = $$('[data-reveal]');
  const showAll = () => items.forEach((el) => el.classList.add('is-in'));
  if (isShot || reducedMotion || typeof IntersectionObserver !== 'function') { showAll(); return; }
  staggerSiblings(items);
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-in');
      io.unobserve(entry.target);
    }
  }, { rootMargin: REVEAL_MARGIN, threshold: 0.08 });
  items.forEach((el) => io.observe(el));
}

/* ---------- process rail ---------- */
function railState(p) {
  const visible = p >= RAIL_SHOW_FROM && p <= RAIL_HIDE_AFTER;
  const active = clamp(Math.floor(p), 0, STAGE_COUNT - 1);
  const fill = clamp((p + 0.001) / STAGE_COUNT, 0, 1);
  return { visible, active, fill };
}

function initRail({ progress }) {
  const rail = $('.rail');
  if (!rail) return;
  const buttons = $$('.rail-list button', rail);
  const num = $('.rail-num', rail);
  const name = $('.rail-name', rail);
  let lastActive = -1;

  const render = (p) => {
    const { visible, active, fill } = railState(p);
    root.classList.toggle('rail-on', visible);
    rail.style.setProperty('--rail-progress', fill.toFixed(4));
    if (active === lastActive) return;
    lastActive = active;
    buttons.forEach((btn, i) => {
      btn.classList.toggle('is-past', i < active);
      if (i === active) btn.setAttribute('aria-current', 'step');
      else btn.removeAttribute('aria-current');
    });
    if (num) num.textContent = pad2(active + 1);
    if (name) name.textContent = STAGE_NAMES[active];
  };

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.i);
      if (Number.isFinite(i)) progress.scrollToProgress(i + RAIL_JUMP_OFFSET);
    });
  });
  render(progress.get());
  progress.onChange(render);
}

/* ---------- process cards: one at a time, fixed in place ---------- */
// The scroll only chooses the stage. Its card stays put in the text column for the whole stage and is swapped for
// the next one at the boundary, so a card is never caught half-way on or off the screen (client, 2026-10-09).
function initStepCards({ progress, isShot }) {
  const steps = $$('#process .step');
  if (!steps.length) return;
  let wanted = null;
  let timer = 0;
  const show = (index) => steps.forEach((step, i) => step.classList.toggle('is-active', i === index));
  const render = (p) => {
    const index = p >= CARD_FROM && p < STAGE_COUNT ? clamp(Math.floor(p), 0, STAGE_COUNT - 1) : -1;
    if (index === wanted) return;
    wanted = index;
    clearTimeout(timer);
    if (isShot) { show(index); return; }
    show(-1); // the old card leaves at once; the new one follows when the scroll has stayed on its stage
    if (index >= 0) timer = setTimeout(() => show(wanted), CARD_SWAP_MS);
  };
  render(progress.get());
  progress.onChange(render);
}

/* ---------- in-page links ---------- */
function initAnchors({ progress, reducedMotion }) {
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (!link || e.defaultPrevented || e.metaKey || e.ctrlKey) return;
    const id = link.getAttribute('href').slice(1);
    const target = id ? document.getElementById(id) : null;
    if (!target) return;
    e.preventDefault();
    const p = Number(link.dataset.progress);
    if (link.dataset.progress !== undefined && Number.isFinite(p)) progress.scrollToProgress(p);
    else target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    if (id !== 'hero') history.replaceState(null, '', `#${id}`);
  });
}

/* ---------- lifecycle ring ---------- */
function initLifecycle() {
  const svg = $('.lifecycle-svg');
  const nodes = svg ? $$('.lc-node', svg) : [];
  const items = $$('.lifecycle-list li');
  if (!nodes.length && !items.length) return;

  const setActive = (index) => {
    const on = Number.isInteger(index);
    nodes.forEach((n, i) => {
      n.classList.toggle('is-active', on && i === index);
      n.classList.toggle('is-past', on && i < index);
    });
    items.forEach((li, i) => li.classList.toggle('is-active', on && i === index));
    // The arc grows to the hovered stage; at rest the loop is complete.
    if (svg) svg.style.setProperty('--lc-arc', on ? String(((index + 0.001) / STAGE_COUNT) * 100) : '100');
  };

  const bind = (el) => {
    const i = Number(el.dataset.i);
    if (!Number.isInteger(i)) return;
    el.addEventListener('pointerenter', () => setActive(i));
    el.addEventListener('focus', () => setActive(i));
    el.addEventListener('pointerleave', () => setActive(null));
    el.addEventListener('blur', () => setActive(null));
  };
  nodes.forEach(bind);
  items.forEach(bind);
}

export function initUI({ progress, isShot = false, reducedMotion = false } = {}) {
  root.classList.add('js-ui');
  if (!progress || typeof progress.get !== 'function') {
    console.error('[nilus] ui: progress missing — only static UI enabled');
    safely('reveals', () => initReveals({ isShot: true, reducedMotion }));
    return;
  }
  safely('nav', () => initNav({ progress, isShot }));
  safely('menu', initMenu);
  safely('reveals', () => initReveals({ isShot, reducedMotion }));
  safely('rail', () => initRail({ progress }));
  safely('step-cards', () => initStepCards({ progress, isShot }));
  safely('anchors', () => initAnchors({ progress, reducedMotion }));
  safely('lifecycle', initLifecycle);
}

export const _internals = { railState, STAGE_NAMES };
