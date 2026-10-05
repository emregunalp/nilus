// Procedural stand: one Object3D per part (stable ids from layout.js), posed every frame from choreo.
// Every part is also an ink drawing: its edge lines (bottom-up pen strokes) plus a body that starts as a flat
// background-coloured fill — invisible, it only hides the lines behind it (hidden-line drawing) — then rises
// into a paper-white volume and finally its real materials (see materials.js `surface`).
// Unit parts use a 1×1×1 box scaled by `dims`; decorations that must not stretch (lettering, spill)
// recompute their local X scale from the live dims each frame.

import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PARTS, NATIVE_SIZE } from './layout.js';
import { PALETTE, surface, setSurfaceState, lineMaterial, brushedMetal } from './materials.js';
import {
  counterGeometry, columnGeometries, chairGeometries, tableGeometries, coffeeGeometries, edgeLines,
} from './geo.js';
import { logoGeometry } from './logo.js';
import { t } from '../i18n.js';
import {
  oakTextures, brushedTexture, weaveTexture, headerTexture, screenTexture, lightboxTexture, counterBandTextures,
  spillTexture, softDiscTexture,
} from './textures.js';

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const PLANE = new THREE.PlaneGeometry(1, 1);
const HEADER_TEXT = {
  hdrF: 'wordmark', hdrB: 'wordmark',
  hdrR: t('kongre standları', 'congress stands'), hdrL: t('tasarım · üretim · kurulum', 'design · production · installation'),
};
const HEADER_TEXT_W = { hdrF: 3.3, hdrB: 3.3, hdrR: 2.5, hdrL: 2.5 };
const SPILL_DEPTH = 1.1;
const SPILL_MARGIN = 0.9;
const HALO_STEP = 0.14;
const INK_OPACITY = 0.86;
const INK_WIDTH = 1.15;
const STROKE_PIECE = 0.16;
const INK_TEXT_OPACITY = 0.8;
// Platform edge profile (unit space of the 1×1×1 platform box): brushed-aluminium lip around the top edge.
const TRIM = Object.freeze({ t: 0.0036, h: 0.24, lip: 0.02 });

/** Shared textures (built once per mount). */
function makeAssets() {
  const bands = counterBandTextures();
  const oak = oakTextures();
  return {
    oak: oak.map,
    oakBump: oak.bump,
    brushed: brushedTexture(),
    weave: weaveTexture(),
    spill: spillTexture(),
    disc: softDiscTexture(1.6),
    screen: [screenTexture(0), screenTexture(1)],
    lightbox: lightboxTexture(),
    bandColor: bands.color,
    bandEmissive: bands.emissive,
    header: Object.fromEntries(Object.entries(HEADER_TEXT).map(([id, kind]) => [id, headerTexture(kind)])),
  };
}

function mesh(geometry, material, parent, { x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0 } = {}) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.rotation.set(rx, ry, 0);
  parent.add(m);
  return m;
}

/** Oak surface (colour + grain bump). */
function oakSurface(ctx, { roughness = 0.58, bumpScale = 1.6 } = {}) {
  return surface({
    color: 0xffffff, map: ctx.assets.oak, bumpMap: ctx.assets.oakBump, bumpScale, roughness, envMapIntensity: 0.55,
  });
}

/** White lacquer: satin base under a glossy clear coat (soft reflections from the room environment). */
function lacquerSurface({ roughness = 0.3, clearcoat = 0.9 } = {}) {
  return surface({
    physical: true, color: PALETTE.lacquer, roughness, clearcoat, clearcoatRoughness: 0.08, envMapIntensity: 0.85,
  });
}

/** Soft halo dots along a local-X line (used in low quality, and faintly in high quality). */
function haloLine(ctx, channel, hue, parent, { y, z, count, size, gain }) {
  if (gain <= 0) return null;
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) pos.set([-0.5 + (i + 0.5) / count, y, z], i * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    map: ctx.assets.disc, size, sizeAttenuation: true, transparent: true, depthWrite: false, opacity: 0, color: PALETTE.pink,
  });
  ctx.neon.glow(channel, hue, mat, { gain, reuseHue: hue === 'pink' ? 'cyan' : hue });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  parent.add(pts);
  return pts;
}

function trimGeometry() {
  const { t, h, lip } = TRIM;
  const y = 0.5 + lip - h / 2;
  const box = (w, hh, d, x, yy, z) => new THREE.BoxGeometry(w, hh, d).translate(x, yy, z);
  return mergeGeometries([
    box(1 + 2 * t, h, t, 0, y, 0.5 + t / 2), box(1 + 2 * t, h, t, 0, y, -0.5 - t / 2),
    box(t, h, 1, 0.5 + t / 2, y, 0), box(t, h, 1, -0.5 - t / 2, y, 0),
  ]);
}

