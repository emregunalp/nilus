// Tasarım layer: engineering grid, cyan construction lines (grow), ink dimension lines + labels, hall floor.

import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { lineMaterial, decalMaterial, COLORS } from './materials.js';
import { labelTexture } from './textures.js';
import { STAND_TOP, COLUMN_INSET, PLATFORM_H, COLUMN_H } from './layout.js';

const LINE_CYAN = '#19AEDD';
const SUBDIV = 28;
const HALF = 2.5;
const COL = HALF - COLUMN_INSET;
const HEADER_OUT = COL + 0.2;
const DIM_OFF = 3.3;

const GRID_FRAG = /* glsl */`
  uniform float uBp;
  uniform float uHall;
  uniform vec3 uCyan;
  uniform vec3 uInk;
  varying vec3 vW;
  float gridLine(vec2 p, float step, float w) {
    vec2 q = p / step;
    vec2 g = abs(fract(q - 0.5) - 0.5) / max(fwidth(q), vec2(1e-4));
    return 1.0 - min(min(g.x, g.y) / w, 1.0);
  }
  void main() {
    float r = length(vW.xz);
    float minor = gridLine(vW.xz, 0.25, 1.0);
    float major = gridLine(vW.xz, 1.0, 1.25);
    float bp = (minor * 0.14 + major * 0.3) * uBp * (1.0 - smoothstep(5.5, 12.0, r));
    float hall = gridLine(vW.xz, 1.0, 1.0) * 0.085 * uHall * (1.0 - smoothstep(6.0, 14.0, r));
    gl_FragColor = vec4(bp >= hall ? uCyan : uInk, max(bp, hall));
    #include <colorspace_fragment>
  }`;

