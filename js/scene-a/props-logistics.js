// Depolama / Nakliye props: flight cases (instanced), warehouse rack, box truck, road, route map.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { CRATE_DIMS, CRATE_COUNT } from './choreo.js';
import { cratePose, truckState, TRUCK_Z, TRAILER_BED, RACK_SHELF_Y } from './choreo-props.js';
import { glowMaterial, decalMaterial, lineMaterial, NEON_HDR, COLORS } from './materials.js';
import { crateLabelAtlas, labelTexture, roadTexture, shadowTexture } from './textures.js';
import { transformed } from './stand-kit.js';

const BODY_H = CRATE_DIMS.h - 0.12;
const LID_H = 0.12;
const CORNER = 0.09;
const WHEEL_R = 0.42;
const TRAILER = { x0: -3.1, x1: 1.6, h: 1.9, w: 2.0 };
// side: which side of the node the label sits on (-1 left, 1 right) — İstanbul's route leaves eastward.
const CITIES = [
  { name: 'İSTANBUL', x: -2.3, z: -0.95, side: -1 },
  { name: 'ANKARA', x: 2.2, z: 0.15, side: 1 },
  { name: 'ANTALYA', x: -0.3, z: 3.0, side: 1 },
];

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

function compose(pos, rot, scale) {
  _e.set(rot[0], rot[1], rot[2]);
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_v.set(...pos), _q, _s.set(...scale));
}

// ── crates ──────────────────────────────────────────────────────────────────
function crateParts() {
  const { w, d } = CRATE_DIMS;
  const corners = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    corners.push({ lid: false, pos: [sx * (w / 2 - CORNER / 2 + 0.01), -CRATE_DIMS.h / 2 + CORNER / 2 - 0.01, sz * (d / 2 - CORNER / 2 + 0.01)] });
    corners.push({ lid: true, pos: [sx * (w / 2 - CORNER / 2 + 0.01), LID_H / 2 - CORNER / 2 + 0.01, sz * (d / 2 - CORNER / 2 + 0.01)] });
  }
  return corners;
}

function labelGeometry(k) {
  const geo = new THREE.PlaneGeometry(0.46, 0.165);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, (CRATE_COUNT - 1 - k + uv.getY(i)) / CRATE_COUNT);
  return geo;
}

/** Removable lid: 0 closed on the case … 1 lifted off and laid flat on the floor in front (keeps the view clear). */
function liftedLid(open) {
  const u = open * open * (3 - 2 * open);
  const closedY = CRATE_DIMS.h / 2 - LID_H / 2;
  const floorY = -CRATE_DIMS.h / 2 + LID_H / 2 + 0.004;
  const y = closedY + (floorY - closedY) * u + 0.55 * Math.sin(Math.PI * u);
  const z = (CRATE_DIMS.d / 2 + 0.7) * u;
  return compose([0, y, z], [-0.45 * Math.sin(Math.PI * u), 0, 0], [1, 1, 1]);
}

