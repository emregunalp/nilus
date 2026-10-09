// Scene B — "Sinema": the stand's lifecycle as a short film driven by scroll progress (CONTRACT §5).
// mountScene resolves only after the first frame is on the canvas; rejects when WebGL is unavailable.

import * as THREE from 'three';
import { buildWorld } from './world.js';
import { createCameraRig } from './camera.js';
import { createPipeline } from './post.js';
import { cameraAt, P_MIN, P_MAX, smooth, segment } from './choreo.js';
import { createPlayhead } from './play.js?v=37';
import { ensureFonts } from './textures.js';
import { PALETTE, setLineResolution, forgetLineMaterials } from './materials.js';

const ASSET_TIMEOUT_MS = 2400;
const IDLE_SWAY_DEG = 10;
const IDLE_SWAY_SPEED = 0.16;
const PARALLAX_DEG = 1.8;
const MAX_DPR_HIGH = 1.75;
// Low quality (phones, ≤4-core machines) drops bloom, not sharpness: at 1× the hero line drawing looked soft on
// 2–3× phone screens (measured 2026-09-26, 375×812 @2x). 1.5× keeps lines crisp at ~2.25× the 1× fill cost.
const MAX_DPR_LOW = 1.5;
// Low quality, page not being scrolled: only the slow ambient motion is left, so every other frame is enough.
const AMBIENT_FRAME_MS = 30;
// If the device cannot keep up while the visitor scrolls, the canvas resolution steps down (never below 1×).
const SLOW_FRAME_MS = 27;
const SLOW_SAMPLES = 40;
const DPR_STEP = 0.25;
const WARM_UP_TIMEOUT_MS = 8000;
const SETTLE_EPS = 1e-4;

const clampP = (p) => Math.min(P_MAX, Math.max(P_MIN, Number.isFinite(p) ? p : P_MIN));

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), ms))]);
}

function createRenderer(canvas, quality) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: quality === 'low', alpha: false, powerPreference: 'high-performance' });
  } catch (err) {
    throw new Error(`WebGL unavailable: ${err?.message || err}`);
  }
  if (!renderer.getContext()) throw new Error('WebGL unavailable: no context');
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(PALETTE.cream, 1);
  return renderer;
}

/**
 * Compiles the shaders of everything in the scene before the first frame, including the props that only appear in
 * later stages. Without it the first frame freezes the page while everything compiles at once, and each later prop
 * stalls it again the first time it is shown. Where the browser can compile in the background the page stays
 * responsive meanwhile. `target`: the render target the frames are drawn into (null = the canvas) — programs are
 * keyed by the output colour space, so they must be compiled for the same destination.
 */
async function warmUp(renderer, scene, camera, target = null) {
  const hidden = [];
  scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
  const before = renderer.getRenderTarget();
  let compiled;
  try {
    renderer.setRenderTarget(target);
    compiled = renderer.compileAsync(scene, camera); // collects the visible objects before it first yields
  } finally {
    renderer.setRenderTarget(before);
    for (const o of hidden) o.visible = false;
  }
  await withTimeout(compiled.catch(() => null), WARM_UP_TIMEOUT_MS);
}

function canvasSize(canvas) {
  return {
    w: Math.max(1, Math.round(canvas.clientWidth || window.innerWidth)),
    h: Math.max(1, Math.round(canvas.clientHeight || window.innerHeight)),
  };
}

