// How the film follows the scroll (index.js). Pure, like choreo.js.
//
// The client's rules, in the order they arrived (2026-10-09):
//   1. While a stage's card is being read the film plays that stage to its finished picture by itself, and stops
//      there — it never runs on into the next stage.
//   2. A stage chosen with a button (the rail, "Sonraki aşama") is played from its first move, at a pace that can
//      be followed; the stages jumped over go by quickly.
//   3. Whenever the page is being scrolled the film moves with it, in both directions: scrolling back up rewinds it
//      instead of leaving a still picture.

import { stageOf } from './choreo.js';

/**
 * Where each stage's own story is complete: its finished picture, just before the next stage makes its first move
 * (Tasarım: the dimensioned drawing · Üretim: the built stand · Depolama: every crate on the rack ·
 * Nakliye: unloaded in the hall · Kurulum: the lit stand · Söküm: packed, lids closed · Bakım: every part checked ·
 * Yeniden Kullanım: the new layout, lit, the ring closed).
 */
export const STAGE_HOLD = Object.freeze([0.96, 1.97, 2.78, 3.95, 4.97, 5.96, 6.94, 7.97]);

/** The point a stage plays to by itself for scroll progress P (the hero and the outro simply follow the scroll). */
export function playTarget(P) {
  const { index } = stageOf(P);
  return index < 0 || index >= STAGE_HOLD.length ? P : Math.max(P, STAGE_HOLD[index]);
}

// Paces in progress units per second; times in seconds.
//   rate / ease / min — a stage playing by itself: about four seconds for a whole stage, easing out at the end
//   seek / far / seekMax — getting to the start of a chosen stage: quick, but slow enough to see what goes by;
//                          longer distances start faster
//   follow — how tightly the film tracks the scroll while it is being scrolled (per second, exponential)
//   resumeFwd / resumeBack — how long the scroll must rest before the stage plays on by itself. Longer after
//                          scrolling back: a mouse wheel pauses between notches, and playing forward in every
//                          pause would fight the rewind.
//   jumpWait — how long a chosen stage waits for the page to arrive there before the choice is dropped
export const PLAY = Object.freeze({
  rate: 0.24, ease: 2.4, min: 0.03,
  seek: 1.6, far: 1.2, seekMax: 4, damp: 5.5,
  follow: 9, resumeFwd: 0.3, resumeBack: 0.9, jumpWait: 2,
});
const EPS = 1e-4;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const isStage = (index) => index >= 0 && index < STAGE_HOLD.length;

/**
 * The film's playhead. step(P, dt) moves it for one frame (dt seconds) given scroll progress P and returns where the
 * film is; jump(index) announces that a stage was chosen with a button.
 *
 * Inside a stage the scroll and the film are tied by an anchor (scroll p ↔ film a): the film may be ahead of the
 * scroll because the stage played on while the page rested. From the anchor the rest of the stage is mapped in
 * straight lines — stage start ↔ stage start, stage end ↔ stage end — so scrolling on from there moves the film
 * forwards to the end of the stage, and scrolling back rewinds it to the stage's start, without a jump either way.
 */
export function createPlayhead(start) {
  let at = start;
  let lastP = start;
  let idle = 0; // seconds since the scroll last moved
  let dir = 1; // direction of that last movement
  let anchor = { stage: stageOf(start).index, p: start, a: start };
  let jump = null; // { index, age, started }
  let calm = false; // nothing moved in the last step and nothing is about to

  const towards = (target, dt) => {
    const d = Math.abs(target - at);
    const pace = Math.min(Math.min(PLAY.seekMax, Math.max(PLAY.seek, d * PLAY.far)), Math.max(PLAY.rate, d * PLAY.damp));
    at += Math.sign(target - at) * Math.min(d, pace * dt);
  };
  const playOn = (hold, dt) => {
    at = Math.min(hold, at + dt * Math.min(PLAY.rate, Math.max(PLAY.min, (hold - at) * PLAY.ease)));
  };
  const follow = (target, dt, rate) => {
    at += (target - at) * (1 - Math.exp(-dt * rate));
    if (Math.abs(target - at) < EPS) at = target;
  };
  // Film position for scroll P inside stage i, through the anchor.
  const mapped = (P, i) => {
    const { p, a } = anchor;
    if (P <= p) return p - i < EPS ? Math.min(a, P) : i + ((P - i) * (a - i)) / (p - i);
    return i + 1 - p < EPS ? a : a + ((P - p) * (i + 1 - a)) / (i + 1 - p);
  };

  return {
    get at() { return at; },
    settled: (P) => calm && Math.abs(P - lastP) < 1e-5,
    jump(index) { if (isStage(index)) jump = { index, age: 0, started: false }; },
    step(P, dt) {
      const before = at;
      const { index } = stageOf(P);
      if (Math.abs(P - lastP) > 1e-5) { dir = P > lastP ? 1 : -1; idle = 0; } else idle += dt;
      lastP = P;
      let pending = false;

      if (jump) {
        jump.age += dt;
        const here = index === jump.index;
        if ((jump.started && !here) || (!here && jump.age > PLAY.jumpWait)) jump = null; // scrolled away / never arrived
        else if (jump.started && idle > PLAY.resumeFwd) jump = null; // arrived and at rest: the stage plays on below
      }

      if (jump) {
        // A chosen stage: to its start at seek pace, then it plays; the scroll is not followed meanwhile (the page
        // is still gliding there).
        if (!jump.started) {
          towards(jump.index, dt);
          if (Math.abs(at - jump.index) < EPS) { at = jump.index; jump.started = true; }
        } else playOn(STAGE_HOLD[jump.index], dt);
        anchor = { stage: jump.index, p: clamp(P, jump.index, jump.index + 1), a: clamp(at, jump.index, jump.index + 1) };
        pending = true;
      } else if (!isStage(index)) {
        follow(P, dt, PLAY.damp); // hero and outro
        anchor = { stage: index, p: P, a: P };
      } else {
        if (anchor.stage !== index) anchor = { stage: index, p: P, a: P }; // a new stage starts in step with the scroll
        const hold = STAGE_HOLD[index];
        if (idle < (dir > 0 ? PLAY.resumeFwd : PLAY.resumeBack)) {
          follow(mapped(P, index), dt, PLAY.follow); // being scrolled
          pending = true;
        } else {
          // At rest: the stage plays on to its finished picture.
          if (at < index - EPS) towards(index, dt);
          else if (at > index + 1 + EPS) towards(hold, dt);
          else if (at < hold) playOn(hold, dt);
          anchor = { stage: index, p: P, a: clamp(at, index, index + 1) };
        }
      }
      calm = !pending && Math.abs(at - before) < 1e-7;
      return at;
    },
  };
}
