// Drafting layer of the drawing (hero → Tasarım): faint engineering grid, cyan construction lines with axis
// bubbles, ink dimension lines with figures ("5.00 m", "5.00 m", "4.04 m") and a title block.
// Lines grow like a pen: every line is cut into short pieces and the pieces are interleaved, so raising the
// instance count grows ALL lines at once from their start points (idea ported from scene-a/props-draw.js).
// All geometry is in world space around the 5×5 island (layout A).

import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { PALETTE, lineMaterial } from './materials.js';
import { labelTexture, bubbleTexture, titleBlockTexture, FONT_MONO } from './textures.js';
import { PLATFORM_H, COL, COL_H, HDR_H } from './layout.js';

const GRID_HALF = 11;
const GRID_STEP = 0.5;
const GRID_FADE = 9.5;
const HALF = 2.5;
const COL_AXIS = HALF - 0.45;
const OUTER = COL_AXIS + COL / 2;
const TOP = PLATFORM_H + COL_H + HDR_H;
const DIM_OFF = 1.0;
const DIM_Y = 0.006;
const CONSTRUCT_CYAN = 0x1aa9d8;
const LABEL_INK = '#2A2622';
const DASH = Object.freeze({ on: 0.3, off: 0.14 });
const INK_PIECE = 0.12;

/** Floor grid as short pieces with per-vertex alpha → radial fade into the cream. */
function makeGrid() {
  const pos = [];
  const col = [];
  const ink = new THREE.Color(PALETTE.ink);
  const push = (x0, z0, x1, z1, major) => {
    for (const [x, z] of [[x0, z0], [x1, z1]]) {
      const d = Math.hypot(x, z) / GRID_FADE;
      const a = Math.max(0, 1 - d * d) * (major ? 0.15 : 0.07);
      pos.push(x, 0.003, z);
      col.push(ink.r, ink.g, ink.b, a);
    }
  };
  const n = Math.round((GRID_HALF * 2) / GRID_STEP);
  for (let i = 0; i <= n; i++) {
    const c = -GRID_HALF + i * GRID_STEP;
    const major = Math.abs((c / 2.5) - Math.round(c / 2.5)) < 1e-6;
    for (let j = 0; j < n; j++) {
      const a = -GRID_HALF + j * GRID_STEP;
      push(c, a, c, a + GRID_STEP, major);
      push(a, c, a + GRID_STEP, c, major);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, opacity: 0 });
  const lines = new THREE.LineSegments(geo, mat);
  lines.renderOrder = -2;
  return lines;
}

/** Pieces of a→b: solid pieces of length `piece`, or dashes (on/off) when `dash` is given. */
function pieces(a, b, { piece = INK_PIECE, dash = null } = {}) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const at = (u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
  const out = [];
  if (dash) {
    for (let s = 0; s < len - 1e-6; s += dash.on + dash.off) out.push([at(s / len), at(Math.min(len, s + dash.on) / len)]);
  } else {
    const n = Math.max(1, Math.ceil(len / piece));
    for (let k = 0; k < n; k++) out.push([at(k / n), at((k + 1) / n)]);
  }
  return out;
}

/** Interleave the pieces of many lines: piece 0 of every line, then piece 1 … (all lines grow together). */
function interleaved(lines, opts) {
  const lists = lines.map(([a, b]) => pieces(a, b, opts));
  const longest = Math.max(...lists.map((l) => l.length));
  const flat = [];
  for (let s = 0; s < longest; s++) for (const l of lists) if (s < l.length) flat.push(...l[s][0], ...l[s][1]);
  const geo = new LineSegmentsGeometry();
  geo.setPositions(new Float32Array(flat));
  return { geo, count: flat.length / 6 };
}

function linesObject(lines, mat, opts) {
  const { geo, count } = interleaved(lines, opts);
  const obj = new LineSegments2(geo, mat);
  obj.frustumCulled = false;
  obj.renderOrder = 3;
  return { obj, geo, count };
}

/** Architectural 45° tick at p, for a dimension running along direction (dx, dz) (or vertical when up). */
function tick(p, dir, len = 0.12) {
  const [dx, dy, dz] = dir;
  // slash = (along + perpendicular) rotated 45°: for floor dims the perpendicular is the other floor axis.
  const px = dy ? 1 : dz;
  const pz = dy ? 0 : -dx;
  const ux = (dx + px) * len * 0.7;
  const uy = dy * len * 0.7;
  const uz = (dz + pz) * len * 0.7;
  return [[p[0] - ux, p[1] - uy, p[2] - uz], [p[0] + ux, p[1] + uy, p[2] + uz]];
}

function dimensionLines() {
  const zF = HALF + DIM_OFF;
  const xR = HALF + DIM_OFF;
  const y = DIM_Y;
  return [
    // width — front
    [[-HALF, y, zF], [HALF, y, zF]],
    [[-HALF, y, HALF + 0.15], [-HALF, y, zF + 0.2]], [[HALF, y, HALF + 0.15], [HALF, y, zF + 0.2]],
    tick([-HALF, y, zF], [1, 0, 0]), tick([HALF, y, zF], [1, 0, 0]),
    // depth — right
    [[xR, y, HALF], [xR, y, -HALF]],
    [[HALF + 0.15, y, HALF], [xR + 0.2, y, HALF]], [[HALF + 0.15, y, -HALF], [xR + 0.2, y, -HALF]],
    tick([xR, y, HALF], [0, 0, -1]), tick([xR, y, -HALF], [0, 0, -1]),
    // height — at the back-right corner, clear of the stand in the Tasarım view
    [[xR, 0, -OUTER], [xR, TOP, -OUTER]],
    [[OUTER + 0.14, TOP, -OUTER], [xR + 0.2, TOP, -OUTER]],
    tick([xR, TOP, -OUTER], [0, 1, 0]), tick([xR, 0.004, -OUTER], [0, 1, 0]),
  ];
}

