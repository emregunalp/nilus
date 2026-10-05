// Fixed-size stand parts (metres, origin at bbox centre): N counter, totems, coffee station, tables, lounge chairs, logo.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FIXED_DIMS } from './layout.js';
import { UNIT_BOX, addSolid, addGlow, addShadow, addProxy, registerEmissive, transformed, HUES } from './stand-kit.js';
import { withFx } from './materials.js';

const N_SHAPE = { W: 2.4, H: 1.05, T: 0.42, D: 0.55 };
const COUNTER_BEVEL = 0.012;
const LOGO_TEXT = 'nilus';

/** Letter-N polygon (x right, y up) in metres. */
function nShape() {
  const { W, H, T, D } = N_SHAPE;
  const pts = [[0, 0], [T, 0], [T, H - D], [W - T, 0], [W, 0], [W, H], [W - T, H], [W - T, D], [T, H], [0, H]];
  return new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
}

export function buildCounter(ctx) {
  const { W, H } = N_SHAPE;
  const depth = FIXED_DIMS.counter.d - COUNTER_BEVEL * 2;
  const geo = new THREE.ExtrudeGeometry(nShape(), {
    depth, bevelEnabled: true, bevelThickness: COUNTER_BEVEL, bevelSize: COUNTER_BEVEL, bevelSegments: 2, curveSegments: 1,
  });
  geo.translate(-W / 2, -H / 2, -depth / 2);
  const { emissive, base } = ctx.shared.tex.counterBands;
  for (const t of [emissive, base]) { t.repeat.set(1 / W, 1 / H); t.offset.set(0, 0); }
  const caps = withFx(new THREE.MeshPhysicalMaterial({
    color: '#FFFFFF', map: base, emissive: '#FFFFFF', emissiveMap: emissive, emissiveIntensity: 2.2,
    roughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.2,
  }));
  ctx.fx.push(caps);
  registerEmissive(ctx, caps, 'counter', 2.2);
  const sides = withFx(ctx.shared.base.lacquer.clone());
  ctx.fx.push(sides);
  addSolid(ctx, geo, [caps, sides]);
  addShadow(ctx, W * 1.25, FIXED_DIMS.counter.d * 2.4, -H / 2 + 0.004, 0.55, 'rect');
}

export function buildTotem(ctx, variant) {
  const { w, h, d } = FIXED_DIMS.totem;
  const { base } = ctx.shared;
  const bodyH = h - 0.3;
  const y0 = -h / 2;
  addSolid(ctx, UNIT_BOX, base.lacquer, { pos: [0, y0 + bodyH / 2, 0], scale: [w, bodyH, d] });
  addSolid(ctx, UNIT_BOX, base.dark, { pos: [0, y0 + 0.03, 0], scale: [w + 0.02, 0.06, d + 0.02], edge: false });
  const screen = new THREE.MeshBasicMaterial({ map: ctx.shared.tex.screens[variant], toneMapped: false });
  addSolid(ctx, ctx.shared.planeGeo, withFx(screen), { pos: [0, y0 + 1.52, d / 2 + 0.003], scale: [w - 0.1, 1.62, 1] });
  ctx.fx.push(screen);
  addGlow(ctx, UNIT_BOX, 'totem', variant === 0 ? HUES.totemL : HUES.totemR, {
    pos: [0, h / 2 - 0.15, 0], scale: [w, 0.3, d], haloGrow: [1.6, 2.2, 1.9],
  });
  addShadow(ctx, w * 2.2, d * 2.4, y0 + 0.004, 0.6);
}

export function buildCoffee(ctx) {
  const { w, h, d } = FIXED_DIMS.coffee;
  const { base } = ctx.shared;
  const y0 = -h / 2;
  const cabH = 1.0;
  addSolid(ctx, UNIT_BOX, base.lacquer, { pos: [0, y0 + cabH / 2, 0], scale: [w, cabH, d] });
  addSolid(ctx, UNIT_BOX, base.oak, { pos: [0, y0 + cabH / 2, d / 2 + 0.01], scale: [w - 0.1, cabH - 0.14, 0.02] });
  addSolid(ctx, UNIT_BOX, base.stone, { pos: [0, y0 + cabH + 0.02, 0], scale: [w + 0.04, 0.04, d + 0.04] });
  addSolid(ctx, UNIT_BOX, base.dark, { pos: [-0.3, y0 + cabH + 0.04 + 0.18, -0.06], scale: [0.42, 0.36, 0.34] });
  const cup = new THREE.CylinderGeometry(0.04, 0.035, 0.08, 16);
  addSolid(ctx, cup, base.porcelain, { pos: [0.22, y0 + cabH + 0.08, 0.06], edge: false });
  addSolid(ctx, cup, base.porcelain, { pos: [0.36, y0 + cabH + 0.08, -0.04], edge: false });
  addShadow(ctx, w * 1.35, d * 2.2, y0 + 0.004, 0.55, 'rect');
}

