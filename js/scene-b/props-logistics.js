// Logistics props: cardboard boxes (NLS-0x), warehouse rack, stylised flatbed truck, the İstanbul → Ankara → Antalya
// road (asphalt ribbon, painted edge + centre lines, a quiet progress trace) and the congress-hall floor.
// Nothing here glows: the neon is reserved for the stand's first ignition at the Kurulum climax.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { PALETTE, lineMaterial, softHighlights } from './materials.js';
import { labelTexture, logoTexture, FONT_MONO } from './textures.js';
import { t } from '../i18n.js';
import { CRATE, CRATE_COUNT, RACK, TRUCK, CITIES } from './layout.js';
import { PATHS } from './choreo.js';

const [CW, CH, CD] = CRATE;
const WALL = 0.045;
const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const TAPE_COLOR = 0xc2468f; // printed brand tape on the boxes (LDR — not a light source)
const CARDBOARD = 0xc9a678;
const CARDBOARD_INNER = 0xa98659;
const ROAD = Object.freeze({ width: 2.5, color: 0xd3c9b9, paint: 0xfaf7f1, edgeInset: 0.16, edgeW: 0.05, dashW: 0.075, dashOn: 0.62, dashOff: 0.5, trailW: 0.13, fade: 4.5 });

function fadeable(mats, alpha) {
  for (const m of mats) {
    const base = m.userData.baseOpacity ?? 1;
    const alphaMapped = Boolean(m.map);
    m.opacity = alpha * base;
    m.transparent = alphaMapped || alpha < 0.999 || base < 1;
    m.depthWrite = !alphaMapped && alpha > 0.6;
  }
}

// ── boxes ─────────────────────────────────────────────────────────────────────────────────
function crateGeometries() {
  const shell = mergeGeometries([
    box(CW, WALL, CD, 0, -CH / 2 + WALL / 2, 0),
    box(CW, CH - WALL, WALL, 0, WALL / 2, CD / 2 - WALL / 2),
    box(CW, CH - WALL, WALL, 0, WALL / 2, -CD / 2 + WALL / 2),
    box(WALL, CH - WALL, CD - 2 * WALL, CW / 2 - WALL / 2, WALL / 2, 0),
    box(WALL, CH - WALL, CD - 2 * WALL, -CW / 2 + WALL / 2, WALL / 2, 0),
  ]);
  return {
    shell,
    lid: new RoundedBoxGeometry(CW, 0.06, CD, 2, 0.012).translate(0, 0.03, CD / 2),
    inner: box(CW - 2 * WALL, 0.01, CD - 2 * WALL, 0, -CH / 2 + WALL + 0.006, 0),
  };
}

function buildCrates() {
  const geo = crateGeometries();
  const crates = [];
  for (let i = 0; i < CRATE_COUNT; i++) {
    const group = new THREE.Group();
    // Plain cardboard boxes (client: "koli", not armoured flight cases) — kraft board, no metal hardware.
    const shellMat = softHighlights(new THREE.MeshStandardMaterial({ color: CARDBOARD, roughness: 0.92, metalness: 0 }));
    const innerMat = new THREE.MeshStandardMaterial({ color: CARDBOARD_INNER, roughness: 0.95 });
    group.add(new THREE.Mesh(geo.shell, shellMat), new THREE.Mesh(geo.inner, innerMat));
    const hinge = new THREE.Group();
    hinge.position.set(0, CH / 2, -CD / 2);
    hinge.add(new THREE.Mesh(geo.lid, shellMat));
    group.add(hinge);
    const name = `NLS-0${i + 1}`;
    const { texture, aspect } = labelTexture(name, { font: `500 64px ${FONT_MONO}`, color: '#3A2E22', tracking: 6 });
    const labelMat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.16 * aspect, 0.16), labelMat);
    label.position.set(-CW / 2 + 0.1 + 0.08 * aspect, 0.06, CD / 2 + 0.003);
    group.add(label);
    const tapeMat = new THREE.MeshBasicMaterial({ color: TAPE_COLOR, transparent: true });
    const tape = new THREE.Mesh(box(CW - 0.24, 0.012, 0.006), tapeMat);
    tape.position.set(0, -0.08, CD / 2 + 0.004);
    group.add(tape);
    crates.push({ group, hinge, mats: [shellMat, innerMat, labelMat, tapeMat] });
  }
  return crates;
}

