// Light-as-narrator effects: floating dust, the maintenance scanner + check marks, soft contact shadows,
// and the lifecycle loop ring that draws itself in the reuse/outro stages. (No sparks: the stand forms calmly.)

import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { PALETTE, lineMaterial } from './materials.js';
import { checkTexture, shadowTexture, softDiscTexture, labelTexture, FONT_MONO } from './textures.js';
import { hash } from './choreo.js';
import { STAGE_NAMES, LOCALE } from '../i18n.js';

const RING_R = 5.0;
const RING_SEGS = 180;
const RING_START = THREE.MathUtils.degToRad(28);

// ── dust ──────────────────────────────────────────────────────────────────────────────────
function buildDust(count, disc) {
  const base = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = 2 + hash(i * 3.1) * 6.5;
    const a = hash(i * 7.3) * Math.PI * 2;
    base.set([Math.cos(a) * r, 0.2 + hash(i * 1.9) * 4.8, Math.sin(a) * r], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(base.slice(), 3));
  const mat = new THREE.PointsMaterial({ map: disc, color: 0x8a7e70, size: 0.045, transparent: true, opacity: 0.35, depthWrite: false });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  function update(time) {
    const p = geo.attributes.position.array;
    for (let i = 0; i < count; i++) {
      const s = hash(i + 0.7);
      p[i * 3] = base[i * 3] + Math.sin(time * 0.11 + s * 20) * 0.35;
      p[i * 3 + 1] = base[i * 3 + 1] + Math.sin(time * 0.07 + s * 13) * 0.25;
      p[i * 3 + 2] = base[i * 3 + 2] + Math.cos(time * 0.09 + s * 17) * 0.35;
    }
    geo.attributes.position.needsUpdate = true;
  }
  return { obj: pts, update };
}

// ── scanner + checks ──────────────────────────────────────────────────────────────────────
function scannerTexture() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 256, 0, 0);
  grd.addColorStop(0, 'rgba(56,214,255,0.85)');
  grd.addColorStop(0.08, 'rgba(56,214,255,0.35)');
  grd.addColorStop(1, 'rgba(56,214,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildScanner() {
  const group = new THREE.Group();
  const sheetMat = new THREE.MeshBasicMaterial({ map: scannerTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0 });
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(10.5, 1.6), sheetMat);
  sheet.rotation.y = Math.PI / 2;
  sheet.position.set(0, 0.8, 0.1);
  const lineGeo = new LineSegmentsGeometry().setPositions(new Float32Array([0, 0.01, -5.1, 0, 0.01, 5.3]));
  const lineMat = lineMaterial({ color: 0xffffff, width: 2.6, opacity: 0 });
  lineMat.color.set(PALETTE.cyan).multiplyScalar(2.6);
  group.add(sheet, new LineSegments2(lineGeo, lineMat));
  return {
    obj: group,
    update(scan) {
      group.visible = scan.alpha > 0.004;
      group.position.x = scan.x;
      sheetMat.opacity = scan.alpha * 0.9;
      lineMat.opacity = scan.alpha;
    },
  };
}

function buildChecks(n) {
  const tex = checkTexture();
  const sprites = Array.from({ length: n }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    s.visible = false;
    return s;
  });
  const group = new THREE.Group();
  sprites.forEach((s) => group.add(s));
  return {
    obj: group,
    update(entries) {
      entries.forEach(({ check, pos, lift }, i) => {
        const s = sprites[i];
        s.visible = check > 0.01;
        if (!s.visible) return;
        const pop = 1 + 0.35 * Math.sin(Math.PI * Math.min(1, check * 1.2));
        s.scale.setScalar(0.32 * Math.min(1, check * 1.6) * pop);
        s.position.set(pos[0], pos[1] + lift, pos[2]);
        s.material.opacity = Math.min(1, check * 1.5);
      });
    },
  };
}

// ── contact shadows ───────────────────────────────────────────────────────────────────────
function buildShadows(n) {
  const tex = shadowTexture();
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const meshes = Array.from({ length: n }, () => {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x2a241e, map: tex, transparent: true, depthWrite: false, opacity: 0 }));
    m.renderOrder = -1;
    return m;
  });
  const group = new THREE.Group();
  meshes.forEach((m) => group.add(m));
  return {
    obj: group,
    /** entries: [{ x, y, z, w, d, ry, opacity }] */
    update(entries) {
      meshes.forEach((m, i) => {
        const e = entries[i];
        m.visible = Boolean(e) && e.opacity > 0.004;
        if (!m.visible) return;
        m.position.set(e.x, e.y, e.z);
        m.scale.set(e.w, 1, e.d);
        m.rotation.y = e.ry || 0;
        m.material.opacity = e.opacity;
      });
    },
  };
}