export function buildTable(ctx) {
  const { h } = FIXED_DIMS.table;
  const { base } = ctx.shared;
  const y0 = -h / 2;
  addSolid(ctx, new THREE.CylinderGeometry(0.36, 0.36, 0.03, 40), base.lacquer, { pos: [0, h / 2 - 0.015, 0] });
  addSolid(ctx, new THREE.CylinderGeometry(0.025, 0.025, h - 0.05, 12), base.metal, { pos: [0, 0, 0], edge: false });
  addSolid(ctx, new THREE.CylinderGeometry(0.22, 0.24, 0.02, 32), base.metal, { pos: [0, y0 + 0.01, 0] });
  addShadow(ctx, 1.0, 1.0, y0 + 0.004, 0.5);
}

export function buildChair(ctx) {
  const { h } = FIXED_DIMS.chair;
  const { base } = ctx.shared;
  const y0 = -h / 2;
  const seatY = y0 + 0.3;
  const piece = (size, radius, pos, rot) => ({ size, pos, rot, geo: new RoundedBoxGeometry(...size, 3, radius) });
  const pieces = [
    piece([0.62, 0.17, 0.6], 0.06, [0, seatY, 0.02]),
    piece([0.62, 0.44, 0.14], 0.06, [0, seatY + 0.26, -0.27], [-0.2, 0, 0]),
    piece([0.1, 0.3, 0.64], 0.045, [-0.32, seatY + 0.06, 0]),
    piece([0.1, 0.3, 0.64], 0.045, [0.32, seatY + 0.06, 0]),
  ];
  const fabric = mergeGeometries(transformed(pieces));
  addSolid(ctx, fabric, base.fabric, { edge: false });
  // RoundedBoxGeometry reports unit `parameters`, so outline proxies use the explicit piece sizes.
  for (const p of pieces) addProxy(ctx, new THREE.BoxGeometry(...p.size), { pos: p.pos, rot: p.rot });
  const leg = new THREE.CylinderGeometry(0.014, 0.014, 0.22, 8);
  const legs = mergeGeometries(transformed([[-0.26, -0.24], [0.26, -0.24], [-0.26, 0.26], [0.26, 0.26]].map(([x, z]) => ({ geo: leg, pos: [x, y0 + 0.11, z] }))));
  addSolid(ctx, legs, base.metal, { edge: false });
  addShadow(ctx, 1.05, 1.05, y0 + 0.004, 0.55);
}

/** Hanging illuminated 3D logo ("nilus"), pink→violet→cyan faces; box fallback if the typeface did not load. */
export function buildLogo(ctx) {
  const dims = FIXED_DIMS.logo;
  const font = ctx.shared.font;
  const geo = font ? textGeometry(font, dims) : new RoundedBoxGeometry(dims.w, dims.h, dims.d, 2, 0.04);
  paintGradient(geo);
  if (font) {
    const glow = addGlow(ctx, geo, 'logo', HUES.logo, { vertexColors: true, haloGrow: [dims.w * 1.1, dims.h * 2.4, dims.d * 5] });
    const sideMat = withFx(ctx.shared.base.lacquer.clone());
    ctx.fx.push(sideMat);
    glow.material = [glow.material, sideMat];
  } else {
    addGlow(ctx, geo, 'logo', HUES.logo, { vertexColors: true, haloGrow: [dims.w * 1.1, dims.h * 2.4, dims.d * 5] });
  }
  ctx.cables = cables(ctx, dims);
}

function textGeometry(font, dims) {
  const geo = new TextGeometry(LOGO_TEXT, {
    font, size: 0.42, depth: dims.d - 0.016, curveSegments: 5,
    bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.006, bevelSegments: 2,
  });
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const s = dims.w / (bb.max.x - bb.min.x);
  geo.translate(-(bb.min.x + bb.max.x) / 2, -(bb.min.y + bb.max.y) / 2, -(bb.min.z + bb.max.z) / 2);
  geo.scale(s, s, 1);
  return geo;
}

// Display-normalised hues (max channel 1); the glow shader multiplies by gain (> 1 → bloom).
const GRADIENT = [new THREE.Color(1, 0.022, 0.28), new THREE.Color(0.2, 0.11, 1), new THREE.Color(0.022, 0.37, 1)];

function paintGradient(geo) {
  geo.computeBoundingBox();
  const { min, max } = geo.boundingBox;
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const u = (pos.getX(i) - min.x) / (max.x - min.x || 1);
    const [a, b, k] = u < 0.5 ? [GRADIENT[0], GRADIENT[1], u * 2] : [GRADIENT[1], GRADIENT[2], (u - 0.5) * 2];
    c.copy(a).lerp(b, k);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function cables(ctx, dims) {
  const len = 1.66;
  const geo = new THREE.CylinderGeometry(0.004, 0.004, len, 6);
  const mat = new THREE.MeshBasicMaterial({ color: '#8C857A', transparent: true, opacity: 1, toneMapped: false });
  const group = new THREE.Group();
  for (const x of [-dims.w * 0.36, dims.w * 0.36]) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, dims.h / 2 + len / 2, 0);
    group.add(m);
  }
  ctx.group.add(group);
  return { group, mat };
}