// ── rack ──────────────────────────────────────────────────────────────────────────────────
function buildRack() {
  const parts = [];
  const w = RACK.bays * RACK.bay;
  for (let b = 0; b <= RACK.bays; b++) {
    const x = RACK.x0 + b * RACK.bay;
    for (const dz of [-RACK.depth / 2, RACK.depth / 2]) parts.push(box(0.07, RACK.height, 0.07, x, RACK.height / 2, RACK.z + dz));
    for (let k = 0; k < 4; k++) parts.push(box(0.03, 0.03, RACK.depth, x, 0.35 + k * 0.55, RACK.z));
  }
  const beams = [];
  for (const lv of [...RACK.levels, RACK.height - 0.05]) {
    for (const dz of [-RACK.depth / 2, RACK.depth / 2]) beams.push(box(w, 0.08, 0.05, RACK.x0 + w / 2, lv - 0.04, RACK.z + dz));
  }
  const frameMat = softHighlights(new THREE.MeshStandardMaterial({ color: PALETTE.graphite, roughness: 0.5, metalness: 0.4 }));
  const beamMat = softHighlights(new THREE.MeshStandardMaterial({ color: 0x9c9285, roughness: 0.45, metalness: 0.2 }));
  const group = new THREE.Group();
  group.add(new THREE.Mesh(mergeGeometries(parts), frameMat), new THREE.Mesh(mergeGeometries(beams), beamMat));
  const { texture, aspect } = labelTexture(t('DEPO · NLS', 'WAREHOUSE · NLS'), { font: `500 64px ${FONT_MONO}`, color: '#5E574D', tracking: 8 });
  const signMat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.2 * aspect, 0.2), signMat);
  sign.position.set(RACK.x0 + 0.1 + 0.1 * aspect, RACK.height + 0.16, RACK.z + RACK.depth / 2);
  group.add(sign);
  return { group, mats: [frameMat, beamMat, signMat] };
}

// ── truck ─────────────────────────────────────────────────────────────────────────────────
function buildTruck() {
  const group = new THREE.Group();
  const white = softHighlights(new THREE.MeshPhysicalMaterial({ color: PALETTE.lacquer, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.1 }));
  const dark = softHighlights(new THREE.MeshStandardMaterial({ color: PALETTE.charcoal, roughness: 0.6 }));
  const glass = softHighlights(new THREE.MeshStandardMaterial({ color: 0x1c2228, roughness: 0.1, metalness: 0.4 }));
  const deckMat = softHighlights(new THREE.MeshStandardMaterial({ color: 0x4a443d, roughness: 0.7 }));
  const cabX = TRUCK.bedX1 + 0.75;
  group.add(new THREE.Mesh(new RoundedBoxGeometry(1.35, 1.75, TRUCK.width, 3, 0.12).translate(cabX, 0.45 + 0.875, 0), white));
  group.add(new THREE.Mesh(box(0.08, 0.55, TRUCK.width - 0.2, cabX + 0.64, 1.62, 0), glass));
  group.add(new THREE.Mesh(box(0.9, 0.42, 0.02, cabX + 0.05, 1.66, TRUCK.width / 2 + 0.002), glass));
  group.add(new THREE.Mesh(box(0.9, 0.42, 0.02, cabX + 0.05, 1.66, -TRUCK.width / 2 - 0.002), glass));
  const bedLen = TRUCK.bedX1 - TRUCK.bedX0;
  group.add(new THREE.Mesh(box(bedLen + 1.6, 0.26, 1.2, (TRUCK.bedX0 + cabX + 0.6) / 2, 0.5, 0), dark));
  group.add(new THREE.Mesh(box(bedLen, 0.1, TRUCK.width, (TRUCK.bedX0 + TRUCK.bedX1) / 2, TRUCK.deckY - 0.05, 0), deckMat));
  const wheels = [];
  for (const x of [TRUCK.bedX0 + 0.5, TRUCK.bedX0 + 1.4, cabX + 0.2]) {
    for (const s of [-1, 1]) wheels.push(new THREE.CylinderGeometry(0.4, 0.4, 0.3, 20).rotateX(Math.PI / 2).translate(x, 0.4, s * (TRUCK.width / 2 - 0.12)));
  }
  group.add(new THREE.Mesh(mergeGeometries(wheels), dark));
  const lamp = new THREE.MeshBasicMaterial({ color: 0xfff4dc, transparent: true });
  for (const s of [-1, 1]) group.add(new THREE.Mesh(box(0.03, 0.1, 0.24, cabX + 0.68, 0.72, s * 0.66), lamp));
  const { texture, aspect } = logoTexture('#1B1916');
  const lblMat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
  for (const s of [-1, 1]) {
    const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.2 * aspect, 0.2), lblMat);
    lbl.position.set(cabX - 0.1, 1.05, s * (TRUCK.width / 2 + 0.004));
    lbl.rotation.y = s > 0 ? 0 : Math.PI;
    group.add(lbl);
  }
  return { group, mats: [white, dark, glass, deckMat, lblMat, lamp] };
}

