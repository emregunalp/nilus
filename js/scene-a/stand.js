// Procedural stand: one Group per part (stable ids from layout.js). Rectilinear parts are unit geometry
// (their dimensions live in the group scale); fixed parts are modelled in metres around their bbox centre.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PARTS } from './layout.js';
import { UNIT_BOX, partContext, addSolid, addGlow, addShadow, addProxy, addSegments, buildEdges, transformed, HUES } from './stand-kit.js';
import { decalMaterial } from './materials.js';
import { buildCounter, buildTotem, buildCoffee, buildTable, buildChair, buildLogo } from './furniture.js';

const SLATS_PER_FACE = 5;
const SLAT_SPAN = 0.38;      // unit half-span of the slat field on each face (corners get posts)
const SLAT_W = 0.1;
const SLAT_D = 0.12;
const CORE = 0.8;

function buildPlatform(ctx) {
  const { base, tex } = ctx.shared;
  addSolid(ctx, UNIT_BOX, base.lacquer);
  addSolid(ctx, ctx.shared.planeGeo, base.carpet, { pos: [0, 0.52, 0], rot: [-Math.PI / 2, 0, 0], scale: [0.994, 0.994, 1], edge: false });
  addShadow(ctx, 1.42, 1.42, -0.49, 0.7, 'rect');
  const spill = new THREE.Mesh(ctx.shared.planeGeo, decalMaterial(tex.spill, { opacity: 0 }));
  spill.rotation.x = -Math.PI / 2;
  spill.position.y = -0.47;
  spill.scale.set(1.5, 1.5, 1);
  spill.renderOrder = 0;
  ctx.group.add(spill);
  ctx.spill = spill;
}

function buildStrip(ctx) {
  addGlow(ctx, UNIT_BOX, 'floor', HUES.floor, { haloGrow: [1, 7, 7] });
}

/** Column slats: 5 per face + corner posts, merged into one oak mesh around a dark core (grooves read as shadow). */
function slatGeometry() {
  const list = [];
  const pitch = (SLAT_SPAN * 2) / SLATS_PER_FACE;
  const faceZ = 0.5 - SLAT_D / 2;
  for (let f = 0; f < 4; f++) {
    const ry = (f * Math.PI) / 2;
    for (let i = 0; i < SLATS_PER_FACE; i++) {
      const u = -SLAT_SPAN + pitch * (i + 0.5);
      const x = Math.cos(ry) * u + Math.sin(ry) * faceZ;
      const z = -Math.sin(ry) * u + Math.cos(ry) * faceZ;
      list.push({ geo: UNIT_BOX, pos: [x, 0, z], rot: [0, ry, 0], scale: [SLAT_W, 1, SLAT_D] });
    }
  }
  const post = 0.5 - SLAT_SPAN - 0.012;
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const c = 0.5 - post / 2;
    list.push({ geo: UNIT_BOX, pos: [sx * c, 0, sz * c], scale: [post, 1, post] });
  }
  return mergeGeometries(transformed(list));
}

let slatGeo = null;

/** Blueprint hatching for the slat cladding: four vertical strokes per face. */
function hatch() {
  const out = [];
  for (const u of [-0.3, -0.1, 0.1, 0.3]) {
    out.push(u, -0.5, 0.5, u, 0.5, 0.5, u, -0.5, -0.5, u, 0.5, -0.5, 0.5, -0.5, u, 0.5, 0.5, u, -0.5, -0.5, u, -0.5, 0.5, u);
  }
  return out;
}

function buildColumn(ctx) {
  const { base } = ctx.shared;
  slatGeo = slatGeo || slatGeometry();
  addSolid(ctx, UNIT_BOX, base.oakCore, { scale: [CORE, 1, CORE], edge: false });
  addSolid(ctx, slatGeo, base.oak, { edge: false });
  addProxy(ctx, UNIT_BOX);
  addSegments(ctx, hatch());
  const capH = 0.012 / 3.36;
  addSolid(ctx, UNIT_BOX, base.metal, { pos: [0, 0.5 - capH / 2, 0], scale: [1.03, capH, 1.03], edge: false });
  addSolid(ctx, UNIT_BOX, base.metal, { pos: [0, -0.5 + capH / 2, 0], scale: [1.03, capH, 1.03], edge: false });
}

/** Header beam: satin lacquer box; pink band on the outer lower edge, cyan band on the inner lower edge. */
function buildBeam(ctx) {
  const { meta } = ctx;
  const L = meta.A.sx;
  const bandY = -0.5 + 0.075;
  const bandH = 0.09;
  const bandD = 0.045;
  addSolid(ctx, UNIT_BOX, ctx.shared.base.lacquer);
  addGlow(ctx, UNIT_BOX, 'headerPink', HUES.headerPink, { pos: [0, bandY, 0.5 + bandD / 2], scale: [1, bandH, bandD], edge: false, haloGrow: [1, 5, 9] });
  addGlow(ctx, UNIT_BOX, 'headerCyan', HUES.headerCyan, { pos: [0, bandY, -0.5 - bandD / 2], scale: [1, bandH, bandD], edge: false, haloGrow: [1, 5, 9] });
  if (meta.id === 'header-f' || meta.id === 'header-b') {
    const endT = 0.018 / L;
    for (const sx of [-1, 1]) {
      addGlow(ctx, UNIT_BOX, 'headerPink', HUES.headerPink, { pos: [sx * (0.5 + endT / 2), bandY, 0], scale: [endT, bandH, 1 + bandD * 2], edge: false, halo: false });
    }
  }
}

function buildSign(ctx) {
  const { meta, shared } = ctx;
  const map = meta.id === 'sign-f' || meta.id === 'sign-b' ? shared.tex.signWord : shared.tex.signSub;
  const mat = new THREE.MeshBasicMaterial({ map, toneMapped: false });
  addSolid(ctx, shared.planeGeo, mat, { scale: [meta.dims.w, meta.dims.h, 1] });
}

const BUILDERS = {
  platform: buildPlatform,
  strip: buildStrip,
  column: buildColumn,
  beam: buildBeam,
  sign: buildSign,
  counter: buildCounter,
  totem: (ctx) => buildTotem(ctx, ctx.meta.id === 'totem-l' ? 0 : 1),
  coffee: buildCoffee,
  table: buildTable,
  chair: buildChair,
  logo: buildLogo,
};

/** Build all parts. shared = { base, tex, font, quality, planeGeo }. Returns { root, parts[] }. */
export function buildStand(shared) {
  const root = new THREE.Group();
  root.name = 'stand';
  const parts = PARTS.map((meta) => {
    const ctx = partContext(meta, shared);
    BUILDERS[meta.kind](ctx);
    const edges = buildEdges(ctx);
    root.add(ctx.group);
    return {
      meta,
      group: ctx.group,
      fx: ctx.fx,
      glows: ctx.glows,
      halos: ctx.halos,
      shadows: ctx.shadows,
      cables: ctx.cables,
      spill: ctx.spill,
      edges,
    };
  });
  return { root, parts };
}