// ── builders: each returns { bodies, details, surfaces, neonMeshes, basics, decor, decorSurfaces, edges } ──
function buildPlatform(ctx, root) {
  const top = surface({ color: 0x2e2a26, roughness: 0.34, metalness: 0.0, envMapIntensity: 0.7 });
  const side = surface({ color: 0x201d1a, roughness: 0.6 });
  const trim = brushedMetal({ map: ctx.assets.brushed, roughness: 0.3 });
  const body = mesh(UNIT_BOX, [side, side, top, side, side, side], root);
  const lip = mesh(ctx.geo.trim, trim, root);
  return { bodies: [body, lip], surfaces: [top, side, trim], edges: [{ geometry: UNIT_BOX, matrix: body.matrix }] };
}

function buildFloorStrip(ctx, root, spec) {
  const [len, h, d] = spec.A.dims;
  const strip = ctx.neon.basic(spec.channel, 'pink', { gain: 2.5, reuseHue: 'cyan', reuseGain: 2.2 });
  const body = mesh(UNIT_BOX, strip, root);
  const spillMat = new THREE.MeshBasicMaterial({ map: ctx.assets.spill, transparent: true, depthWrite: false, opacity: 0, color: PALETTE.pink });
  ctx.neon.glow(spec.channel, 'pink', spillMat, { gain: 0.34, reuseHue: 'cyan', reuseGain: 0.3 });
  const floorY = -(spec.A.pos[1] - 0.002) / h;
  const spill = mesh(PLANE, spillMat, root, { y: floorY, z: 0.5 + SPILL_DEPTH / d / 2, sz: 1, rx: -Math.PI / 2 });
  spill.scale.set(1, SPILL_DEPTH / d, 1);
  spill.renderOrder = -1;
  const decor = [{ obj: spill, fixedMargin: SPILL_MARGIN }];
  const halo = haloLine(ctx, spec.channel, 'pink', root, { y: 0, z: 0.5, count: Math.round(len / HALO_STEP), size: ctx.haloSize, gain: ctx.haloGain });
  if (halo) decor.push({ obj: halo });
  return { neonMeshes: [body], basics: [strip], decor, edges: [] };
}

function buildColumn(ctx, root) {
  const { core, caps, slats } = ctx.geo.column;
  const coreMat = surface({ color: 0x1c1a17, roughness: 0.85 });
  const oakMat = oakSurface(ctx);
  const capMat = brushedMetal({ map: ctx.assets.brushed, roughness: 0.3 });
  const a = mesh(core, coreMat, root);
  const b = mesh(slats, oakMat, root);
  const c = mesh(caps, capMat, root);
  return { bodies: [a, b, c], surfaces: [coreMat, oakMat, capMat], edges: [{ geometry: ctx.geo.columnHull, matrix: new THREE.Matrix4() }] };
}

function buildHeader(ctx, root, spec) {
  const [len, h, t] = spec.A.dims;
  const lacquer = lacquerSurface({ roughness: 0.26, clearcoat: 1 });
  const body = mesh(UNIT_BOX, lacquer, root);
  const band = 0.045 / h;
  const pink = ctx.neon.basic('hdrPink', 'pink', { gain: 2.8, reuseGain: 1.1 });
  const cyan = ctx.neon.basic('hdrCyan', 'cyan', { gain: 2.6, reuseGain: 3.2 });
  const pinkY = -0.5 + band * 1.6;
  const cyanY = pinkY + band * 2.4;
  const pinkBand = mesh(UNIT_BOX, pink, root, { y: pinkY, z: 0.5 + 0.008 / t, sy: band, sz: 0.016 / t });
  const cyanBand = mesh(UNIT_BOX, cyan, root, { y: cyanY, z: 0.5 + 0.008 / t, sy: band * 0.7, sz: 0.016 / t });
  const textMat = surface({ map: ctx.assets.header[spec.id], transparent: true, roughness: 0.5, color: 0xffffff });
  const textH = 0.56;
  const text = mesh(PLANE, textMat, root, { y: 0.06, z: 0.5 + 0.002 / t, sy: textH / h });
  // The lettering is part of the drawing too: it arrives in ink as the header's strokes complete.
  const decor = [{ obj: text, fixedWidth: HEADER_TEXT_W[spec.id], textMat, inDrawing: true }];
  for (const [ch, hue, y] of [['hdrPink', 'pink', pinkY], ['hdrCyan', 'cyan', cyanY]]) {
    const halo = haloLine(ctx, ch, hue, root, { y, z: 0.5 + 0.03 / t, count: Math.round(len / HALO_STEP), size: ctx.haloSize, gain: ctx.haloGain });
    if (halo) decor.push({ obj: halo });
  }
  return {
    bodies: [body], surfaces: [lacquer], decorSurfaces: [textMat], neonMeshes: [pinkBand, cyanBand], basics: [pink, cyan], decor,
    edges: [{ geometry: UNIT_BOX, matrix: body.matrix }],
  };
}

