// Scroll → lifecycle progress P ∈ [-1, 9] (CONTRACT §4).
//   [-1,0) hero · [0,8) stage i = floor(P) · [8,9] outro.
// Knots are the scrollY values where P crosses an integer; between knots P is linear.
// Anchors are measured through the offsetTop chain, so shot-mode transforms never skew them.

export const ACTIVE_LINE = 0.55;
const P_MIN = -1;
const P_MAX = 9;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const finiteOr = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** Scroll positions for P = -1, 0, 1, … N+1 (non-decreasing, always finite). */
export function buildKnots(anchors = {}, viewportH = 0) {
  const line = finiteOr(viewportH, 0) * ACTIVE_LINE;
  const stepTops = Array.isArray(anchors.stepTops) ? anchors.stepTops : [];
  // Sections may sit between the hero and the process (projects). The stand holds its hero pose behind them and
  // only starts towards stage 0 once the process itself scrolls into view.
  const heroTop = finiteOr(anchors.heroTop, 0);
  const processEnters = finiteOr(anchors.processTop, NaN) - finiteOr(viewportH, 0);
  const raw = [
    Number.isFinite(processEnters) ? Math.max(heroTop, processEnters) : heroTop,
    ...stepTops.map((t) => finiteOr(t, NaN) - line),
    finiteOr(anchors.stepsEnd, NaN) - line,
    finiteOr(anchors.processBottom, NaN),
  ];
  const knots = [];
  for (const k of raw) {
    const prev = knots.length ? knots[knots.length - 1] : 0;
    knots.push(Number.isFinite(k) ? Math.max(prev, k) : prev);
  }
  return knots;
}

const knotValue = (j) => j + P_MIN;

/** SAF: scrollY → P. Exact integers on the active line; clamped to [-1, 9]. */
export function computeProgress(scrollY, anchors, viewportH) {
  const knots = buildKnots(anchors, viewportH);
  const last = knots.length - 1;
  if (!(scrollY > knots[0])) return P_MIN;
  if (scrollY >= knots[last]) return clamp(knotValue(last), P_MIN, P_MAX);
  for (let j = last - 1; j >= 0; j--) {
    if (knots[j] <= scrollY) {
      const span = knots[j + 1] - knots[j]; // > 0: knots[j] <= y < knots[j+1]
      return clamp(knotValue(j) + (scrollY - knots[j]) / span, P_MIN, P_MAX);
    }
  }
  return P_MIN;
}

/** SAF: P → scrollY (inverse of computeProgress on the covered range). */
export function progressToScroll(p, anchors, viewportH) {
  const knots = buildKnots(anchors, viewportH);
  const last = knots.length - 1;
  if (last < 1) return knots[0];
  const idx = clamp(finiteOr(p, P_MIN) - P_MIN, 0, last);
  const j = Math.min(Math.floor(idx), last - 1);
  return knots[j] + (idx - j) * (knots[j + 1] - knots[j]);
}

/**
 * SAF: CSS `position: sticky` sonucu (viewport px). Shot mode'da pencere kaymadığı için kartların yerini bu verir.
 * top/bottom: yapışma mesafesi (null = o kenar yok); blockTop/blockBottom: kartın kenarlık kutusunun kapsayıcı
 * içinde durabileceği aralık (kapsayıcı içerik kutusu − kartın kendi marjları). Dönen değer: doğal yere göre kayma.
 */
export function stickyOffset({ naturalTop, height, top = null, bottom = null, blockTop, blockBottom, viewportH }) {
  let vt = naturalTop;
  if (top !== null) vt = Math.min(Math.max(vt, top), blockBottom - height);
  if (bottom !== null) vt = Math.max(Math.min(vt, viewportH - bottom - height), blockTop);
  return vt - naturalTop;
}

/**
 * SAF: mobilde adım kartının opaklığı. Kart altta sabitken okunur; aşamanın sonunda sabitlikten çıkıp yukarı
 * kayarken standın ÜSTÜNDEN geçer (Kurulum doruğundaki neonu örtüyordu) → çıkıştan hemen önce söner.
 */
export const CARD_FADE = Object.freeze({ start: 0.72, end: 0.84 });
export function cardFadeOpacity(p, index) {
  const t = p - index;
  if (!(t > CARD_FADE.start)) return 1;
  if (t >= CARD_FADE.end) return 0;
  return 1 - (t - CARD_FADE.start) / (CARD_FADE.end - CARD_FADE.start);
}

/** '22vh' | '16px' | 'auto' → px ya da null. Yalnız sticky değişkenlerinin kullandığı birimler. */
function lengthPx(raw, vh) {
  const v = String(raw || '').trim();
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return null;
  if (v.endsWith('vh')) return (n * vh) / 100;
  return n;
}

function docTop(el) {
  let y = 0;
  for (let node = el; node; node = node.offsetParent) y += node.offsetTop || 0;
  return y;
}

