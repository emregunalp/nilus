// Page UI: nav state, mobile menu, reveal-on-scroll, process rail, in-page links, lifecycle ring, client logo strip.
// Every piece tolerates missing DOM — a lost element must never take the page down.

import { cardFadeOpacity } from './scroll.js';
import { STAGE_NAMES } from './i18n.js';

const STAGE_COUNT = STAGE_NAMES.length;
const RAIL_SHOW_FROM = -0.15;
const RAIL_HIDE_AFTER = 8.5;
const NAV_SCROLLED_Y = 8;
const RAIL_JUMP_OFFSET = 0.4;
const REVEAL_MARGIN = '0px 0px -8% 0px';
const REVEAL_STAGGER_S = 0.08;
const MOBILE_QUERY = '(max-width: 820px)';

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

/* ---------- mobile: a released step card fades before it scrolls over the stand ---------- */
function initMobileCardFade({ progress }) {
  const steps = $$('#process .step');
  if (!steps.length) return;
  const mq = matchMedia(MOBILE_QUERY);
  // Opacity sits on .step, not on the card: the card's own opacity belongs to the reveal animation.
  const render = (p) => {
    steps.forEach((step, i) => {
      const o = mq.matches ? cardFadeOpacity(p, i) : 1;
      step.style.opacity = o < 1 ? o.toFixed(3) : '';
    });
  };
  render(progress.get());
  progress.onChange(render);
  mq.addEventListener?.('change', () => render(progress.get()));
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

/* ---------- client logos: two rows become a slow, endless strip ---------- */
function initBrands({ isShot, reducedMotion }) {
  const rows = $$('.brands-row');
  if (!rows.length || isShot || reducedMotion) return; // the CSS default (a centred grid) stays
  for (const row of rows) {
    // The keyframe moves the row by half its width, so a second, hidden copy makes the loop seamless.
    for (const item of [...row.children]) {
      const copy = item.cloneNode(true);
      copy.setAttribute('aria-hidden', 'true');
      copy.querySelectorAll('img').forEach((img) => { img.alt = ''; });
      row.append(copy);
    }
  }
  $('.brands-rows')?.classList.add('is-marquee');
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
  safely('card-fade', () => initMobileCardFade({ progress }));
  safely('anchors', () => initAnchors({ progress, reducedMotion }));
  safely('lifecycle', initLifecycle);
  safely('brands', () => initBrands({ isShot, reducedMotion }));
}

export const _internals = { railState, STAGE_NAMES };