// ── road, cities, progress trace ─────────────────────────────────────────────────────────
/** Arc-length sampler over a dense XZ polyline: at(s) → { x, z, nx, nz } (unit left normal). */
function sampler(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const length = cum[cum.length - 1];
  function at(s) {
    const t = Math.min(length, Math.max(0, s));
    let i = 1;
    while (i < cum.length - 1 && cum[i] < t) i++;
    const f = (t - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
    const a = pts[i - 1];
    const b = pts[i];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    return { x: a[0] + dx * f, z: a[1] + dz * f, nx: -dz / l, nz: dx / l };
  }
  return { at, length };
}

/**
 * Flat ribbon along the road between arc lengths s0..s1, centred `off` metres left of the centre line.
 * `alphaAt(s)` (optional) writes RGBA vertex colours (white × alpha) so the ribbon can fade out.
 */
function ribbon(road, s0, s1, off, width, y, step = 0.12, out = { pos: [], idx: [], col: [] }, alphaAt = null) {
  const n = Math.max(1, Math.ceil((s1 - s0) / step));
  const base = out.pos.length / 3;
  for (let k = 0; k <= n; k++) {
    const s = s0 + ((s1 - s0) * k) / n;
    const p = road.at(s);
    const l = off + width / 2;
    const r = off - width / 2;
    out.pos.push(p.x + p.nx * l, y, p.z + p.nz * l, p.x + p.nx * r, y, p.z + p.nz * r);
    if (alphaAt) { const a = alphaAt(s); out.col.push(1, 1, 1, a, 1, 1, 1, a); }
    if (k > 0) { const i = base + k * 2; out.idx.push(i - 2, i - 1, i, i - 1, i + 1, i); }
  }
  return out;
}

function meshFrom({ pos, idx, col }, material, renderOrder) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (col && col.length) geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  geo.setIndex(idx);
  const m = new THREE.Mesh(geo, material);
  m.renderOrder = renderOrder;
  m.frustumCulled = false;
  return m;
}

