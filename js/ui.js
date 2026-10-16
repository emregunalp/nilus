// Page UI: nav state, mobile menu, reveal-on-scroll, process rail, in-page links, lifecycle ring.
// Every piece tolerates missing DOM — a lost element must never take the page down.

import { STAGE_NAMES } from './i18n.js?v=43';

const STAGE_COUNT = STAGE_NAMES.length;
const RAIL_SHOW_FROM = -0.15;
const RAIL_HIDE_AFTER = 8.5;
const NAV_SCROLLED_Y = 8;
// A rail button lands in the middle of its stage's scroll span; the stand then plays the stage to its end by itself.
const RAIL_JUMP_OFFSET = 0.5;
// The first card comes up as the hero leaves; a card passed in a fast scroll or a jump never gets to slide in.
const CARD_FROM = -0.02;
const CARD_SWAP_MS = 130;
// Between these the process moves stage by stage: touch screens snap (hero-process.css: html.snap-steps), a mouse wheel
// is counted (initWheelPaging). Outside it the page scrolls freely.
const SNAP_FROM = -0.6;
const SNAP_UNTIL = 7.95;
// A mouse wheel inside the process: three notches, one stage (client, 2026-10-16). A touchpad counts by distance.
const WHEEL_NOTCH_PX = 100;
const WHEEL_STAGE_NOTCHES = 3;
const WHEEL_FORGET_MS = 1200; // notches further apart than this start the count again
const WHEEL_SETTLE_MS = 260; // after a move the page glides; wheel input meanwhile does not count
const REVEAL_MARGIN = '0px 0px -8% 0px';
const REVEAL_STAGGER_S = 0.08;

const root = document.documentElement;
const $ = (sel, scope = document) => scope.querySelector(sel);
const $$ = (sel, scope = document) => [...scope.querySelectorAll(sel)];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
// Tells the 3D film that a stage was chosen with a button, so it plays that stage from its start (scene-b/play.js).
const announceStage = (p) => {
  const index = Math.floor(p);
  if (index >= 0 && index < STAGE_COUNT) window.dispatchEvent(new CustomEvent('nilus:stage', { detail: { index } }));
};
// A jump made with a button (rail, "Sonraki aşama", a mouse wheel's three notches): the film is told which stage was
// chosen, and the page glides there with the stage-by-stage snapping switched off — with it on, a phone stopped the
// glide at the first stage on the way and the film ended on that stage instead (client, 2026-10-16).
const SNAP_HOLD_MS = 2500;
let snapHeldUntil = 0;
function travel(progress, p) {
  snapHeldUntil = performance.now() + SNAP_HOLD_MS;
  root.classList.remove('snap-steps');
  announceStage(p);
  progress.scrollToProgress(p);
}
const pad2 = (n) => String(n).padStart(2, '0');

function safely(name, fn) {
  try { return fn(); } catch (err) { console.error(`[nilus] ui:${name} failed`, err); return undefined; }
}

/* ---------- nav ---------- */
function initNav({ progress, isShot }) {
  const update = () => {
    const scrolled = isShot && progress ? progress.get() > -0.999 : window.scrollY > NAV_SCROLLED_Y;
    root.classList.toggle('nav-scrolled', scrolled);
  };
  update();
  if (!isShot) window.addEventListener('scroll', update, { passive: true });
  progress?.onChange(update);
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
      if (!Number.isFinite(i)) return;
      travel(progress, i + RAIL_JUMP_OFFSET);
    });
  });
  render(progress.get());
  progress.onChange(render);
}

