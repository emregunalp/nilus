// How the film follows the scroll: the scroll chooses the stage, the stage plays by itself (index.js).
// Pure, like choreo.js.

import { stageOf } from './choreo.js';

/**
 * Where each stage's own story is complete: its finished picture, just before the next stage makes its first move
 * (Tasarım: the dimensioned drawing · Üretim: the built stand · Depolama: every crate on the rack ·
 * Nakliye: unloaded in the hall · Kurulum: the lit stand · Söküm: packed, lids closed · Bakım: every part checked ·
 * Yeniden Kullanım: the new layout, lit).
 */
export const STAGE_HOLD = Object.freeze([0.96, 1.97, 2.78, 3.95, 4.97, 5.96, 6.94, 7.97]);

/**
 * The point the film plays to for a scroll progress P. Inside a stage that is the stage's finished picture, however
 * little of the stage has been scrolled: the scroll chooses the stage, the stage then plays by itself and stops
 * there — it never runs on into the next one (client, 2026-10-09). The hero and the outro follow the scroll.
 */
export function playTarget(P) {
  const { index } = stageOf(P);
  return index < 0 || index >= STAGE_HOLD.length ? P : Math.max(P, STAGE_HOLD[index]);
}

// Paces, in progress units per second.
//   rate — a stage playing by itself: about four seconds for a whole stage, easing out before its finished picture
//   seek — getting to a stage that was chosen (the rest of the stage before it, or the stages a rail button jumped
//          over): quick, but slow enough to see what goes by. Longer distances start faster (far, at most seekMax).
export const PLAY = Object.freeze({ rate: 0.24, ease: 2.4, min: 0.03, seek: 1.6, far: 1.2, seekMax: 4, damp: 5.5 });
const SETTLE_EPS = 1e-4;

/**
 * The film's playhead. step(P, dt) moves it for one frame towards scroll progress P and returns where it is.
 *  · hero and outro: it follows the scroll;
 *  · a stage ahead: it runs to the stage's START at seek pace, then plays the stage to its finished picture at the
 *    stage's own pace — so the chosen stage is always seen from its first move (client, 2026-10-09: jumping with the
 *    rail went by too fast to see what was happening);
 *  · one stage back (scrolling up): it rewinds to that stage's finished picture;
 *  · a jump back over a stage or more (a rail button): it rewinds to the stage's start and plays it forward.
 */
export function createPlayhead(start) {
  let at = start;
  let rewinding = null; // index of the stage being rewound to its start
  const towards = (target, dt) => {
    const d = Math.abs(target - at);
    const pace = Math.min(Math.min(PLAY.seekMax, Math.max(PLAY.seek, d * PLAY.far)), Math.max(PLAY.rate, d * PLAY.damp));
    at += Math.sign(target - at) * Math.min(d, pace * dt);
  };
  return {
    get at() { return at; },
    settled: (P) => rewinding === null && Math.abs(playTarget(P) - at) < SETTLE_EPS,
    step(P, dt) {
      const { index } = stageOf(P);
      const goal = playTarget(P);
      if (index < 0 || index >= STAGE_HOLD.length) {
        rewinding = null;
        at += (goal - at) * (1 - Math.exp(-dt * PLAY.damp));
      } else {
        if (rewinding !== index) rewinding = stageOf(at).index - index >= 2 ? index : null;
        if (rewinding !== null) {
          towards(index, dt);
          if (at - index < SETTLE_EPS) { at = index; rewinding = null; }
        } else if (at < index) towards(index, dt);
        else if (at > goal) towards(goal, dt);
        else at = Math.min(goal, at + dt * Math.min(PLAY.rate, Math.max(PLAY.min, (goal - at) * PLAY.ease)));
      }
      if (rewinding === null && Math.abs(goal - at) < SETTLE_EPS) at = goal;
      return at;
    },
  };
}