function buildRoute() {
  const group = new THREE.Group();
  // The road is laid along the whole truck path but fades out a few metres beyond İstanbul and Antalya, so it
  // reads as a highway passing through the cities rather than a cut-out strip.
  const full = sampler(PATHS.full.pts);
  const s0 = PATHS.mainU[0] * full.length;
  const s1 = PATHS.mainU[1] * full.length;
  const a0 = Math.max(0, s0 - ROAD.fade);
  const a1 = Math.min(full.length, s1 + ROAD.fade);
  const soft = (t) => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };
  const alphaAt = (s) => soft((s - a0) / ROAD.fade) * soft((a1 - s) / ROAD.fade);
  const flatMat = (color, base) => {
    const m = new THREE.MeshBasicMaterial({ color, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    m.userData.baseOpacity = base;
    return m;
  };
  const asphaltMat = flatMat(ROAD.color, 1);
  group.add(meshFrom(ribbon(full, a0, a1, 0, ROAD.width, 0.006, 0.1, undefined, alphaAt), asphaltMat, -3));

  const paint = { pos: [], idx: [], col: [] };
  const edgeOff = ROAD.width / 2 - ROAD.edgeInset;
  ribbon(full, a0, a1, edgeOff, ROAD.edgeW, 0.014, 0.1, paint, alphaAt);
  ribbon(full, a0, a1, -edgeOff, ROAD.edgeW, 0.014, 0.1, paint, alphaAt);
  for (let s = a0 + 0.3; s < a1 - 0.3; s += ROAD.dashOn + ROAD.dashOff) {
    ribbon(full, s, Math.min(a1, s + ROAD.dashOn), 0, ROAD.dashW, 0.014, 0.1, paint, alphaAt);
  }
  const paintMat = flatMat(ROAD.paint, 1);
  group.add(meshFrom(paint, paintMat, -2));

  const road = sampler(PATHS.main.pts);
  // Progress trace: a thin brand-gradient line laid on the centre line behind the truck (LDR — no bloom).
  const TRACE_STEP = 0.1;
  const trace = ribbon(road, 0, road.length, 0, ROAD.trailW, 0.022, TRACE_STEP);
  const cols = [];
  const pink = new THREE.Color(0xd8418f);
  const violet = new THREE.Color(0x7f63d9);
  const cyan = new THREE.Color(0x2aa7d6);
  const rows = trace.pos.length / 6;
  for (let k = 0; k < rows; k++) {
    const u = k / Math.max(1, rows - 1);
    const c = u < 0.5 ? pink.clone().lerp(violet, u * 2) : violet.clone().lerp(cyan, (u - 0.5) * 2);
    cols.push(c.r, c.g, c.b, c.r, c.g, c.b);
  }
  const traceMesh = meshFrom(trace, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }), -1);
  traceMesh.geometry.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  group.add(traceMesh);
  const traceRows = rows - 1;

  const cityGroups = [];
  const hues = [0xc9408c, 0x7f63d9, 0x2aa7d6];
  CITIES.forEach((city, i) => {
    const [x, z] = city.pos;
    const ringMat = new THREE.MeshBasicMaterial({ color: PALETTE.ink, transparent: true, side: THREE.DoubleSide, depthWrite: false });
    ringMat.userData.baseOpacity = 0.7;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.38, 48).rotateX(-Math.PI / 2), ringMat);
    ring.position.set(x, 0.03, z); // above road paint (0.014) and trace (0.022)
    const dotMat = new THREE.MeshBasicMaterial({ color: hues[i], transparent: true, side: THREE.DoubleSide, depthWrite: false });
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.15, 32).rotateX(-Math.PI / 2), dotMat);
    dot.position.set(x, 0.034, z);
    const stemMat = new THREE.MeshBasicMaterial({ color: PALETTE.ink2, transparent: true });
    stemMat.userData.baseOpacity = 0.55;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.1, 4), stemMat);
    stem.position.set(x, 0.55, z);
    const { texture, aspect } = labelTexture(t(city.name, city.name.replace('İ', 'I')), { font: `500 60px ${FONT_MONO}`, color: '#1B1916', tracking: 8 });
    const lblMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
    const lbl = new THREE.Sprite(lblMat);
    lbl.scale.set(0.62 * aspect, 0.62, 1);
    lbl.position.set(x + city.label[0], 1.3, z + city.label[1]);
    const marker = new THREE.Group();
    marker.add(ring, dot, stem, lbl);
    group.add(marker);
    cityGroups.push({ group: marker, mats: [ringMat, dotMat, stemMat, lblMat] });
  });

  function update(alpha, trailU, cities) {
    group.visible = alpha > 0.004;
    if (!group.visible) return;
    // Flat map layers stay in the transparent pass (depthWrite off) and stack by renderOrder — no z-fighting.
    for (const m of [asphaltMat, paintMat]) m.opacity = alpha * m.userData.baseOpacity;
    cityGroups.forEach((c, i) => {
      const a = alpha * cities[i];
      c.group.visible = a > 0.004;
      fadeable(c.mats, a);
    });
    const n = Math.floor(traceRows * trailU);
    traceMesh.visible = n > 0;
    traceMesh.geometry.setDrawRange(0, n * 6);
    traceMesh.material.opacity = alpha;
  }
  return { group, update };
}