/* ---------- process cards: one at a time, fixed in place ---------- */
// The scroll only chooses the stage. Its card stays in the text column for the whole stage and changes at the
// boundary, so a card is never caught half-way on or off the screen. The change looks like scrolling: the old card
// leaves upwards and the next one comes up from below — the other way round when going back (client, 2026-10-09).
function initStepCards({ progress, isShot }) {
  const steps = $$('#process .step');
  if (!steps.length) return;
  const touch = matchMedia('(pointer: coarse)').matches; // one swipe, one stage; a mouse wheel: initWheelPaging
  let wanted = null;
  let timer = 0;
  const activate = (index) => steps.forEach((step, i) => {
    const on = i === index;
    step.classList.toggle('is-active', on);
    if (on) step.classList.remove('is-before');
    // The hidden cards' "next stage" links stay out of the tab order.
    const next = step.querySelector('.step-next');
    if (next) next.tabIndex = on ? 0 : -1;
  });
  const render = (p) => {
    const index = p >= CARD_FROM && p < STAGE_COUNT ? clamp(Math.floor(p), 0, STAGE_COUNT - 1) : -1;
    root.classList.toggle('snap-steps', !isShot && touch && p > SNAP_FROM && p < SNAP_UNTIL && performance.now() > snapHeldUntil);
    if (index === wanted) return;
    wanted = index;
    clearTimeout(timer);
    // Cards of earlier stages wait above the column, later ones below it (is-before). The card about to come in keeps
    // the side it is on, so it enters from there.
    const past = p >= STAGE_COUNT;
    steps.forEach((step, i) => { if (i !== index) step.classList.toggle('is-before', index < 0 ? past : i < index); });
    if (isShot) { activate(index); return; }
    activate(-1); // the old card leaves at once; the new one follows when the scroll has stayed on its stage
    if (index >= 0) timer = setTimeout(() => activate(wanted), CARD_SWAP_MS);
  };
  render(progress.get());
  progress.onChange(render);
}

/* ---------- process: a mouse wheel moves one stage per three notches ---------- */
// Touch screens snap stage by stage (one swipe, one stage). With a mouse a free wheel ran past stages, so inside the
// process the wheel is counted instead and the page is moved to the next stage's middle. Between the hero and the
// first stage, and from the last stage on to the outro, one notch is enough: those are the way in and out.
function initWheelPaging({ progress, reducedMotion }) {
  let acc = 0;
  let lastAt = 0;
  let movedAt = -1e9;
  const exit = () => $('.process-outro')?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  window.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.defaultPrevented) return; // pinch-zoom on a touchpad arrives as a ctrl+wheel
    const p = progress.get();
    if (!(p > SNAP_FROM && p < SNAP_UNTIL)) { acc = 0; return; }
    e.preventDefault();
    const now = performance.now();
    const px = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? window.innerHeight : 1);
    // A touchpad keeps sending small deltas while its gesture coasts: they belong to the move just made.
    if (now - movedAt < WHEEL_SETTLE_MS) { if (Math.abs(px) < 40) movedAt = now; lastAt = now; return; }
    if (now - lastAt > WHEEL_FORGET_MS || Math.sign(px) !== Math.sign(acc)) acc = 0;
    lastAt = now;
    acc += px;
    const dir = Math.sign(acc);
    const stage = Math.floor(p);
    const edge = p < 0 || (dir > 0 && stage >= STAGE_COUNT - 1);
    const needed = edge ? WHEEL_NOTCH_PX / 2 : WHEEL_NOTCH_PX * (WHEEL_STAGE_NOTCHES - 0.5);
    if (Math.abs(acc) < needed) return;
    acc = 0;
    movedAt = now;
    if (dir > 0 && stage >= STAGE_COUNT - 1) { exit(); return; }
    const target = p < 0 ? (dir > 0 ? 0.5 : -1) : dir > 0 ? stage + 1.5 : stage - 0.5;
    travel(progress, target);
  }, { passive: false });
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
    if (progress && link.dataset.progress !== undefined && Number.isFinite(p)) travel(progress, p);
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
  // 'js' too: the page drops it when the scripts take too long to arrive (slow connection), and the fixed process
  // cards hang on it.
  root.classList.add('js', 'js-ui');
  // Only the home page has the process story and its scroll progress; the other pages pass none (js/page.js).
  const story = progress && typeof progress.get === 'function' ? progress : null;
  safely('nav', () => initNav({ progress: story, isShot }));
  safely('menu', initMenu);
  safely('reveals', () => initReveals({ isShot, reducedMotion }));
  if (story) {
    safely('rail', () => initRail({ progress: story }));
    safely('step-cards', () => initStepCards({ progress: story, isShot }));
    if (!isShot && matchMedia('(pointer: fine)').matches) safely('wheel', () => initWheelPaging({ progress: story, reducedMotion }));
  }
  safely('anchors', () => initAnchors({ progress: story, reducedMotion }));
  safely('lifecycle', initLifecycle);
}

export const _internals = { railState, STAGE_NAMES };