export function createCrates(base) {
  const group = new THREE.Group();
  group.name = 'crates';
  const { w, d } = CRATE_DIMS;
  const shell = new THREE.MeshStandardMaterial({ color: '#2B2A28', roughness: 0.5, metalness: 0.15 });
  const body = new THREE.InstancedMesh(new RoundedBoxGeometry(w, BODY_H, d, 2, 0.025), shell, CRATE_COUNT);
  const lid = new THREE.InstancedMesh(new RoundedBoxGeometry(w, LID_H, d, 2, 0.025), shell, CRATE_COUNT);
  const cornerDefs = crateParts();
  const corners = new THREE.InstancedMesh(new THREE.BoxGeometry(CORNER, CORNER, CORNER), base.metal, CRATE_COUNT * cornerDefs.length);
  const seam = new THREE.InstancedMesh(new THREE.BoxGeometry(w + 0.012, 0.028, d + 0.012), base.metal, CRATE_COUNT);
  const strip = new THREE.InstancedMesh(new THREE.BoxGeometry(0.46, 0.014, 0.01), glowMaterial({ on: new THREE.Vector3(1.5, 0.04, 0.42) }), CRATE_COUNT);
  const atlas = crateLabelAtlas(CRATE_COUNT);
  const labelMat = new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.7 });
  const labels = Array.from({ length: CRATE_COUNT }, (_, k) => new THREE.Mesh(labelGeometry(k), labelMat));
  const shadowMat = decalMaterial(shadowTexture('rect'), { opacity: 0.55 });
  const shadow = new THREE.InstancedMesh(new THREE.PlaneGeometry(w * 1.7, d * 1.7).rotateX(-Math.PI / 2), shadowMat, CRATE_COUNT);
  shadow.renderOrder = -1;
  for (const m of [body, lid, corners, seam, strip, shadow]) { m.frustumCulled = false; group.add(m); }
  group.add(...labels);

  function update(P) {
    let visibleAny = false;
    for (let k = 0; k < CRATE_COUNT; k++) {
      const c = cratePose(k, P);
      const s = c.visible ? Math.max(c.s, 1e-4) : 1e-4;
      visibleAny = visibleAny || c.visible;
      const root = compose([c.x, c.y, c.z], [0, 0, 0], [s, s, s]);
      const set = (mesh, i, local) => { _m.multiplyMatrices(root, local); mesh.setMatrixAt(i, _m); };
      const lidLocal = liftedLid(c.lid);
      set(body, k, compose([0, -CRATE_DIMS.h / 2 + BODY_H / 2, 0], [0, 0, 0], [1, 1, 1]));
      set(lid, k, lidLocal);
      set(seam, k, compose([0, CRATE_DIMS.h / 2 - LID_H - 0.004, 0], [0, 0, 0], [1, 1, 1]));
      set(strip, k, compose([0, 0.02, d / 2 + 0.006], [0, 0, 0], [1, 1, 1]));
      cornerDefs.forEach((cd, j) => {
        const local = cd.lid ? new THREE.Matrix4().multiplyMatrices(lidLocal, compose(cd.pos, [0, 0, 0], [1, 1, 1])) : compose(cd.pos, [0, 0, 0], [1, 1, 1]);
        set(corners, k * cornerDefs.length + j, local);
      });
      const ground = c.y < CRATE_DIMS.h / 2 + 0.05 ? s : 0;
      shadow.setMatrixAt(k, compose([c.x, 0.003, c.z], [0, 0, 0], [ground, 1, ground || 1e-4]));
      const label = labels[k];
      label.visible = c.visible;
      label.position.set(c.x, c.y - 0.12 * s, c.z + (d / 2 + 0.004) * s);
      label.scale.setScalar(s);
    }
    for (const m of [body, lid, corners, seam, strip, shadow]) m.instanceMatrix.needsUpdate = true;
    group.visible = visibleAny;
  }

  return { group, update };
}

// ── rack ────────────────────────────────────────────────────────────────────
export function createRack() {
  const post = new THREE.BoxGeometry(0.06, 2.45, 0.06);
  const list = [];
  const xs = [-2.6, -1.3, 0, 1.3, 2.6];
  for (const x of xs) for (const z of [-0.62, 0.62]) list.push({ geo: post, pos: [x, 1.225, z] });
  const board = new THREE.BoxGeometry(5.32, 0.04, 1.3);
  for (const y of [...RACK_SHELF_Y, 2.34]) list.push({ geo: board, pos: [0, y - 0.02, 0] });
  const rail = new THREE.BoxGeometry(5.32, 0.08, 0.05);
  for (const y of [...RACK_SHELF_Y, 2.34]) for (const z of [-0.64, 0.64]) list.push({ geo: rail, pos: [0, y - 0.06, z] });
  const mat = new THREE.MeshStandardMaterial({ color: '#BDB7AE', roughness: 0.55, metalness: 0.35 });
  const mesh = new THREE.Mesh(mergeGeometries(transformed(list)), mat);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 2.2).rotateX(-Math.PI / 2), decalMaterial(shadowTexture('rect'), { opacity: 0.45 }));
  shadow.position.y = 0.002;
  const group = new THREE.Group();
  group.name = 'rack';
  group.add(mesh, shadow);
  return {
    group,
    update(rise) {
      group.visible = rise > 0.001;
      mesh.scale.set(1, Math.max(rise, 1e-3), 1);
      shadow.material.opacity = 0.45 * rise;
    },
  };
}

