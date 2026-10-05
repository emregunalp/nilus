// Geometry builders: logo-"n" counter extrusion, oak-slat column, lounge chair, table, coffee station,
// plus edge-line extraction for the ink drawing (bottom-up strokes, split into pieces so they grow like a pen).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { logoGeometry } from './logo.js';

const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

/** Counter: the "n" of the Nilus logo, extruded. Keeps the letter's own proportion inside W × H. */
export function counterGeometry(W, H, D) {
  return logoGeometry({ width: W, height: H, depth: D, glyphs: ['n'] });
}

/** Column: charcoal core + 4 faces of protruding oak slats (merged, varied UVs for grain). */
export function columnGeometries(size, height) {
  const core = size - 0.07;
  const perFace = 7;
  const slatW = 0.034;
  const slatD = 0.034;
  const span = size - 0.06;
  const slats = [];
  for (let f = 0; f < 4; f++) {
    for (let i = 0; i < perFace; i++) {
      const u = -span / 2 + (span * (i + 0.5)) / perFace;
      const g = box(slatW, height, slatD);
      const uv = g.attributes.uv;
      const shift = (i * 0.137 + f * 0.31) % 1;
      for (let k = 0; k < uv.count; k++) uv.setX(k, uv.getX(k) * 0.18 + shift);
      const out = size / 2 - slatD / 2;
      if (f === 0) g.translate(u, 0, out);
      else if (f === 1) g.translate(u, 0, -out);
      else if (f === 2) g.rotateY(Math.PI / 2).translate(out, 0, u);
      else g.rotateY(Math.PI / 2).translate(-out, 0, u);
      slats.push(g);
    }
  }
  const caps = [box(size + 0.01, 0.035, size + 0.01, 0, height / 2 - 0.0175, 0), box(size + 0.01, 0.05, size + 0.01, 0, -height / 2 + 0.025, 0)];
  return { core: box(core, height - 0.07, core), caps: mergeGeometries(caps), slats: mergeGeometries(slats) };
}

/** Lounge chair centred on its bbox (w×h×d): fabric shell + slim oak legs. */
export function chairGeometries(w, h, d) {
  const legH = 0.2;
  const y0 = -h / 2;
  const seatY = y0 + legH + 0.1;
  const fabric = [
    new RoundedBoxGeometry(w - 0.16, 0.2, d - 0.14, 3, 0.06).translate(0, seatY, 0.04),
    new RoundedBoxGeometry(w - 0.1, 0.44, 0.14, 3, 0.06).rotateX(-0.2).translate(0, seatY + 0.28, -d / 2 + 0.12),
    new RoundedBoxGeometry(0.1, 0.3, d - 0.12, 3, 0.045).translate(w / 2 - 0.05, seatY + 0.1, 0.02),
    new RoundedBoxGeometry(0.1, 0.3, d - 0.12, 3, 0.045).translate(-w / 2 + 0.05, seatY + 0.1, 0.02),
  ];
  const legs = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      legs.push(new THREE.CylinderGeometry(0.018, 0.012, legH, 8).translate(sx * (w / 2 - 0.1), y0 + legH / 2, sz * (d / 2 - 0.12)));
    }
  }
  return { fabric: mergeGeometries(fabric), legs: mergeGeometries(legs) };
}

export function tableGeometries(r, h) {
  const top = new THREE.CylinderGeometry(r, r, 0.03, 40).translate(0, h / 2 - 0.015, 0);
  const stem = new THREE.CylinderGeometry(0.028, 0.028, h - 0.05, 12);
  const base = new THREE.CylinderGeometry(0.2, 0.22, 0.02, 32).translate(0, -h / 2 + 0.01, 0);
  return { top, metal: mergeGeometries([stem, base]) };
}

/** Coffee station: lacquer body, charcoal worktop, espresso machine + cups on top. */
export function coffeeGeometries(w, h, d) {
  const body = box(w, h - 0.06, d, 0, -0.03, 0);
  const top = box(w + 0.04, 0.06, d + 0.04, 0, h / 2 - 0.03, 0);
  const machine = [
    box(0.38, 0.36, 0.32, -0.36, h / 2 + 0.18, -0.04),
    box(0.3, 0.05, 0.12, -0.36, h / 2 + 0.12, 0.16),
  ];
  const cups = [0.12, 0.26, 0.4].map((x) => new THREE.CylinderGeometry(0.04, 0.034, 0.09, 12).translate(x, h / 2 + 0.045, 0.06));
  return { body, top: mergeGeometries([top, ...machine]), cups: mergeGeometries(cups) };
}

/**
 * Edge segments of a set of meshes (in the part's local frame) for the ink drawing, ordered like a pen plots:
 * edges bottom-up, each edge split into short pieces (≤ `piece` metres in WORLD size, via `scale`) that run
 * from its lower end to its upper end — revealing instances one by one then grows every stroke smoothly.
 * Returns a LineSegmentsGeometry plus its piece count (for instanceCount-style reveal).
 */
export function edgeLines(entries, threshold = 30, { scale = [1, 1, 1], piece = 0.16 } = {}) {
  const segs = [];
  const v = new THREE.Vector3();
  for (const { geometry, matrix, threshold: own } of entries) {
    const eg = new THREE.EdgesGeometry(geometry, own ?? threshold);
    const p = eg.attributes.position;
    for (let i = 0; i < p.count; i += 2) {
      const a = v.fromBufferAttribute(p, i).applyMatrix4(matrix).toArray();
      const b = v.fromBufferAttribute(p, i + 1).applyMatrix4(matrix).toArray();
      const lower = a[1] < b[1] - 1e-6 || (Math.abs(a[1] - b[1]) <= 1e-6 && a[0] + a[2] <= b[0] + b[2]);
      segs.push(lower ? [a, b] : [b, a]);
    }
    eg.dispose();
  }
  segs.sort((s, t) => (s[0][1] + s[1][1]) - (t[0][1] + t[1][1]) || (s[0][0] + s[1][0]) - (t[0][0] + t[1][0]));
  const pieces = [];
  for (const [a, b] of segs) {
    const len = Math.hypot((b[0] - a[0]) * scale[0], (b[1] - a[1]) * scale[1], (b[2] - a[2]) * scale[2]);
    const n = Math.max(1, Math.ceil(len / piece));
    for (let k = 0; k < n; k++) {
      const u0 = k / n;
      const u1 = (k + 1) / n;
      pieces.push(
        a[0] + (b[0] - a[0]) * u0, a[1] + (b[1] - a[1]) * u0, a[2] + (b[2] - a[2]) * u0,
        a[0] + (b[0] - a[0]) * u1, a[1] + (b[1] - a[1]) * u1, a[2] + (b[2] - a[2]) * u1,
      );
    }
  }
  const geo = new LineSegmentsGeometry();
  geo.setPositions(new Float32Array(pieces));
  return { geometry: geo, count: pieces.length / 6 };
}