export async function mountScene({ canvas, getProgress, snap = false, quality = 'high', reducedMotion = false, isMobile = false }) {
  if (!canvas) throw new Error('mountScene: canvas missing');
  const params = new URLSearchParams(location.search);
  const debug = params.get('debug') === '1';
  // Verification hook: ?intro=<seconds> freezes the hero draw-in clock (deterministic snap screenshots of the
  // stroke-by-stroke drawing; headless virtual time cannot pace a live rAF clock).
  const introFreeze = params.has('intro') && Number.isFinite(Number(params.get('intro'))) ? Number(params.get('intro')) : null;
  const t0 = performance.now();
  const mark = (label) => { if (debug) console.log(`[scene-b] ${label} +${Math.round(performance.now() - t0)}ms`); };
  const renderer = createRenderer(canvas, quality);
  let dpr = Math.min(window.devicePixelRatio || 1, quality === 'low' ? MAX_DPR_LOW : MAX_DPR_HIGH);
  renderer.setPixelRatio(dpr);
  let view = canvasSize(canvas);
  renderer.setSize(view.w, view.h, false);

  let world;
  let pipeline;
  try {
    await withTimeout(ensureFonts(), ASSET_TIMEOUT_MS);
    mark('fonts ready');
    world = await buildWorld({ renderer, quality, compact: isMobile });
    mark('world built');
  } catch (err) {
    renderer.dispose();
    throw err;
  }
  const rig = createCameraRig();
  pipeline = createPipeline(renderer, world.scene, rig.camera, quality);

  if (debug) renderer.info.autoReset = false;
  const animate = !snap && !reducedMotion;
  let start = performance.now();
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const playhead = createPlayhead(clampP(getProgress())); // where the film is (play.js)
  let Pd = playhead.at;
  let last = start;
  let dirty = true;
  let disposed = false;
  let raf = 0;
  let lastLog = 0;
  let frameMs = 0; // running average of the frame interval while the stand is following the scroll
  let samples = 0;

  function resize() {
    view = canvasSize(canvas);
    renderer.setSize(view.w, view.h, false);
    pipeline.setSize(view.w, view.h, dpr);
    setLineResolution(view.w, view.h, dpr);
    dirty = true;
  }

  function renderFrame(now) {
    const t = (now - start) / 1000;
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    const P = clampP(getProgress());
    // Screenshots show exactly P; otherwise the film plays. "Reduce motion" does not stop it: the film is the page's
    // content, and with it frozen the process looked broken on the client's own computer (2026-10-09). That setting
    // still switches off the idle sway and the load-time draw-in (animate).
    Pd = snap ? P : playhead.step(P, dt);
    const heroW = 1 - smooth(segment(Pd, -0.35, 0.05));
    pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 3);
    pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 3);
    const sway = animate
      ? { az: heroW * (IDLE_SWAY_DEG * Math.sin(t * IDLE_SWAY_SPEED) + PARALLAX_DEG * pointer.x), el: heroW * PARALLAX_DEG * 0.5 * pointer.y }
      : { az: 0, el: 0 };
    const key = cameraAt(Pd);
    // introClock drives the load-time draw-in of the hero drawing (time-based, never in snap mode).
    world.update(Pd, { clock: t, introClock: introFreeze ?? (animate ? t : null), animate });
    const dist = rig.apply(key, view, sway, heroW);
    world.setFogForDistance(dist);
    if (debug) renderer.info.reset();
    pipeline.render();
    if (debug && now - lastLog > 1000) {
      lastLog = now;
      console.log(`[scene-b] P=${Pd.toFixed(3)} calls=${renderer.info.render.calls} triangles=${renderer.info.render.triangles} points=${renderer.info.render.points}`);
    }
    last = now;
  }

  function tick(now) {
    raf = 0;
    if (disposed) return;
    // Snap mode renders on demand only: a page that keeps queueing rAF never lets headless virtual time
    // run out, so tools/shot.mjs would wait forever. Resize / visibility re-schedule a frame.
    if (!snap) raf = requestAnimationFrame(tick);
    // No document.hidden gate: browsers already suspend rAF in hidden tabs, while embedded previews
    // (e.g. the desktop app's browser pane) report hidden=true yet keep firing rAF — gating froze the stand.
    const P = clampP(getProgress());
    const settled = snap ? Math.abs(P - Pd) < SETTLE_EPS : playhead.settled(P);
    const idle = settled && !dirty && (snap || Pd >= P_MAX);
    if (idle) { last = now; return; }
    if (quality === 'low' && settled && !dirty && now - last < AMBIENT_FRAME_MS) return;
    const interval = now - last;
    renderFrame(now);
    dirty = false;
    if (!settled && !snap && interval < 120) {
      frameMs += (interval - frameMs) / Math.min(++samples, 20);
      if (samples >= SLOW_SAMPLES && frameMs > SLOW_FRAME_MS && dpr > 1) {
        dpr = Math.max(1, dpr - DPR_STEP);
        renderer.setPixelRatio(dpr);
        resize();
        samples = 0;
        mark(`slow frames (${frameMs.toFixed(1)} ms) → canvas at ${dpr}×`);
      }
    } else if (settled) samples = 0;
  }

  const onPointer = (e) => {
    pointer.tx = (e.clientX / window.innerWidth - 0.5) * 2;
    pointer.ty = (e.clientY / window.innerHeight - 0.5) * 2;
  };
  const schedule = () => { if (!raf && !disposed) raf = requestAnimationFrame(tick); };
  const onResize = () => { resize(); schedule(); };
  const onVisible = () => { if (!document.hidden) { last = performance.now(); dirty = true; schedule(); } };
  const onLost = (e) => e.preventDefault();
  // A stage chosen with a button (js/ui.js) is played from its start instead of being scrubbed to.
  const onStage = (e) => { playhead.jump(Number(e.detail?.index)); schedule(); };
  window.addEventListener('nilus:stage', onStage);
  if (animate) window.addEventListener('pointermove', onPointer, { passive: true });
  canvas.addEventListener('webglcontextlost', onLost);
  document.addEventListener('visibilitychange', onVisible);
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null;
  if (ro) ro.observe(canvas); else window.addEventListener('resize', onResize);

  resize();
  if (!snap) {
    world.update(Pd, { clock: 0, introClock: introFreeze ?? (animate ? 0 : null), animate });
    await warmUp(renderer, world.scene, rig.camera, pipeline.target);
    mark('shaders ready');
    start = last = performance.now(); // the hero's draw-in starts now, not while the shaders were compiling
  }
  renderFrame(performance.now());
  mark('first frame');
  dirty = false;
  if (!snap) schedule();

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      if (ro) ro.disconnect(); else window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pointermove', onPointer);
      canvas.removeEventListener('webglcontextlost', onLost);
      window.removeEventListener('nilus:stage', onStage);
      world.dispose();
      pipeline.dispose();
      forgetLineMaterials();
      renderer.dispose();
    },
  };
}