function buildTruss(ctx, root) {
  const mat = surface({ physical: true, color: 0x2b2926, roughness: 0.36, metalness: 0.75, anisotropy: 0.5, roughnessMap: ctx.assets.brushed });
  const body = mesh(UNIT_BOX, mat, root);
  return { bodies: [body], surfaces: [mat], edges: [{ geometry: UNIT_BOX, matrix: body.matrix }] };
}

function buildLogo(ctx, root, spec) {
  const [w, h, d] = NATIVE_SIZE.logo;
  // The client's own wordmark, extruded from the logo artwork (no font involved).
  const geometry = logoGeometry({ width: w, height: h, depth: d, bevel: 0.008 });
  geometry.computeBoundingBox();
  const hy = (geometry.boundingBox.max.y - geometry.boundingBox.min.y) / 2;
  const face = ctx.neon.lit('logo', 'pink', surface({ color: 0x2b1a24, roughness: 0.4, emissive: 0x000000 }), { gain: 1.9, reuseHue: 'violet', reuseGain: 1.9 });
  const side = lacquerSurface({ roughness: 0.3, clearcoat: 0.6 });
  const body = mesh(geometry, [face, side], root);
  const cableMat = new THREE.MeshStandardMaterial({ color: 0x9a948c, roughness: 0.3, metalness: 0.9, transparent: true, opacity: 0.85 });
  const cableLen = 3.94 - (spec.A.pos[1] + hy);
  const cables = new THREE.Group();
  for (const x of [-0.72, 0.72]) {
    mesh(new THREE.CylinderGeometry(0.004, 0.004, cableLen, 4), cableMat, cables, { x, y: hy + cableLen / 2 });
  }
  root.add(cables);
  return {
    bodies: [body], surfaces: [face, side], fadeMats: [cableMat], decor: [{ obj: cables, assembledOnly: true }],
    edges: [{ geometry, matrix: body.matrix, threshold: 40 }],
  };
}

function buildCounter(ctx, root) {
  const [W, H, D] = NATIVE_SIZE.counter;
  const nH = H - 0.04;
  const geometry = ctx.geo.counter;
  ctx.assets.bandColor.repeat.set(1 / W, 1 / nH);
  ctx.assets.bandColor.offset.set(0.5, 0.5);
  ctx.assets.bandEmissive.repeat.set(1 / W, 1 / nH);
  ctx.assets.bandEmissive.offset.set(0.5, 0.5);
  const face = ctx.neon.lit('counter', 'white', surface({
    color: 0xffffff, map: ctx.assets.bandColor, emissiveMap: ctx.assets.bandEmissive, emissive: 0x000000, roughness: 0.3,
  }), { gain: 2.4, reuseGain: 2.6 });
  const side = surface({ physical: true, color: 0x26221f, roughness: 0.32, clearcoat: 0.5, clearcoatRoughness: 0.2 });
  const body = mesh(geometry, [face, side], root, { y: -0.02 });
  const top = oakSurface(ctx, { roughness: 0.46, bumpScale: 1.1 });
  const slab = mesh(UNIT_BOX, top, root, { y: H / 2 - 0.02, sx: W + 0.08, sy: 0.04, sz: D + 0.08 });
  return {
    bodies: [body, slab], surfaces: [face, side, top],
    edges: [{ geometry, matrix: body.matrix }, { geometry: UNIT_BOX, matrix: slab.matrix }],
  };
}