function constructionLines() {
  const y = 0.005;
  const L = 4.3;
  const A = 4.6;
  const lines = [
    [[-L, y, HALF], [L, y, HALF]], [[-L, y, -HALF], [L, y, -HALF]],
    [[HALF, y, -L], [HALF, y, L]], [[-HALF, y, -L], [-HALF, y, L]],
    [[-COL_AXIS, y, -A], [-COL_AXIS, y, A]], [[COL_AXIS, y, -A], [COL_AXIS, y, A]],
    [[-A, y, -COL_AXIS], [A, y, -COL_AXIS]], [[-A, y, COL_AXIS], [A, y, COL_AXIS]],
    [[-HALF, y, -HALF], [HALF, y, HALF]], [[-HALF, y, HALF], [HALF, y, -HALF]],
    [[-3.6, TOP, OUTER], [3.6, TOP, OUTER]], [[OUTER, TOP, -3.6], [OUTER, TOP, 3.6]],
  ];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) lines.push([[sx * COL_AXIS, 0, sz * COL_AXIS], [sx * COL_AXIS, TOP + 0.7, sz * COL_AXIS]]);
  return lines;
}

function flatLabel(text, { x, z, ry = 0, h = 0.34 }) {
  const { texture, aspect } = labelTexture(text, { font: `500 76px ${FONT_MONO}`, color: LABEL_INK, tracking: 5, height: 132 });
  const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(h * aspect, h), mat);
  m.rotation.set(-Math.PI / 2, ry, 0, 'YXZ');
  m.position.set(x, 0.008, z);
  m.renderOrder = 4;
  return m;
}

/** Vertical figure in the plane facing +Z, reading bottom-to-top (architectural convention). */
function uprightLabel(text, { x, y, z, h = 0.34 }) {
  const { texture, aspect } = labelTexture(text, { font: `500 76px ${FONT_MONO}`, color: LABEL_INK, tracking: 5, height: 132 });
  const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0, side: THREE.DoubleSide });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(h * aspect, h), mat);
  m.rotation.set(0, Math.PI / 4, Math.PI / 2, 'YXZ');
  m.position.set(x, y, z);
  m.renderOrder = 4;
  return m;
}

function bubble(letter, x, z) {
  const mat = new THREE.MeshBasicMaterial({ map: bubbleTexture(letter), transparent: true, depthWrite: false, opacity: 0 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.46), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.007, z);
  m.renderOrder = 4;
  return m;
}

function titleBlock() {
  const { texture, aspect } = titleBlockTexture();
  const h = 1.08;
  const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(h * aspect, h), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(HALF + DIM_OFF + 0.7 + (h * aspect) / 2, 0.008, 1.05);
  m.renderOrder = 4;
  return m;
}

export function buildBlueprint() {
  const group = new THREE.Group();
  group.name = 'blueprint';
  const grid = makeGrid();
  group.add(grid);

  const dimMat = lineMaterial({ color: PALETTE.ink2, width: 1.1, opacity: 0 });
  const dims = linesObject(dimensionLines(), dimMat, { piece: INK_PIECE });
  const axisMat = lineMaterial({ color: CONSTRUCT_CYAN, width: 1.05, opacity: 0 });
  const axes = linesObject(constructionLines(), axisMat, { dash: DASH });
  group.add(dims.obj, axes.obj);

  const figures = [
    flatLabel('5.00 m', { x: 0, z: HALF + DIM_OFF + 0.3 }),
    flatLabel('5.00 m', { x: HALF + DIM_OFF + 0.3, z: 0, ry: Math.PI / 2 }),
    uprightLabel(`${TOP.toFixed(2)} m`, { x: HALF + DIM_OFF + 0.28, y: TOP / 2, z: -OUTER + 0.02 }),
  ];
  const bubbles = [
    bubble('A', -COL_AXIS, 4.95), bubble('B', COL_AXIS, 4.95),
    bubble('1', 4.95, COL_AXIS), bubble('2', 4.95, -COL_AXIS),
  ];
  const title = titleBlock();
  [...figures, ...bubbles, title].forEach((m) => group.add(m));

  const fade = (m, a) => { m.material.opacity = a; m.visible = a > 0.004; };

  function update(ps) {
    grid.material.opacity = ps.grid;
    grid.visible = ps.grid > 0.004;
    dims.obj.visible = ps.dims > 0.001 && ps.dimsAlpha > 0.004;
    dimMat.opacity = 0.9 * ps.dimsAlpha;
    dims.geo.instanceCount = Math.max(1, Math.ceil(dims.count * ps.dims));
    axes.obj.visible = ps.axes > 0.001 && ps.axesAlpha > 0.004;
    axisMat.opacity = 0.72 * ps.axesAlpha;
    axes.geo.instanceCount = Math.max(1, Math.ceil(axes.count * ps.axes));
    figures.forEach((m, i) => fade(m, THREE.MathUtils.smoothstep(ps.labels, i * 0.12, 0.6 + i * 0.12)));
    bubbles.forEach((m) => fade(m, THREE.MathUtils.smoothstep(ps.axes, 0.55, 1) * ps.axesAlpha));
    fade(title, THREE.MathUtils.smoothstep(ps.labels, 0.35, 1));
  }

  return { group, update };
}
