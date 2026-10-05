// Scene A — "Maket": the Nilus stand as a crafted architectural scale model in a bright cream studio.
// Contract: ../../CONTRACT.md §5 — mountScene({ canvas, getProgress, snap, quality, reducedMotion, isMobile }) → { dispose }.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { createBaseMaterials, COLORS } from './materials.js';
import * as TX from './textures.js';
import { buildStand } from './stand.js';
import { createDrawing } from './props-draw.js';
import { createCrates, createRack, createTruck, createRoad, createRouteMap } from './props-logistics.js';
import { createSparks, createScanner, createRing, createPlot, createDust, setPointScale } from './props-fx.js';
import { createCameraRig } from './camera.js';
import { createDirector } from './director.js';
import { createPost, createPlain } from './post.js';
import { CRATE_COUNT } from './choreo.js';

const FONT_URL = 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/fonts/helvetiker_bold.typeface.json';
const FONT_TIMEOUT_MS = 2400;
const DAMPING = 6.5;            // 1/s — exponential follow of scroll progress
const IDLE_SWAY = (10 * Math.PI) / 180;
const IDLE_PERIOD = 16;         // s
const PARALLAX = { x: 2.2, y: 1.1 }; // degrees
const BOOT_DURATION = 2.6;      // s — hero neon ignition window (non-snap)
const P_MIN = -1;
const P_MAX = 9;

const clampP = (p) => Math.min(P_MAX, Math.max(P_MIN, Number.isFinite(p) ? p : P_MIN));
const withTimeout = (promise, ms) => Promise.race([promise, new Promise((r) => setTimeout(() => r(null), ms))]);

function createRenderer(canvas, quality) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: quality === 'low', alpha: false, powerPreference: 'high-performance' });
  } catch (err) {
    throw new Error(`WebGL unavailable: ${err?.message || err}`);
  }
  if (!renderer.getContext()) throw new Error('WebGL unavailable');
  renderer.setClearColor(new THREE.Color(COLORS.cream), 1);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.info.autoReset = false;
  return renderer;
}

function addLights(scene, renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = env.texture;
  scene.environmentIntensity = 0.32;
  scene.add(new THREE.HemisphereLight('#FFF7EC', '#D9CCB6', 0.95));
  const key = new THREE.DirectionalLight('#FFF1E2', 1.55);
  key.position.set(-6, 11, 8);
  const fill = new THREE.DirectionalLight('#E9EEFF', 0.4);
  fill.position.set(9, 4, -4);
  scene.add(key, fill);
  return () => { env.dispose(); pmrem.dispose(); };
}

async function loadAssets() {
  const [font] = await Promise.all([
    withTimeout(new FontLoader().loadAsync(FONT_URL).catch(() => null), FONT_TIMEOUT_MS),
    TX.ensureFonts(),
  ]);
  return { font };
}

function createTextures() {
  return {
    signWord: TX.signTexture('word', 3.2, 0.44),
    signSub: TX.signTexture('sub', 2.0, 0.44),
    screens: [TX.screenTexture(0), TX.screenTexture(1)],
    counterBands: TX.counterBandTextures(),
    shadowRound: TX.shadowTexture('round'),
    shadowRect: TX.shadowTexture('rect'),
    spill: TX.spillTexture(),
  };
}

function buildWorld(scene, { font, quality }) {
  const base = createBaseMaterials();
  const shared = { base, tex: createTextures(), font, quality, planeGeo: new THREE.PlaneGeometry(1, 1) };
  const stand = buildStand(shared);
  const world = {
    stand,
    drawing: createDrawing(),
    crates: createCrates(base),
    rack: createRack(),
    truck: createTruck(base),
    road: createRoad(),
    route: createRouteMap(),
    sparks: createSparks(quality),
    scanner: createScanner(),
    ring: createRing(),
    plot: createPlot(),
    dust: createDust(quality),
  };
  scene.add(stand.root, world.drawing.group, world.crates.group, world.rack.group, world.truck.group, world.road.group,
    world.route.group, world.sparks.group, world.scanner.group, world.ring.group, world.plot.group, world.dust.group);
  return world;
}

function lineMaterialsOf(scene) {
  const out = new Set();
  scene.traverse((o) => { if (o.material?.isLineMaterial) out.add(o.material); });
  return [...out];
}

function disposeScene(scene) {
  scene.traverse((o) => {
    o.geometry?.dispose?.();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      for (const v of Object.values(m)) if (v?.isTexture) v.dispose();
      m.dispose();
    }
  });
}

function pointerParallax(enabled) {
  const state = { x: 0, y: 0, tx: 0, ty: 0 };
  if (!enabled) return { state, detach: () => {} };
  const onMove = (e) => {
    state.tx = (e.clientX / window.innerWidth - 0.5) * 2;
    state.ty = (e.clientY / window.innerHeight - 0.5) * 2;
  };
  window.addEventListener('pointermove', onMove, { passive: true });
  return { state, detach: () => window.removeEventListener('pointermove', onMove) };
}

