// How the film follows the scroll (index.js). Pure, like choreo.js.
//
// The client's rules, in the order they arrived (2026-10-09 / 10):
//   1. While a stage's card is being read the film plays that stage to its finished picture by itself, and stops
//      there — it never runs on into the next stage.
//   2. A stage chosen with a button (the rail, "Sonraki aşama") is played from its first move, at a pace that can
//      be followed; the stages jumped over go by quickly.
//   3. Whenever the page is being scrolled the film moves with it: scrolling back up rewinds it instead of leaving
//      a still picture.
//   4. Nothing may speed up with a jerk: going on to the next stage runs at the stage's own pace, and scrolling
//      down does not push the film.

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

// Paces in progress units per second, accelerations per second squared, times in seconds.
//   rate / ease / min — a stage playing by itself: about four seconds for a whole stage, easing out at the end
//   near / seekGain / seekMax — getting to the start of a stage that lies ahead (a button, or a fast scroll): the
//          last `near` of the way goes at the stage's own pace, so a stage runs into the next one at one speed
//          ("Sonraki aşama" used to go by faster than the stage itself); further away it is quicker, the more so
//          the further
//   accel / brake — how fast the film may gain and lose speed
//   tail — how the film follows a scroll that goes on past a stage's finished picture (gain per second)
//   rewind / rewindMax / rewindAccel — how it follows a scroll back up
//   damp — how it follows the scroll in the hero and the outro (per second, exponential)
//   resumeBack — how long the scroll must rest after scrolling back before the stage plays forward again. A mouse
//          wheel pauses between notches, and playing forward in every pause would fight the rewind.
//   settle / jumpWait — a chosen stage: when the page counts as arrived, and how long to wait for it
export const PLAY = Object.freeze({
  rate: 0.24, ease: 2.4, min: 0.03,
  near: 0.3, seekGain: 1.6, seekMax: 2.4,
  accel: 2, brake: 4,
  tail: 3,
  rewind: 3.5, rewindMax: 2.2, rewindAccel: 5,
  damp: 5.5,
  resumeBack: 0.9, settle: 0.3, jumpWait: 2,
});
const EPS = 1e-4;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const isStage = (index) => index >= 0 && index < STAGE_HOLD.length;
/** Speed towards a stage start `d` ahead. */
const seekSpeed = (d) => (d <= PLAY.near ? PLAY.rate : Math.min(PLAY.seekMax, PLAY.rate + (d - PLAY.near) * PLAY.seekGain));
/** Speed of a stage playing by itself, `left` short of its finished picture. */
const playSpeed = (left) => Math.min(PLAY.rate, Math.max(PLAY.min, left * PLAY.ease));
/** Speed back to a point `d` behind. */
const backSpeed = (d) => Math.min(PLAY.seekMax, 0.3 + d * PLAY.seekGain);

/**
 * The film's playhead. step(P, dt) moves it for one frame (dt seconds) given scroll progress P and returns where the
 * film is; jump(index) announces that a stage was chosen with a button.
 *
 *  · At rest, and while scrolling down, a stage plays to its finished picture at its own pace. Scrolling down does
 *    not push it: the film is already on its way.
 *  · A stage that lies ahead is reached at seekSpeed — at the stage's own pace when it is the next one.
 *  · Scrolling on past the finished picture moves through what is left before the next stage; scrolling back up
 *    rewinds. For those two the scroll and the film are tied by an anchor (scroll p, film a) with the stage's start
 *    and end fixed, so neither direction makes the film jump.
 *  · A chosen stage is rewound to (or reached at) its start and played from there.
 * The film has a velocity, limited in how fast it may change (accel / brake).
 */
export function createPlayhead(start) {
  let at = start;
  let vel = 0;
  let lastP = start;
  let idle = 0; // seconds since the scroll last moved
  let dir = 1; // direction of that last movement
  let anchor = { stage: stageOf(start).index, p: start, a: start };
  let tailAnchored = false; // the anchor was taken at the finished picture of the current stage
  let jump = null; // { index, age, started }
  let calm = false; // nothing moved in the last step and nothing is about to

  // One frame at (up to) the wanted speed, never past `stop`.
  const drive = (wanted, stop, dt, accel = PLAY.accel, brake = PLAY.brake) => {
    const limit = (Math.abs(wanted) > Math.abs(vel) ? accel : brake) * dt;
    vel += clamp(wanted - vel, -limit, limit);
    const next = at + vel * dt;
    if (stop !== null && (stop - at) * (stop - next) <= 0) { at = stop; vel = 0; } else at = next;
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
        else if (jump.started && idle > PLAY.settle) jump = null; // arrived and at rest: the stage plays on below
      }

      if (jump) {
        // A chosen stage: to its start, then it plays. The scroll is not followed meanwhile (the page is gliding there).
        const s = jump.index;
        if (!jump.started) {
          if (at < s) { drive(seekSpeed(s - at), null, dt); if (at >= s) jump.started = true; }
          else { drive(-backSpeed(at - s), s, dt); if (at === s) jump.started = true; }
        } else drive(playSpeed(STAGE_HOLD[s] - at), STAGE_HOLD[s], dt);
        anchor = { stage: s, p: clamp(P, s, s + 1), a: clamp(at, s, s + 1) };
        tailAnchored = false;
        pending = true;
      } else if (!isStage(index)) {
        // Hero and outro follow the scroll.
        at += (P - at) * (1 - Math.exp(-dt * PLAY.damp));
        if (Math.abs(P - at) < EPS) at = P;
        vel = dt > 0 ? clamp((at - before) / dt, -PLAY.rewindMax, PLAY.rewindMax) : 0;
        anchor = { stage: index, p: P, a: P };
        tailAnchored = false;
      } else {
        if (anchor.stage !== index) { anchor = { stage: index, p: P, a: P }; tailAnchored = false; }
        const hold = STAGE_HOLD[index];
        if (dir < 0 && idle < PLAY.resumeBack) {
          // Being scrolled back up: rewind with it.
          const target = mapped(P, index);
          drive(clamp((target - at) * PLAY.rewind, -PLAY.rewindMax, PLAY.rewindMax), target, dt, PLAY.rewindAccel, PLAY.rewindAccel);
          pending = true;
        } else if (at < index - EPS) {
          drive(seekSpeed(index - at), null, dt); // the stage lies ahead
          tailAnchored = false;
        } else if (at > index + 1 + EPS) {
          drive(-backSpeed(at - hold), hold, dt); // the film is beyond this stage: back to its finished picture
          tailAnchored = false;
        } else if (at < hold) {
          drive(playSpeed(hold - at), hold, dt); // the stage plays
          anchor = { stage: index, p: P, a: clamp(at, index, index + 1) };
          tailAnchored = false;
        } else {
          // Finished picture: a scroll that goes on moves through what is left before the next stage.
          if (!tailAnchored) { anchor = { stage: index, p: P, a: clamp(at, index, index + 1) }; tailAnchored = true; }
          const target = Math.max(hold, mapped(P, index));
          drive(clamp((target - at) * PLAY.tail, -PLAY.rate * 3, PLAY.rate * 3), target, dt);
        }
      }
      calm = !pending && vel === 0 && Math.abs(at - before) < 1e-7;
      return at;
    },
  };
}
