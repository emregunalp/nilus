// Turnable 3D views of the rental layouts (blank, and printed where the card names an artwork set). One WebGL
// renderer draws every stand and copies the picture onto each card's own 2D canvas, so all cards cost one GL context. A view renders only when its angle changes: it turns
// slowly by itself while on screen, and follows the visitor's horizontal drag (with a little inertia) once touched.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as kit from '../projects/3d/kit.js';
import { buildRentalStand } from './stands.js';
import { artworkReady, rentalArtwork } from './artwork.js';
import { t } from '../i18n.js';

const FOV = 30;
const ELEVATION = THREE.MathUtils.degToRad(13);
const START_AZ = 26; // degrees, seen slightly from the right like the catalogue drawings
const AUTO_DEG_PER_S = 8;
const DEG_PER_PX = 0.4;
const MAX_FLICK = 420; // °/s
const FRICTION = 4.5; // 1/s
const MARGIN = 1.22; // air around the stand, as a multiple of its half height / half width
const MAX_DPR = 2;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function buildStudio(renderer) {
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;
  pmrem.dispose();
  // Cool and restrained, like the catalogue's studio: a white stand keeps its shading instead of burning out.
  scene.add(new THREE.HemisphereLight(0xf4f6f8, 0x8d9095, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 1.35);
  key.position.set(5, 10, 8);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.03;
  Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
  const fill = new THREE.DirectionalLight(0xeaf1ff, 0.35);
  fill.position.set(-7, 5, -6);
  // No floor plane: the card's studio backdrop shows through. A soft pool of light under the stand (the spill of
  // its lightboxes) is what sets it on the ground.
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(7, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      transparent: true, depthWrite: false, toneMapped: false,
      map: kit.canvasTex(256, 256, (g) => {
        const light = g.createRadialGradient(128, 128, 8, 128, 128, 128);
        light.addColorStop(0, 'rgba(244, 246, 248, .34)');
        light.addColorStop(0.55, 'rgba(244, 246, 248, .1)');
        light.addColorStop(1, 'rgba(244, 246, 248, 0)');
        g.fillStyle = light;
        g.fillRect(0, 0, 256, 256);
      }),
    }),
  );
  pool.position.y = 0.002;
  pool.renderOrder = -1;
  scene.add(key, fill, pool);
  return scene;
}

export async function mountRentalViews(hosts, { reducedMotion = false } = {}) {
  if (hosts.some((host) => host.dataset.art)) await artworkReady();
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);
  const scene = buildStudio(renderer);
  const camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.1, 100);
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  let frame = 0;
  let last = 0;

  const views = hosts.map((host) => {
    const model = buildRentalStand(kit, Number(host.dataset.layout), rentalArtwork(kit, host.dataset.art));
    model.visible = false;
    scene.add(model);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    const hint = document.createElement('span');
    hint.className = 'rental-hint';
    hint.textContent = t('Çevirmek için sürükleyin', 'Drag to turn');
    host.append(canvas, hint);
    return {
      host, canvas, hint, model, ctx: canvas.getContext('2d'),
      // The stand turns about its own centre, so its width on screen is at most the footprint's diagonal.
      target: new THREE.Vector3(centre.x, size.y * 0.46, centre.z), halfHeight: size.y / 2, halfWidth: Math.hypot(size.x, size.z) / 2,
      az: START_AZ, vel: 0, auto: !reducedMotion, onScreen: false, dirty: true, pointerId: null, lastX: 0, lastT: 0, w: 0, h: 0,
    };
  });

  function draw(view) {
    const { w, h } = view;
    if (!w || !h) return;
    const size = renderer.getSize(new THREE.Vector2());
    if (size.x !== w || size.y !== h) renderer.setSize(w, h, false);
    const aspect = w / h;
    const half = THREE.MathUtils.degToRad(FOV / 2);
    const fitV = (view.halfHeight * MARGIN) / Math.tan(half);
    const fitH = (view.halfWidth * MARGIN) / (Math.tan(half) * aspect);
    const dist = Math.max(fitV, fitH);
    const az = THREE.MathUtils.degToRad(view.az);
    camera.aspect = aspect;
    camera.position.set(
      view.target.x + dist * Math.sin(az) * Math.cos(ELEVATION),
      view.target.y + dist * Math.sin(ELEVATION),
      view.target.z + dist * Math.cos(az) * Math.cos(ELEVATION),
    );
    camera.lookAt(view.target);
    camera.updateProjectionMatrix();
    for (const other of views) other.model.visible = other === view;
    renderer.render(scene, camera);
    view.ctx.clearRect(0, 0, w, h);
    view.ctx.drawImage(renderer.domElement, 0, 0, w, h);
    view.dirty = false;
  }

  const moving = (view) => view.onScreen && (view.dirty || view.pointerId !== null || view.vel !== 0 || view.auto);
  const schedule = () => { if (!frame) { last = performance.now(); frame = requestAnimationFrame(tick); } };

  function tick(now) {
    frame = 0;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    for (const view of views) {
      if (!moving(view)) continue;
      if (view.pointerId === null) {
        if (view.vel) {
          view.az += view.vel * dt;
          view.vel *= Math.exp(-dt * FRICTION);
          if (Math.abs(view.vel) < 1) view.vel = 0;
        } else if (view.auto) view.az += AUTO_DEG_PER_S * dt;
      }
      draw(view);
    }
    if (views.some(moving)) frame = requestAnimationFrame(tick);
  }

  for (const view of views) {
    const { canvas } = view;
    canvas.addEventListener('pointerdown', (e) => {
      if (view.pointerId !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
      view.pointerId = e.pointerId;
      view.lastX = e.clientX;
      view.lastT = e.timeStamp;
      view.vel = 0;
      view.auto = false;
      canvas.classList.add('is-turning');
      try { canvas.setPointerCapture(e.pointerId); } catch { /* the drag still works inside the canvas */ }
      if (e.pointerType === 'mouse') e.preventDefault();
      schedule();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId !== view.pointerId) return;
      const turn = -(e.clientX - view.lastX) * DEG_PER_PX;
      const dt = Math.max(1, e.timeStamp - view.lastT) / 1000;
      view.az += turn;
      view.vel = clamp(view.vel + (turn / dt - view.vel) * 0.5, -MAX_FLICK, MAX_FLICK);
      view.lastX = e.clientX;
      view.lastT = e.timeStamp;
      view.dirty = true;
      if (turn) views.forEach((v) => v.hint.remove()); // one drag is enough to learn it
    });
    const release = (e) => {
      if (e.pointerId !== view.pointerId) return;
      view.pointerId = null;
      canvas.classList.remove('is-turning');
      if (reducedMotion || e.type === 'pointercancel' || e.timeStamp - view.lastT > 80) view.vel = 0;
      schedule();
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);

    new ResizeObserver(() => {
      view.w = Math.round(view.host.clientWidth * dpr);
      view.h = Math.round(view.host.clientHeight * dpr);
      canvas.width = view.w;
      canvas.height = view.h;
      view.dirty = true;
      schedule();
    }).observe(view.host);
    new IntersectionObserver(([entry]) => {
      view.onScreen = entry.isIntersecting;
      if (view.onScreen) schedule();
    }).observe(view.host);
    view.host.classList.add('is-3d');
  }
}