// ── truck ───────────────────────────────────────────────────────────────────
function truckBody(base) {
  const group = new THREE.Group();
  const white = base.lacquer;
  const add = (geo, mat, pos) => { const m = new THREE.Mesh(geo, mat); m.position.set(...pos); group.add(m); return m; };
  const len = TRAILER.x1 - TRAILER.x0;
  const cx = (TRAILER.x0 + TRAILER.x1) / 2;
  const yTop = TRAILER_BED + TRAILER.h;
  add(new THREE.BoxGeometry(6.6, 0.22, 1.5), base.dark, [0.05, 0.72, 0]);
  add(new THREE.BoxGeometry(len, 0.1, TRAILER.w), white, [cx, TRAILER_BED - 0.05, 0]);
  add(new THREE.BoxGeometry(len, TRAILER.h, 0.05), white, [cx, TRAILER_BED + TRAILER.h / 2, -TRAILER.w / 2]);
  add(new THREE.BoxGeometry(0.06, TRAILER.h, TRAILER.w), white, [TRAILER.x1, TRAILER_BED + TRAILER.h / 2, 0]);
  add(new THREE.BoxGeometry(len, 0.07, TRAILER.w), white, [cx, yTop, 0]);
  add(new THREE.BoxGeometry(len, 0.22, 0.05), white, [cx, yTop - 0.14, TRAILER.w / 2]);
  add(new THREE.BoxGeometry(len, 0.012, 0.012), glowMaterial({ on: new THREE.Vector3(1.4, 0.04, 0.4) }), [cx, yTop - 0.26, TRAILER.w / 2 + 0.02]);
  for (const x of [TRAILER.x0 + 0.03, cx]) add(new THREE.BoxGeometry(0.06, TRAILER.h, 0.06), base.metal, [x, TRAILER_BED + TRAILER.h / 2, TRAILER.w / 2]);
  const cab = add(new RoundedBoxGeometry(1.55, 1.95, 2.0, 3, 0.12), white, [2.55, 1.55, 0]);
  cab.name = 'cab';
  add(new THREE.BoxGeometry(0.02, 0.72, 1.7), base.dark, [3.33, 1.95, 0]);
  add(new THREE.BoxGeometry(0.8, 0.6, 0.02), base.dark, [2.75, 1.95, 1.005]);
  add(new THREE.BoxGeometry(0.8, 0.6, 0.02), base.dark, [2.75, 1.95, -1.005]);
  const { texture, aspect } = labelTexture('nilus design', { font: 'serif', weight: 600, size: 80, spacing: 0.02 });
  const word = new THREE.Mesh(new THREE.PlaneGeometry(0.2 * aspect, 0.2), decalMaterial(texture));
  word.position.set(cx - len * 0.28, yTop - 0.14, TRAILER.w / 2 + 0.03);
  group.add(word);
  return group;
}

export function createTruck(base) {
  const group = new THREE.Group();
  group.name = 'truck';
  const body = truckBody(base);
  const wheelGeo = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.3, 28).rotateX(Math.PI / 2);
  const tyre = new THREE.MeshStandardMaterial({ color: '#232120', roughness: 0.8 });
  const axles = [2.55, -1.55, -2.45];
  const wheels = new THREE.InstancedMesh(wheelGeo, tyre, axles.length * 2);
  const hubs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.16, 0.32, 16).rotateX(Math.PI / 2), base.metal, axles.length * 2);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(8.2, 2.9).rotateX(-Math.PI / 2), decalMaterial(shadowTexture('rect'), { opacity: 0.55 }));
  shadow.position.y = 0.003;
  group.add(body, wheels, hubs, shadow);
  group.position.z = TRUCK_Z;

  function update(P) {
    const st = truckState(P);
    group.visible = st.visible;
    if (!st.visible) return;
    group.position.x = st.x;
    group.scale.setScalar(Math.max(st.s, 1e-3));
    body.position.y = st.bob;
    const spin = -(st.x + st.travel) / WHEEL_R;
    axles.forEach((x, i) => {
      for (const [j, z] of [[0, 0.86], [1, -0.86]]) {
        const mm = compose([x, WHEEL_R, z], [0, 0, spin], [1, 1, 1]);
        wheels.setMatrixAt(i * 2 + j, mm);
        hubs.setMatrixAt(i * 2 + j, mm);
      }
    });
    wheels.instanceMatrix.needsUpdate = true;
    hubs.instanceMatrix.needsUpdate = true;
  }
  return { group, update };
}

