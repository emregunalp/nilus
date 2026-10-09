// Bootstrap — wires scroll progress (scroll.js), page UI (ui.js) and the WebGL stand scene (scene-*/index.js).
// Contract: ../CONTRACT.md. This file owns no visuals; if the scene cannot mount, the CSS poster fallback takes over.

import { createProgress } from './scroll.js';
import { initUI } from './ui.js';

const SCENES = { a: './scene-a/index.js', b: './scene-b/index.js' };
const DEFAULT_SCENE = 'b';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const params = new URLSearchParams(location.search);

const shotRaw = params.get('p');
const shotProgress = shotRaw !== null && shotRaw.trim() !== '' && Number.isFinite(Number(shotRaw))
  ? clamp(Number(shotRaw), -1, 9)
  : null;
const yRaw = params.get('y');
const shotY = shotProgress === null && yRaw !== null && yRaw.trim() !== '' && Number.isFinite(Number(yRaw))
  ? Math.max(0, Number(yRaw))
  : null;
const isShot = shotProgress !== null || shotY !== null;
const sceneParam = params.get('scene') ?? '';
const sceneDisabled = sceneParam === 'none';
const variant = Object.hasOwn(SCENES, sceneParam) ? sceneParam : DEFAULT_SCENE;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = matchMedia('(max-width: 820px)').matches;
// Tablets are wide enough for the desktop layout but draw with a phone's graphics chip: the glow pipeline made
// the page stutter there (client's tablet, 2026-10-09). They get the same light rendering as phones.
const isTouch = matchMedia('(hover: none) and (pointer: coarse)').matches;
const qParam = params.get('q');
const quality = qParam === 'low' || qParam === 'high'
  ? qParam
  : (isMobile || isTouch || (navigator.hardwareConcurrency || 8) <= 4 ? 'low' : 'high');

const root = document.documentElement;
root.classList.toggle('is-shot', isShot);
root.dataset.scene = variant;
root.dataset.quality = quality;

async function waitForFonts() {
  try {
    await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2500))]);
  } catch {
    /* font loading is cosmetic — never block boot on it */
  }
}

async function mountStage(progress) {
  const canvas = document.getElementById('stage-canvas');
  if (!canvas) throw new Error('#stage-canvas missing (CONTRACT: DOM)');
  if (sceneDisabled) throw new Error('?scene=none → poster forced');
  const { mountScene } = await import(SCENES[variant]);
  return mountScene({ canvas, getProgress: progress.get, snap: isShot, quality, reducedMotion, isMobile });
}

async function boot() {
  // Only screenshots wait for fonts (deterministic layout). Visitors get text + reveals immediately;
  // scroll.js re-measures its anchors when fonts finish loading.
  if (isShot) await waitForFonts();
  const progress = createProgress({
    content: document.getElementById('content'),
    hero: document.getElementById('hero'),
    steps: [...document.querySelectorAll('#process .step')],
    process: document.getElementById('process'),
    forced: shotProgress,
    forcedY: shotY,
  });
  initUI({ progress, isShot, reducedMotion });
  window.__nilus = { progress, variant, quality, isShot };

  try {
    window.__nilus.scene = await mountStage(progress);
    root.classList.add('scene-ready');
  } catch (err) {
    console.warn('[nilus] 3D sahne açılamadı → statik poster', err?.message || err);
    root.classList.add('no-webgl');
  }
}

boot().catch((err) => {
  console.error('[nilus] boot failed', err);
  root.classList.add('no-webgl');
});
