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