export async function mountScene({ canvas, getProgress, snap = false, quality = 'high', reducedMotion = false, isMobile = false }) {
  const renderer = createRenderer(canvas, quality);
  const dpr = quality === 'high' ? Math.min(window.devicePixelRatio || 1, 1.75) : 1;
  renderer.setPixelRatio(dpr);
  const scene = new THREE.Scene();
  const disposeLights = addLights(scene, renderer);
  const assets = await loadAssets();
  const world = buildWorld(scene, { font: assets.font, quality });
  const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 200);
  const rig = createCameraRig(camera);
  const director = createDirector(world);
  const size = { w: Math.max(1, canvas.clientWidth || window.innerWidth), h: Math.max(1, canvas.clientHeight || window.innerHeight) };
  renderer.setSize(size.w, size.h, false);
  const post = quality === 'high' ? createPost(renderer, scene, camera, { width: size.w, height: size.h, dpr, clearColor: new THREE.Color(COLORS.cream) }) : createPlain(renderer, scene, camera);
  const lineMats = lineMaterialsOf(scene);
  const parallax = pointerParallax(!snap && !reducedMotion && !isMobile);
  const debug = new URLSearchParams(location.search).get('debug') === '1';
  const mountAt = performance.now();
  let shown = clampP(getProgress());
  let lastNow = mountAt;
  let dirty = true;
  let raf = 0;
  let disposed = false;

  function resize() {
    const w = Math.max(1, canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, canvas.clientHeight || window.innerHeight);
    if (w === size.w && h === size.h && !dirty) return;
    size.w = w;
    size.h = h;
    renderer.setSize(w, h, false);
    post.setSize(w, h, dpr);
    rig.resize(w, h);
    for (const m of lineMats) m.resolution.set(w, h);
    dirty = true;
  }

  function render(now) {
    const sec = (now - mountAt) / 1000;
    const animateBoot = !snap && !reducedMotion;
    const idleYaw = animateBoot ? Math.sin((sec / IDLE_PERIOD) * Math.PI * 2) * IDLE_SWAY : 0;
    parallax.state.x += (parallax.state.tx - parallax.state.x) * 0.06;
    parallax.state.y += (parallax.state.ty - parallax.state.y) * 0.06;
    renderer.info.reset();
    director(shown, { bootSec: animateBoot ? sec : Infinity, idleYaw, time: animateBoot ? sec : 0 });
    const pxPerUnit = rig.apply(shown, { x: parallax.state.x * PARALLAX.x, y: -parallax.state.y * PARALLAX.y });
    setPointScale(pxPerUnit * dpr);
    post.render();
  }

  function needsFrame(target, sec) {
    if (dirty) return true;
    if (snap) return false;
    if (Math.abs(target - shown) > 1e-4) return true;
    if (shown >= P_MAX) return false;
    const heroAlive = shown < 0.05 && !reducedMotion;
    const pointerMoving = Math.abs(parallax.state.tx - parallax.state.x) + Math.abs(parallax.state.ty - parallax.state.y) > 1e-3;
    return heroAlive || sec < BOOT_DURATION || pointerMoving;
  }

  function frame(now) {
    raf = 0;
    if (disposed) return;
    // Snap mode renders on demand only: an idle page lets headless virtual time run free (shot.mjs).
    if (!snap) raf = requestAnimationFrame(frame);
    if (document.hidden) return;
    const dt = Math.min(0.1, (now - lastNow) / 1000);
    lastNow = now;
    const target = clampP(getProgress());
    shown = snap ? target : shown + (target - shown) * (1 - Math.exp(-dt * DAMPING));
    if (Math.abs(target - shown) < 1e-4) shown = target;
    if (!needsFrame(target, (now - mountAt) / 1000)) return;
    render(now);
    dirty = false;
  }

  const schedule = () => { if (!raf && !disposed) raf = requestAnimationFrame(frame); };

  rig.resize(size.w, size.h);
  for (const m of lineMats) m.resolution.set(size.w, size.h);
  render(performance.now());
  dirty = false;
  const observer = new ResizeObserver(() => { dirty = true; resize(); schedule(); });
  observer.observe(canvas);
  const onVisible = () => { if (!document.hidden) { lastNow = performance.now(); dirty = true; schedule(); } };
  document.addEventListener('visibilitychange', onVisible);
  if (!snap) schedule();
  const debugTimer = debug
    ? setInterval(() => console.log(`[scene-a] P=${shown.toFixed(2)} calls=${renderer.info.render.calls} triangles=${renderer.info.render.triangles} crates=${CRATE_COUNT}`), 1000)
    : 0;

  return {
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      clearInterval(debugTimer);
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisible);
      parallax.detach();
      post.dispose();
      disposeScene(scene);
      disposeLights();
      renderer.dispose();
    },
  };
}
