// Drag-to-rotate: the visitor grabs the empty stage area around the text and turns the stand (azimuth only).
// The scene asks for the extra angle every frame (step). Once the page scrolls on, the stand eases back to the
// film's own camera, so no stage is ever left at an odd angle.

const DEG_PER_PX = 0.32;
const MAX_FLICK = 420; // °/s
const FRICTION = 4.5; // 1/s — how quickly a flick dies out
const RETURN_RATE = 2.6; // 1/s — ease back to the choreographed angle
const RETURN_AFTER = 0.05; // progress scrolled after the release before the stand turns back
const FLICK_TIMEOUT_MS = 80; // a pointer that rested before the release does not flick
// Only the transparent section boxes themselves are a handle — text, cards, links and buttons keep their behaviour.
const DRAG_ZONES = '#hero, #process, .step, .process-outro';
// The hint shows where the stand stands still and whole: the hero and the outro.
const HINT_RANGES = Object.freeze([[-1, -0.6], [8.05, 9]]);

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const wrap180 = (deg) => ((((deg + 180) % 360) + 360) % 360) - 180;

export function createOrbit({ progress, reducedMotion = false } = {}) {
  const root = document.documentElement;
  const hint = document.querySelector('.stage-hint');
  let az = 0;
  let vel = 0;
  let pointerId = null;
  let lastX = 0;
  let lastT = 0;
  let releasedAt = null;
  let returning = false;
  let used = false;

  const renderHint = () => {
    if (!hint) return;
    const p = progress.get();
    hint.classList.toggle('is-on', !used && HINT_RANGES.some(([a, b]) => p >= a && p <= b));
  };

  function onDown(e) {
    if (pointerId !== null || !root.classList.contains('scene-ready')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!(e.target instanceof Element) || !e.target.matches(DRAG_ZONES)) return;
    pointerId = e.pointerId;
    lastX = e.clientX;
    lastT = e.timeStamp;
    vel = 0;
    returning = false;
    root.classList.add('is-orbiting');
    try { e.target.setPointerCapture(e.pointerId); } catch { /* capture is a nicety: the drag still works inside the window */ }
    if (e.pointerType === 'mouse') e.preventDefault(); // no text selection while turning
  }

  function onMove(e) {
    if (e.pointerId !== pointerId) return;
    const turn = -(e.clientX - lastX) * DEG_PER_PX;
    const dt = Math.max(1, e.timeStamp - lastT) / 1000;
    az += turn;
    vel = clamp(vel + (turn / dt - vel) * 0.5, -MAX_FLICK, MAX_FLICK);
    lastX = e.clientX;
    lastT = e.timeStamp;
    if (turn && !used) { used = true; renderHint(); }
  }

  function onUp(e) {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    root.classList.remove('is-orbiting');
    if (reducedMotion || e.type === 'pointercancel' || e.timeStamp - lastT > FLICK_TIMEOUT_MS) vel = 0;
    az = wrap180(az); // same view, shortest way back
    releasedAt = progress.get();
  }

  /** Extra camera azimuth in degrees; `dt` = seconds since the previous frame. */
  function step(dt) {
    if (pointerId !== null) return az;
    if (vel) {
      az += vel * dt;
      vel *= Math.exp(-dt * FRICTION);
      if (Math.abs(vel) < 1) vel = 0;
    }
    if (!returning && az && releasedAt !== null && Math.abs(progress.get() - releasedAt) > RETURN_AFTER) returning = true;
    if (returning) {
      vel = 0;
      az = wrap180(az) * Math.exp(-dt * RETURN_RATE);
      if (Math.abs(az) < 0.02) { az = 0; returning = false; releasedAt = null; }
    }
    return az;
  }

  document.addEventListener('pointerdown', onDown);
  document.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onUp);
  progress.onChange(renderHint);
  renderHint();

  return {
    step,
    /** True while the angle is still changing — the scene must keep rendering. */
    get busy() { return pointerId !== null || vel !== 0 || returning; },
  };
}