function buildTotem(ctx, root, spec) {
  const [w, h, d] = NATIVE_SIZE.totem;
  const idx = spec.id === 'totem0' ? 0 : 1;
  const boxH = 0.3;
  const lacquer = lacquerSurface({ roughness: 0.28, clearcoat: 0.9 });
  const body = mesh(UNIT_BOX, lacquer, root, { y: -boxH / 2, sx: w, sy: h - boxH, sz: d });
  const screen = ctx.neon.lit(spec.channel, 'white', surface({
    physical: true, color: 0x121015, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.04, emissiveMap: ctx.assets.screen[idx], emissive: 0x000000,
  }), { gain: 0.95 });
  const scr = mesh(PLANE, screen, root, { y: -boxH / 2 + 0.02, z: d / 2 + 0.003, sx: w - 0.1, sy: h - boxH - 0.26 });
  const lb = ctx.neon.lit(spec.channel, 'white', surface({
    color: 0xf2eee8, map: ctx.assets.lightbox, emissiveMap: ctx.assets.lightbox, emissive: 0x000000, roughness: 0.35,
  }), { gain: 0.32 });
  const top = mesh(UNIT_BOX, [lb, lb, lacquer, lacquer, lb, lb], root, { y: h / 2 - boxH / 2, sx: w + 0.04, sy: boxH, sz: d + 0.04 });
  return {
    bodies: [body, top, scr], surfaces: [lacquer, lb, screen],
    edges: [{ geometry: UNIT_BOX, matrix: body.matrix }, { geometry: UNIT_BOX, matrix: top.matrix }],
  };
}

function buildTable(ctx, root) {
  const { top, metal } = ctx.geo.table;
  const a = lacquerSurface({ roughness: 0.24, clearcoat: 0.8 });
  const b = brushedMetal({ map: ctx.assets.brushed, roughness: 0.28 });
  return { bodies: [mesh(top, a, root)], details: [mesh(metal, b, root)], surfaces: [a, b], edges: [{ geometry: top, matrix: new THREE.Matrix4(), threshold: 40 }] };
}

function buildChair(ctx, root) {
  const { fabric, legs } = ctx.geo.chair;
  const f = surface({
    physical: true, color: PALETTE.fabric, roughness: 0.9, sheen: 0.85, sheenRoughness: 0.55, sheenColor: new THREE.Color(0x9aa5d6),
    bumpMap: ctx.assets.weave, bumpScale: 0.5, envMapIntensity: 0.6,
  });
  const l = oakSurface(ctx, { roughness: 0.5, bumpScale: 0.8 });
  return { bodies: [mesh(fabric, f, root)], details: [mesh(legs, l, root)], surfaces: [f, l], edges: [{ geometry: fabric, matrix: new THREE.Matrix4(), threshold: 25 }] };
}

function buildCoffee(ctx, root) {
  const { body, top, cups } = ctx.geo.coffee;
  const a = oakSurface(ctx, { roughness: 0.55, bumpScale: 1.2 });
  const b = surface({ color: PALETTE.charcoal, roughness: 0.36, metalness: 0.25 });
  const c = lacquerSurface({ roughness: 0.2, clearcoat: 0.8 });
  return {
    bodies: [mesh(body, a, root), mesh(top, b, root), mesh(cups, c, root)], surfaces: [a, b, c],
    edges: [{ geometry: body, matrix: new THREE.Matrix4() }, { geometry: top, matrix: new THREE.Matrix4() }, { geometry: cups, matrix: new THREE.Matrix4(), threshold: 60 }],
  };
}

const BUILDERS = {
  platform: buildPlatform, neonFloor: buildFloorStrip, column: buildColumn, header: buildHeader, truss: buildTruss,
  logo: buildLogo, counter: buildCounter, totem: buildTotem, table: buildTable, chair: buildChair, coffee: buildCoffee,
};

function sharedGeometry() {
  const [cw, ch] = NATIVE_SIZE.column;
  const [tw, th] = NATIVE_SIZE.table;
  const [chw, chh, chd] = NATIVE_SIZE.chair;
  const [cow, coh, cod] = NATIVE_SIZE.coffee;
  const [W, H, D] = NATIVE_SIZE.counter;
  return {
    column: columnGeometries(cw, ch),
    columnHull: new THREE.BoxGeometry(cw, ch, cw),
    table: tableGeometries(tw / 2, th),
    chair: chairGeometries(chw, chh, chd),
    coffee: coffeeGeometries(cow, coh, cod),
    counter: counterGeometry(W, H - 0.04, D),
    trim: trimGeometry(),
  };
}