// ── road + route map ────────────────────────────────────────────────────────
function roadAlpha() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 4;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 256, 0);
  gr.addColorStop(0, '#000'); gr.addColorStop(0.22, '#fff'); gr.addColorStop(0.78, '#fff'); gr.addColorStop(1, '#000');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 4);
  return new THREE.CanvasTexture(c);
}

export function createRoad() {
  const map = roadTexture();
  map.repeat.set(9, 1);
  const mat = new THREE.MeshBasicMaterial({ map, alphaMap: roadAlpha(), transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(36, 3.2).rotateX(-Math.PI / 2), mat);
  mesh.position.set(0, 0.0015, TRUCK_Z);
  mesh.renderOrder = -3;
  return {
    group: mesh,
    update(P, opacity) {
      mesh.visible = opacity > 0.001;
      mat.opacity = opacity;
      map.offset.x = truckState(P).travel / 4;
    },
  };
}

export function createRouteMap() {
  const group = new THREE.Group();
  group.name = 'route';
  const pts = new THREE.CatmullRomCurve3([
    new THREE.Vector3(CITIES[0].x, 0.01, CITIES[0].z),
    new THREE.Vector3(-0.05, 0.01, -0.95),
    new THREE.Vector3(CITIES[1].x, 0.01, CITIES[1].z),
    new THREE.Vector3(1.6, 0.01, 1.9),
    new THREE.Vector3(CITIES[2].x, 0.01, CITIES[2].z),
  ], false, 'centripetal').getPoints(160);
  const geo = new LineGeometry();
  geo.setPositions(pts.flatMap((p) => [p.x, p.y, p.z]));
  const lineMat = lineMaterial({ color: '#19AEDD', width: 3, dashed: true });
  lineMat.dashSize = 0.24;
  lineMat.gapSize = 0.14;
  const line = new Line2(geo, lineMat);
  line.computeLineDistances();
  line.frustumCulled = false;
  const nodeMat = new THREE.MeshBasicMaterial({ color: COLORS.ink, transparent: true, toneMapped: false });
  const ringMat = new THREE.MeshBasicMaterial({ color: '#19AEDD', transparent: true, toneMapped: false, side: THREE.DoubleSide });
  const labels = [];
  for (const c of CITIES) {
    const node = new THREE.Mesh(new THREE.CircleGeometry(0.11, 28).rotateX(-Math.PI / 2), nodeMat);
    node.position.set(c.x, 0.012, c.z);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.232, 48).rotateX(-Math.PI / 2), ringMat);
    ring.position.set(c.x, 0.012, c.z);
    const { texture, aspect } = labelTexture(c.name, { size: 64, spacing: 0.14 });
    const lm = decalMaterial(texture, { opacity: 0 });
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.34 * aspect, 0.34).rotateX(-Math.PI / 2), lm);
    label.position.set(c.x + c.side * (0.36 + 0.17 * aspect), 0.012, c.z - 0.02);
    labels.push(lm);
    group.add(node, ring, label);
  }
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 14), glowMaterial({ on: NEON_HDR.cyan }));
  group.add(line, dot);
  const segCount = pts.length - 1;
  return {
    group,
    update(opacity, draw) {
      group.visible = opacity > 0.001;
      nodeMat.opacity = opacity;
      ringMat.opacity = opacity * 0.9;
      lineMat.opacity = opacity;
      for (const lm of labels) lm.opacity = opacity;
      geo.instanceCount = Math.max(1, Math.floor(draw * segCount));
      const p = pts[Math.min(pts.length - 1, Math.round(draw * segCount))];
      dot.position.set(p.x, 0.16, p.z);
      dot.visible = opacity > 0.3 && draw > 0.001 && draw < 0.999;
    },
  };
}