// ── hall floor ────────────────────────────────────────────────────────────────────────────
function buildHall() {
  const group = new THREE.Group();
  const floorMat = new THREE.MeshBasicMaterial({ color: PALETTE.cream2, transparent: true, depthWrite: false });
  floorMat.userData.baseOpacity = 0.6;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(15.5, 11.5).rotateX(-Math.PI / 2), floorMat);
  floor.position.set(1.4, 0.001, 0.1);
  floor.renderOrder = -3;
  group.add(floor);
  const x0 = 1.4 - 7.75;
  const x1 = 1.4 + 7.75;
  const z0 = 0.1 - 5.75;
  const z1 = 0.1 + 5.75;
  const edge = [[x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]].map(([a, b, c, d]) => [a, 0.004, b, c, 0.004, d]);
  const lineGeo = new LineSegmentsGeometry().setPositions(new Float32Array(edge.flat()));
  const lineMat = lineMaterial({ color: PALETTE.ink, width: 1.0, opacity: 0 });
  group.add(new LineSegments2(lineGeo, lineMat));
  const { texture, aspect } = labelTexture(t('KONGRE ALANI', 'CONGRESS HALL'), { font: `500 60px ${FONT_MONO}`, color: '#5E574D', tracking: 10 });
  const lblMat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
  const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.3 * aspect, 0.3).rotateX(-Math.PI / 2), lblMat);
  lbl.position.set(x0 + 0.25 + 0.15 * aspect, 0.005, z1 - 0.4);
  group.add(lbl);
  return {
    group,
    update(alpha) {
      group.visible = alpha > 0.004;
      fadeable([floorMat, lblMat], alpha);
      lineMat.opacity = 0.22 * alpha;
    },
  };
}

export function buildLogistics() {
  const group = new THREE.Group();
  group.name = 'logistics';
  const crates = buildCrates();
  crates.forEach((c) => group.add(c.group));
  const rack = buildRack();
  const truck = buildTruck();
  const route = buildRoute();
  const hall = buildHall();
  group.add(rack.group, truck.group, route.group, hall.group);

  function update({ cratePoses, truck: tp, props }) {
    crates.forEach((c, i) => {
      const p = cratePoses[i];
      c.group.visible = p.visible;
      if (!p.visible) return;
      c.group.position.set(p.pos[0], p.pos[1], p.pos[2]);
      c.group.rotation.set(0, p.rot[1], 0);
      c.group.scale.setScalar(p.k);
      c.hinge.rotation.x = -p.lid * 1.95;
    });
    rack.group.visible = props.rack > 0.004;
    fadeable(rack.mats, props.rack);
    truck.group.visible = tp.visible;
    if (tp.visible) {
      truck.group.position.set(tp.pos[0], 0, tp.pos[2]);
      truck.group.rotation.set(0, tp.yaw, 0);
      fadeable(truck.mats, tp.alpha);
    }
    route.update(props.map, props.trail, props.cities);
    hall.update(props.hall);
  }
  return { group, update };
}