function buildPart(ctx, spec) {
  const root = new THREE.Group();
  root.name = spec.id;
  const built = BUILDERS[spec.kind](ctx, root, spec);
  // One formation wave per part, rising through its assembled (layout A) world height.
  const half = spec.size[1] / 2;
  for (const mat of [...(built.surfaces || []), ...(built.decorSurfaces || [])]) {
    mat.userData.formRange.set(spec.A.pos[1] - half, spec.A.pos[1] + half);
  }
  root.updateMatrixWorld(true);
  let line = null;
  let lineCount = 0;
  if (built.edges.length) {
    const threshold = built.edges[0].threshold ?? 30;
    const scale = spec.unit ? spec.A.dims : [1, 1, 1];
    const { geometry, count } = edgeLines(built.edges.map((e) => ({ geometry: e.geometry, matrix: e.matrix, threshold: e.threshold })), threshold, { scale, piece: STROKE_PIECE });
    const ink = lineMaterial({ color: PALETTE.ink, width: INK_WIDTH, opacity: INK_OPACITY });
    // Pull the ink a hair towards the camera (bodies are pushed back): edges lying on grazing faces stay unbroken.
    Object.assign(ink, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    line = new LineSegments2(geometry, ink);
    line.visible = false;
    line.renderOrder = 2;
    root.add(line);
    lineCount = count;
  }
  return {
    spec, root, line, lineCount,
    bodies: built.bodies || [],
    details: built.details || [],
    surfaces: built.surfaces || [],
    decorSurfaces: built.decorSurfaces || [],
    neonMeshes: built.neonMeshes || [],
    basics: built.basics || [],
    fadeMats: built.fadeMats || [],
    decor: built.decor || [],
  };
}

/** Build all parts. */
export function buildStand({ neon, quality }) {
  const geo = sharedGeometry();
  const ctx = {
    neon, geo, assets: makeAssets(),
    haloSize: quality === 'low' ? 0.55 : 0.42,
    haloGain: quality === 'low' ? 0.42 : 0,
  };
  const group = new THREE.Group();
  group.name = 'stand';
  const parts = PARTS.map((spec) => {
    const p = buildPart(ctx, spec);
    group.add(p.root);
    return p;
  });
  return { group, parts, assets: ctx.assets };
}

const near = (a, b, eps) => Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps && Math.abs(a[2] - b[2]) < eps;

/** Apply choreo pose + look to one built part. */
export function applyPart(p, pose, look) {
  const r = p.root;
  r.visible = pose.visible;
  if (!pose.visible) return;
  r.position.set(pose.pos[0], pose.pos[1], pose.pos[2]);
  r.rotation.set(pose.rot[0], pose.rot[1], pose.rot[2], 'YXZ');
  r.scale.set(pose.dims[0] * pose.k, pose.dims[1] * pose.k, pose.dims[2] * pose.k);
  const showBody = look.fill > 0;
  for (const m of p.bodies) m.visible = showBody;
  // Details without ink edges (legs, stems) stay out of the pure drawing: an undrawn occluder would cut gaps
  // into the lines behind it. They join once the part has volume.
  for (const m of p.details) m.visible = showBody && look.volume > 0.001;
  for (const mat of p.surfaces) setSurfaceState(mat, look.volume, look.solid, look.glow);
  // Neon tubes, lettering, cables only exist once the real materials arrive (no colour in the drawing).
  const real = look.solid;
  const showReal = showBody && real > 0.01;
  for (const m of p.neonMeshes) m.visible = showReal;
  for (const mat of p.basics) { mat.opacity = real; mat.transparent = real < 0.999; mat.depthWrite = real > 0.5; }
  for (const mat of p.fadeMats) mat.opacity = 0.85 * real;
  const assembled = pose.k > 0.999 && (near(pose.pos, p.spec.A.pos, 0.01) || near(pose.pos, p.spec.R.pos, 0.01))
    && Math.abs(pose.rot[0]) < 0.01 && Math.abs(pose.rot[2]) < 0.01;
  const inkText = look.lineAlpha * Math.min(1, Math.max(0, (look.lineDraw - 0.85) / 0.15));
  const lettering = Math.max(real, inkText * INK_TEXT_OPACITY);
  for (const d of p.decor) {
    d.obj.visible = d.inDrawing ? showBody && lettering > 0.01 : showReal && (!d.assembledOnly || assembled);
    if (d.fixedWidth) d.obj.scale.x = d.fixedWidth / pose.dims[0];
    if (d.fixedMargin) d.obj.scale.x = (pose.dims[0] + 2 * d.fixedMargin) / pose.dims[0];
  }
  for (const mat of p.decorSurfaces) {
    setSurfaceState(mat, 1, 1, look.glow);
    mat.opacity = lettering;
    mat.transparent = true;
    mat.depthWrite = false;
  }
  if (p.line) {
    const on = look.lineAlpha > 0.01 && look.lineDraw > 0.001;
    p.line.visible = on;
    if (on) {
      p.line.geometry.instanceCount = Math.max(1, Math.ceil(p.lineCount * look.lineDraw));
      p.line.material.opacity = look.lineAlpha * INK_OPACITY;
    }
  }
}