// ── lifecycle ring ────────────────────────────────────────────────────────────────────────
function buildRing(disc) {
  const group = new THREE.Group();
  const segs = [];
  const cols = [];
  const stops = [new THREE.Color(PALETTE.cyan), new THREE.Color(PALETTE.violet), new THREE.Color(PALETTE.pink), new THREE.Color(PALETTE.cyan)];
  const at = (u) => {
    const th = RING_START + u * Math.PI * 2;
    return [Math.sin(th) * RING_R, 0.025, Math.cos(th) * RING_R];
  };
  const colorAt = (u) => {
    const f = u * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(f));
    return stops[i].clone().lerp(stops[i + 1], f - i);
  };
  for (let i = 0; i < RING_SEGS; i++) {
    segs.push(...at(i / RING_SEGS), ...at((i + 1) / RING_SEGS));
    const c0 = colorAt(i / RING_SEGS);
    const c1 = colorAt((i + 1) / RING_SEGS);
    cols.push(c0.r, c0.g, c0.b, c1.r, c1.g, c1.b);
  }
  const geo = new LineSegmentsGeometry().setPositions(new Float32Array(segs));
  geo.setColors(new Float32Array(cols));
  const mat = lineMaterial({ color: 0xffffff, width: 2.4, opacity: 0, vertexColors: true });
  mat.color.setScalar(2.3);
  const ring = new LineSegments2(geo, mat);
  group.add(ring);

  const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: disc, color: new THREE.Color(PALETTE.cyan).multiplyScalar(3), transparent: true, depthWrite: false }));
  head.scale.setScalar(0.5);
  group.add(head);

  const tickSegs = [];
  const labels = STAGE_NAMES.map((name, i) => {
    const u = i / STAGE_NAMES.length;
    const th = RING_START + u * Math.PI * 2;
    const r0 = RING_R - 0.12;
    const r1 = RING_R + 0.12;
    tickSegs.push(Math.sin(th) * r0, 0.02, Math.cos(th) * r0, Math.sin(th) * r1, 0.02, Math.cos(th) * r1);
    const { texture, aspect } = labelTexture(`${String(i + 1).padStart(2, '0')} ${name.toLocaleUpperCase(LOCALE)}`, {
      font: `500 56px ${FONT_MONO}`, color: '#3B3630', tracking: 5,
    });
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0 }));
    s.scale.set(0.36 * aspect, 0.36, 1);
    const rl = RING_R + 0.95;
    s.position.set(Math.sin(th) * rl, 0.2, Math.cos(th) * rl);
    group.add(s);
    return { sprite: s, u };
  });
  const tickGeo = new LineSegmentsGeometry().setPositions(new Float32Array(tickSegs));
  const tickMat = lineMaterial({ color: PALETTE.ink, width: 1.2, opacity: 0 });
  group.add(new LineSegments2(tickGeo, tickMat));

  return {
    obj: group,
    update(draw, alpha) {
      group.visible = alpha > 0.004 && draw > 0.001;
      if (!group.visible) return;
      geo.instanceCount = Math.max(1, Math.ceil(RING_SEGS * draw));
      mat.opacity = alpha;
      tickMat.opacity = 0.55 * alpha;
      const hp = at(draw);
      head.position.set(hp[0], hp[1] + 0.02, hp[2]);
      head.visible = draw < 0.995;
      head.material.opacity = alpha;
      for (const l of labels) {
        const a = THREE.MathUtils.smoothstep(draw, l.u, l.u + 0.06) * alpha;
        l.sprite.material.opacity = a;
        l.sprite.visible = a > 0.004;
      }
    },
  };
}

export function buildFx({ quality, compact = false, partCount, shadowCount }) {
  const disc = softDiscTexture(1.8);
  const lean = quality === 'low' || compact;
  const dust = buildDust(lean ? 160 : 420, disc);
  const scanner = buildScanner();
  const checks = buildChecks(partCount);
  const shadows = buildShadows(shadowCount);
  const ring = buildRing(disc);
  const group = new THREE.Group();
  group.name = 'fx';
  group.add(dust.obj, scanner.obj, checks.obj, shadows.obj, ring.obj);
  return { group, dust, scanner, checks, shadows, ring };
}

