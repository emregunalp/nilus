// Part construction kit: every stand part is a Group whose children register their fx materials,
// neon channels, contact shadows and edge proxies here, so the director can drive them uniformly.

import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { cloneFx, glowMaterial, haloMaterial, decalMaterial, lineMaterial, NEON_HDR } from './materials.js';

export const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const EDGE_ANGLE = 28;
const EDGE_WIDTH = 1.15;

/** Fresh per-part context. */
export function partContext(meta, shared) {
  const group = new THREE.Group();
  group.name = meta.id;
  group.rotation.order = 'YXZ';
  return { meta, shared, group, mats: new Map(), fx: [], glows: [], proxies: [], shadows: [], halos: [], cables: null, spill: null };
}

function place(obj, { pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1] } = {}) {
  obj.position.set(...pos);
  obj.rotation.set(...rot);
  obj.scale.set(...scale);
  return obj;
}

/** Per-part clone of a shared base material (one clone per base per part). */
export function partMaterial(ctx, base) {
  if (!ctx.mats.has(base)) {
    const mat = cloneFx(base);
    ctx.mats.set(base, mat);
    ctx.fx.push(mat);
  }
  return ctx.mats.get(base);
}

/** Opaque surface. `edge: false` skips the blueprint outline; `proxy` supplies a simpler outline geometry. */
export function addSolid(ctx, geo, base, opts = {}) {
  const mat = Array.isArray(base) ? base.map((b) => (b.userData?.glow || b.userData?.fx ? b : partMaterial(ctx, b))) : partMaterial(ctx, base);
  const mesh = place(new THREE.Mesh(geo, mat), opts);
  ctx.group.add(mesh);
  if (opts.edge !== false) addProxy(ctx, opts.proxy || geo, opts);
  return mesh;
}

/** Register a geometry (in part-local space via opts transform) for the ink outline. */
export function addProxy(ctx, geo, opts = {}) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...(opts.pos || [0, 0, 0])),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...(opts.rot || [0, 0, 0]))),
    new THREE.Vector3(...(opts.scale || [1, 1, 1])),
  );
  ctx.proxies.push({ geo, matrix: m });
}

/** Explicit outline segments (flat [x0,y0,z0,x1,y1,z1,…] in part-local space) — e.g. slat hatching. */
export function addSegments(ctx, segments) {
  ctx.proxies.push({ segments });
}

/** Neon element on `channel`; hue(balance) → HDR Vector3. Adds a halo volume on the low-quality path. */
export function addGlow(ctx, geo, channel, hue, opts = {}) {
  const mat = glowMaterial({ on: hue(0), vertexColors: !!opts.vertexColors });
  const mesh = place(new THREE.Mesh(geo, mat), opts);
  ctx.group.add(mesh);
  ctx.glows.push({ mat, channel, hue, kind: 'shader' });
  if (opts.edge !== false) addProxy(ctx, opts.proxy || geo, opts);
  if (ctx.shared.quality === 'low' && opts.halo !== false) addHalo(ctx, channel, hue, opts);
  return mesh;
}

function addHalo(ctx, channel, hue, opts) {
  const h = hue(0);
  const mat = haloMaterial(new THREE.Color(Math.min(h.x, 1), Math.min(h.y, 1), Math.min(h.z, 1)));
  const s = opts.scale || [1, 1, 1];
  const grow = opts.haloGrow || [1, 9, 9];
  const mesh = place(new THREE.Mesh(UNIT_BOX, mat), { pos: opts.pos, rot: opts.rot, scale: [s[0] * grow[0], s[1] * grow[1], s[2] * grow[2]] });
  mesh.renderOrder = 2;
  ctx.group.add(mesh);
  ctx.halos.push({ mat, channel, hue });
}

/** Emissive-mapped standard material driven by a channel (counter bands). */
export function registerEmissive(ctx, mat, channel, gain) {
  ctx.glows.push({ mat, channel, gain, kind: 'emissive' });
}

/** Soft contact shadow on the floor directly under the part (y in part-local units). */
export function addShadow(ctx, w, d, y, opacity = 0.6, shape = 'round') {
  const tex = shape === 'round' ? ctx.shared.tex.shadowRound : ctx.shared.tex.shadowRect;
  const mat = decalMaterial(tex, { opacity });
  const mesh = place(new THREE.Mesh(ctx.shared.planeGeo, mat), { pos: [0, y, 0], rot: [-Math.PI / 2, 0, 0], scale: [w, d, 1] });
  mesh.renderOrder = -1;
  ctx.group.add(mesh);
  ctx.shadows.push({ mat, base: opacity });
  return mesh;
}

/** Build a group of geometries (each with a transform) into one merged-ready list of cloned geometries. */
export function transformed(list) {
  return list.map(({ geo, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1] }) => {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(...pos),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
      new THREE.Vector3(...scale),
    );
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(m);
    return g;
  });
}

/** Edge segments of all proxies, ordered bottom→top so the pen "draws" the part upward. */
function edgePositions(proxies) {
  const segs = [];
  for (const { geo, matrix, segments } of proxies) {
    if (segments) {
      for (let i = 0; i < segments.length; i += 6) segs.push(segments.slice(i, i + 6));
      continue;
    }
    const edges = new THREE.EdgesGeometry(geo, EDGE_ANGLE);
    const arr = edges.attributes.position.array;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    for (let i = 0; i < arr.length; i += 6) {
      a.set(arr[i], arr[i + 1], arr[i + 2]).applyMatrix4(matrix);
      b.set(arr[i + 3], arr[i + 4], arr[i + 5]).applyMatrix4(matrix);
      segs.push([a.x, a.y, a.z, b.x, b.y, b.z]);
    }
    edges.dispose();
  }
  segs.sort((p, q) => (p[1] + p[4]) - (q[1] + q[4]) || (p[0] + p[3]) - (q[0] + q[3]));
  return new Float32Array(segs.flat());
}

/** Ink outline for the part (LineSegments2, instanceCount drives stroke-by-stroke drawing). */
export function buildEdges(ctx) {
  if (!ctx.proxies.length) return null;
  const positions = edgePositions(ctx.proxies);
  const geo = new LineSegmentsGeometry();
  geo.setPositions(positions);
  const mat = lineMaterial({ width: EDGE_WIDTH, opacity: 1 });
  const line = new LineSegments2(geo, mat);
  line.renderOrder = 3;
  line.frustumCulled = false;
  line.visible = false;
  ctx.group.add(line);
  return { line, mat, count: positions.length / 6 };
}

// Hue functions (balance 0 = island pink-led … 1 = linear cyan-led).
const lerpV = (a, b, u) => new THREE.Vector3().lerpVectors(a, b, u);
export const HUES = {
  floor: (b) => lerpV(NEON_HDR.pink, NEON_HDR.cyan, b),
  headerPink: (b) => lerpV(NEON_HDR.pink, NEON_HDR.violet, b),
  headerCyan: () => NEON_HDR.cyan.clone(),
  totemL: (b) => lerpV(NEON_HDR.warm, NEON_HDR.pink, 0.45 - b * 0.2),
  totemR: (b) => lerpV(NEON_HDR.warm, NEON_HDR.cyan, 0.45 + b * 0.15),
  logo: () => new THREE.Vector3(1.9, 0, 0),
};