const GRID_VERT = /* glsl */`
  varying vec3 vW;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

function createGrid() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uBp: { value: 0 }, uHall: { value: 0 }, uCyan: { value: new THREE.Color(LINE_CYAN) }, uInk: { value: new THREE.Color(COLORS.ink) } },
    vertexShader: GRID_VERT,
    fragmentShader: GRID_FRAG,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.002;
  mesh.renderOrder = -2;
  return { mesh, mat };
}

/** Subdivide lines and interleave pieces so every line grows at once when instanceCount rises. */
function interleaved(lines) {
  const out = [];
  for (let s = 0; s < SUBDIV; s++) {
    for (const [a, b] of lines) {
      const u0 = s / SUBDIV;
      const u1 = (s + 1) / SUBDIV;
      out.push(a[0] + (b[0] - a[0]) * u0, a[1] + (b[1] - a[1]) * u0, a[2] + (b[2] - a[2]) * u0);
      out.push(a[0] + (b[0] - a[0]) * u1, a[1] + (b[1] - a[1]) * u1, a[2] + (b[2] - a[2]) * u1);
    }
  }
  return new Float32Array(out);
}

function circle(r, y, n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    pts.push([[Math.cos(a0) * r, y, Math.sin(a0) * r], [Math.cos(a1) * r, y, Math.sin(a1) * r]]);
  }
  return pts;
}

function constructionLines() {
  const y = 0.004;
  const L = 4.3;
  const lines = [
    [[-L, y, HALF], [L, y, HALF]], [[-L, y, -HALF], [L, y, -HALF]],
    [[HALF, y, -L], [HALF, y, L]], [[-HALF, y, -L], [-HALF, y, L]],
    [[-4.8, y, 0], [4.8, y, 0]], [[0, y, -4.8], [0, y, 4.8]],
    [[-HALF, y, -HALF], [HALF, y, HALF]], [[-HALF, y, HALF], [HALF, y, -HALF]],
    [[-3.9, STAND_TOP, HEADER_OUT], [3.9, STAND_TOP, HEADER_OUT]],
    [[HEADER_OUT, STAND_TOP, -3.9], [HEADER_OUT, STAND_TOP, 3.9]],
    [[-3.6, PLATFORM_H + COLUMN_H, HEADER_OUT], [3.6, PLATFORM_H + COLUMN_H, HEADER_OUT]],
  ];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) lines.push([[sx * COL, -0.2, sz * COL], [sx * COL, STAND_TOP + 0.9, sz * COL]]);
  return interleaved(lines);
}

/** Circle segments get their own geometry so the arc sweeps rather than appearing piecewise. */
function circleLines() {
  const pts = circle(Math.hypot(HALF, HALF), 0.004, 120).flatMap(([a, b]) => [...a, ...b]);
  return new Float32Array(pts);
}

function tick(p, dir, len = 0.14) {
  const [dx, dz] = dir;
  return [[p[0] - (dx + dz) * len, p[1], p[2] - (dz - dx) * len], [p[0] + (dx + dz) * len, p[1], p[2] + (dz - dx) * len]];
}

function dimensionLines() {
  const y = 0.006;
  const segs = [
    // width (front)
    [[-HALF, y, DIM_OFF], [HALF, y, DIM_OFF]], [[-HALF, y, HALF + 0.12], [-HALF, y, DIM_OFF + 0.16]], [[HALF, y, HALF + 0.12], [HALF, y, DIM_OFF + 0.16]],
    tick([-HALF, y, DIM_OFF], [1, 0]), tick([HALF, y, DIM_OFF], [1, 0]),
    // depth (right)
    [[DIM_OFF, y, -HALF], [DIM_OFF, y, HALF]], [[HALF + 0.12, y, -HALF], [DIM_OFF + 0.16, y, -HALF]], [[HALF + 0.12, y, HALF], [DIM_OFF + 0.16, y, HALF]],
    tick([DIM_OFF, y, -HALF], [0, 1]), tick([DIM_OFF, y, HALF], [0, 1]),
    // height (front-right)
    [[DIM_OFF, 0, HEADER_OUT], [DIM_OFF, STAND_TOP, HEADER_OUT]],
    [[HEADER_OUT + 0.12, STAND_TOP, HEADER_OUT], [DIM_OFF + 0.16, STAND_TOP, HEADER_OUT]],
    [[HALF + 0.12, 0.004, HEADER_OUT], [DIM_OFF + 0.16, 0.004, HEADER_OUT]],
    [[DIM_OFF - 0.12, STAND_TOP - 0.12, HEADER_OUT], [DIM_OFF + 0.12, STAND_TOP + 0.12, HEADER_OUT]],
    [[DIM_OFF - 0.12, -0.12, HEADER_OUT], [DIM_OFF + 0.12, 0.12, HEADER_OUT]],
  ];
  return new Float32Array(segs.flatMap(([a, b]) => [...a, ...b]));
}

function segmentsObject(positions, mat) {
  const geo = new LineSegmentsGeometry();
  geo.setPositions(positions);
  const line = new LineSegments2(geo, mat);
  line.frustumCulled = false;
  line.renderOrder = 4;
  return { line, count: positions.length / 6 };
}

function label(text, { size = 0.3, pos, rot, font = 'mono', weight = 500 }) {
  const { texture, aspect } = labelTexture(text, { font, weight, size: 72 });
  const mat = decalMaterial(texture, { opacity: 0 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size * aspect, size), mat);
  mesh.position.set(...pos);
  mesh.rotation.set(...rot);
  mesh.renderOrder = 5;
  return { mesh, mat };
}

function dimensionLabels() {
  const flat = [-Math.PI / 2, 0, 0];
  return [
    label('5.00 m', { pos: [0, 0.01, DIM_OFF - 0.26], rot: flat }),
    label('5.00 m', { pos: [DIM_OFF - 0.26, 0.01, 0], rot: [-Math.PI / 2, 0, Math.PI / 2] }),
    label(`${STAND_TOP.toFixed(2)} m`, { pos: [DIM_OFF - 0.22, STAND_TOP / 2, HEADER_OUT + 0.02], rot: [0, 0, Math.PI / 2] }),
    label('ADA STANDI · 1:50 · NILUS DESIGN', { size: 0.19, pos: [0.4, 0.01, DIM_OFF + 0.7], rot: flat }),
  ];
}

/** Blueprint + hall floor layer. update(ps) takes choreo-props propState(P). */
export function createDrawing() {
  const group = new THREE.Group();
  group.name = 'drawing';
  const grid = createGrid();
  group.add(grid.mesh);
  const cyan = lineMaterial({ color: LINE_CYAN, width: 1, opacity: 0.85 });
  const construct = segmentsObject(constructionLines(), cyan);
  const arc = segmentsObject(circleLines(), cyan);
  const inkMat = lineMaterial({ color: COLORS.ink, width: 1.1, opacity: 1 });
  const dims = segmentsObject(dimensionLines(), inkMat);
  const labels = dimensionLabels();
  group.add(construct.line, arc.line, dims.line, ...labels.map((l) => l.mesh));

  function update(ps) {
    grid.mat.uniforms.uBp.value = ps.blueprint;
    grid.mat.uniforms.uHall.value = ps.hall;
    grid.mesh.visible = ps.blueprint > 0.001 || ps.hall > 0.001;
    const cOn = ps.constructGrow > 0.001 && ps.constructOpacity > 0.001;
    construct.line.visible = cOn;
    arc.line.visible = cOn;
    cyan.opacity = 0.85 * ps.constructOpacity;
    construct.line.geometry.instanceCount = Math.floor(ps.constructGrow * construct.count);
    arc.line.geometry.instanceCount = Math.floor(ps.constructGrow * arc.count);
    dims.line.visible = ps.dimsGrow > 0.001 && ps.dimsOpacity > 0.001;
    inkMat.opacity = ps.dimsOpacity;
    dims.line.geometry.instanceCount = Math.ceil(ps.dimsGrow * dims.count);
    for (const l of labels) { l.mat.opacity = ps.dimsLabels; l.mesh.visible = ps.dimsLabels > 0.001; }
  }

  return { group, update, lineMaterials: [cyan, inkMat] };
}