function measureAnchors({ hero, steps, process }) {
  const stepTops = steps.map(docTop);
  const lastStep = steps[steps.length - 1];
  const heroTop = hero ? docTop(hero) : 0;
  const stepsEnd = lastStep
    ? docTop(lastStep) + lastStep.offsetHeight
    : heroTop + (hero ? hero.offsetHeight : 0);
  const processTop = process ? docTop(process) : NaN;
  const processBottom = process ? docTop(process) + process.offsetHeight : stepsEnd;
  return { heroTop, stepTops, stepsEnd, processTop, processBottom };
}

const viewportHeight = () => window.innerHeight || document.documentElement.clientHeight || 0;
// Phones: the address bar sliding in and out changes the window height by this much at most.
const ADDRESS_BAR_MAX = 140;
const isTouch = () => { try { return matchMedia('(pointer: coarse)').matches; } catch { return false; } };
const prefersReducedMotion = () => {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

export function createProgress({ content, hero, steps = [], process, forced = null, forcedY = null } = {}) {
  const els = { hero, steps: (steps || []).filter(Boolean), process };
  const isForced = typeof forced === 'number' && Number.isFinite(forced);
  const isForcedY = !isForced && typeof forcedY === 'number' && Number.isFinite(forcedY);
  const listeners = new Set();
  let anchors = measureAnchors(els);
  let vh = viewportHeight();
  let vw = window.innerWidth;
  const touch = isTouch();
  let lastEmitted = NaN;
  let frame = 0;

  const current = () => {
    if (isForced) return clamp(forced, P_MIN, P_MAX);
    return computeProgress(isForcedY ? forcedY : window.scrollY, anchors, vh);
  };

  // Shot mode: .step-card is position:relative (CSS); place each card where sticky would have put it at scrollY = y.
  const emulateSticky = (y) => {
    for (const card of content.querySelectorAll('.step-card')) {
      const block = card.parentElement;
      if (!block) continue;
      const cs = getComputedStyle(card);
      const bs = getComputedStyle(block);
      const top = lengthPx(bs.getPropertyValue('--sticky-top'), vh);
      const bottom = lengthPx(bs.getPropertyValue('--sticky-bottom'), vh);
      const blockDocTop = docTop(block);
      const off = stickyOffset({
        naturalTop: docTop(card) - y,
        height: card.offsetHeight,
        top,
        bottom,
        blockTop: blockDocTop + parseFloat(bs.paddingTop || 0) + parseFloat(cs.marginTop || 0) - y,
        blockBottom: blockDocTop + block.offsetHeight - parseFloat(bs.paddingBottom || 0) - parseFloat(cs.marginBottom || 0) - y,
        viewportH: vh,
      });
      card.style.transform = off ? `translate3d(0, ${Math.round(off)}px, 0)` : '';
    }
  };

  const applyShotTransform = () => {
    if (!content || !(isForced || isForcedY)) return;
    const y = isForced ? progressToScroll(forced, anchors, vh) : forcedY;
    content.style.transform = `translate3d(0, ${-Math.round(y)}px, 0)`;
    emulateSticky(y);
  };

  const emit = (force = false) => {
    const p = current();
    if (!force && p === lastEmitted) return;
    lastEmitted = p;
    for (const fn of listeners) {
      try { fn(p); } catch (err) { console.error('[nilus] progress listener failed', err); }
    }
  };

  const schedule = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; emit(); });
  };

  function refresh() {
    anchors = measureAnchors(els);
    // On a phone the height keeps changing while the visitor scrolls (address bar); following it would nudge the
    // progress, and with it the stand, in the middle of a swipe. A new width (rotation) is a real resize.
    const h = viewportHeight();
    if (!touch || window.innerWidth !== vw || Math.abs(h - vh) > ADDRESS_BAR_MAX) vh = h;
    vw = window.innerWidth;
    applyShotTransform();
    if (!isForced) schedule();
  }

  function onChange(fn) {
    if (typeof fn !== 'function') return () => {};
    listeners.add(fn);
    if (isForced || isForcedY) requestAnimationFrame(() => { if (listeners.has(fn)) fn(current()); });
    return () => listeners.delete(fn);
  }

  function scrollToProgress(p) {
    if (isForced || isForcedY) return;
    const top = progressToScroll(p, anchors, vh);
    window.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }

  let resizeFrame = 0;
  const onResize = () => {
    if (resizeFrame) return;
    resizeFrame = requestAnimationFrame(() => { resizeFrame = 0; refresh(); });
  };

  if (!isForced && !isForcedY) window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', onResize);
  if (typeof ResizeObserver === 'function' && content) new ResizeObserver(onResize).observe(content);
  if (document.fonts) {
    document.fonts.ready?.then(onResize).catch(() => {});
    document.fonts.addEventListener?.('loadingdone', onResize);
  }
  applyShotTransform();

  return { get: current, onChange, scrollToProgress, refresh, anchors: () => ({ ...anchors, vh }) };
}
