// PURE parametric stand description — no three.js, no DOM (imported by node tests).
// One description function, two specs: A = 5×5 m island (hero), R = 7.2×3.6 m linear stand (reuse).
// Rectilinear parts live as unit geometry + (sx, sy, sz) so layouts lerp cleanly; fixed parts keep scale 1.
// Every part origin is its bounding-box centre; rotations use Euler order 'YXZ' (tilt first, yaw last).

export const PLATFORM_H = 0.12;
export const COLUMN_H = 3.36;
export const HEADER_H = 0.72;
export const BEAM_D = 0.4;
export const COLUMN_W = 0.42;
export const COLUMN_INSET = 0.35;
export const STRIP_T = 0.03;
export const SIGN_H = 0.44;
export const HEADER_Y = PLATFORM_H + COLUMN_H + HEADER_H / 2; // 3.84 → header top 4.20
export const STAND_TOP = PLATFORM_H + COLUMN_H + HEADER_H;

const HALF_PI = Math.PI / 2;

// Fixed-size part bounding boxes (metres).
export const FIXED_DIMS = {
  counter: { w: 2.4, h: 1.05, d: 0.62 },
  totem: { w: 0.56, h: 2.8, d: 0.42 },
  coffee: { w: 1.5, h: 1.4, d: 0.62 },
  table: { w: 0.72, h: 0.74, d: 0.72 },
  chair: { w: 0.74, h: 0.78, d: 0.72 },
  logo: { w: 1.76, h: 0.46, d: 0.14 },
  signLong: { w: 3.2, h: SIGN_H, d: 0.01 },
  signShort: { w: 2.0, h: SIGN_H, d: 0.01 },
};

// Furniture placement per layout (x, z in metres, ry in radians). y is derived from the bbox.
const SPEC_A = {
  w: 5, d: 5,
  logo: { x: -0.75, y: 2.32, z: 0.2, ry: 0.25 },
  counter: { x: 0, z: 1.25, ry: 0 },
  'totem-l': { x: -1.55, z: 1.72, ry: 0 },
  'totem-r': { x: 1.55, z: 1.72, ry: 0 },
  coffee: { x: -0.9, z: -1.8, ry: 0 },
  'table-1': { x: 1.0, z: -0.75, ry: 0 },
  'table-2': { x: -1.0, z: -0.35, ry: 0 },
  'chair-1': { x: 1.0, z: 0.0, ry: Math.PI },
  'chair-2': { x: 1.0, z: -1.5, ry: 0 },
  'chair-3': { x: -1.75, z: -0.35, ry: HALF_PI },
  'chair-4': { x: -0.25, z: -0.35, ry: -HALF_PI },
};

const SPEC_R = {
  w: 7.2, d: 3.6,
  logo: { x: 0.9, y: 2.32, z: 0.3, ry: 0.3 },
  counter: { x: -1.7, z: 0.85, ry: 0 },
  'totem-l': { x: -0.1, z: 1.05, ry: 0 },
  'totem-r': { x: 2.7, z: 1.05, ry: 0 },
  coffee: { x: -2.2, z: -1.1, ry: 0 },
  'table-1': { x: 0.9, z: -0.5, ry: 0 },
  'table-2': { x: 2.3, z: -0.5, ry: 0 },
  'chair-1': { x: 0.9, z: 0.22, ry: Math.PI },
  'chair-2': { x: 0.9, z: -1.22, ry: 0 },
  'chair-3': { x: 2.3, z: 0.22, ry: Math.PI },
  'chair-4': { x: 2.3, z: -1.22, ry: 0 },
};

// Part catalogue in BUILD ORDER (Kurulum): platform → floor neon → columns → header → signs → counter → totems → furniture → logo.
const CATALOGUE = [
  ['platform', 'platform'],
  ['strip-f', 'strip'], ['strip-b', 'strip'], ['strip-l', 'strip'], ['strip-r', 'strip'],
  ['column-1', 'column'], ['column-2', 'column'], ['column-3', 'column'], ['column-4', 'column'],
  ['header-f', 'beam'], ['header-b', 'beam'], ['header-l', 'beam'], ['header-r', 'beam'],
  ['sign-f', 'sign'], ['sign-b', 'sign'], ['sign-l', 'sign'], ['sign-r', 'sign'],
  ['counter', 'counter'],
  ['totem-l', 'totem'], ['totem-r', 'totem'],
  ['coffee', 'coffee'],
  ['table-1', 'table'], ['table-2', 'table'],
  ['chair-1', 'chair'], ['chair-2', 'chair'], ['chair-3', 'chair'], ['chair-4', 'chair'],
  ['logo', 'logo'],
];

// Flight-case packing list: crate index (NLS-01 … NLS-08) per part. Slot = order inside the crate.
const CRATE_OF = {
  platform: 0,
  'strip-f': 1, 'strip-b': 1, 'strip-l': 1, 'strip-r': 1,
  'column-1': 2, 'column-2': 2, 'column-3': 3, 'column-4': 3,
  'header-f': 4, 'header-b': 4, 'sign-f': 4, 'sign-b': 4,
  'header-l': 5, 'header-r': 5, 'sign-l': 5, 'sign-r': 5,
  counter: 6, 'totem-l': 6, 'totem-r': 6, coffee: 6,
  'table-1': 7, 'table-2': 7, 'chair-1': 7, 'chair-2': 7, 'chair-3': 7, 'chair-4': 7, logo: 7,
};
export const CRATE_COUNT = 8;

const t = (x, y, z, ry = 0, sx = 1, sy = 1, sz = 1) => ({ x, y, z, ry, sx, sy, sz });

/** Rectilinear skeleton (platform, strips, columns, header, signs) derived from footprint w × d. */
function skeleton(w, d) {
  const cx = w / 2 - COLUMN_INSET;
  const cz = d / 2 - COLUMN_INSET;
  const colY = PLATFORM_H + COLUMN_H / 2;
  const longBeam = 2 * cx + BEAM_D;
  const shortBeam = 2 * cz - BEAM_D;
  const stripY = 0.05;
  const face = BEAM_D / 2 + 0.006;
  const signY = HEADER_Y + 0.02;
  return {
    platform: t(0, PLATFORM_H / 2, 0, 0, w, PLATFORM_H, d),
    'strip-f': t(0, stripY, d / 2 + STRIP_T / 2, 0, w + STRIP_T, STRIP_T, STRIP_T),
    'strip-b': t(0, stripY, -d / 2 - STRIP_T / 2, 0, w + STRIP_T, STRIP_T, STRIP_T),
    'strip-l': t(-w / 2 - STRIP_T / 2, stripY, 0, HALF_PI, d + STRIP_T, STRIP_T, STRIP_T),
    'strip-r': t(w / 2 + STRIP_T / 2, stripY, 0, HALF_PI, d + STRIP_T, STRIP_T, STRIP_T),
    'column-1': t(-cx, colY, cz, 0, COLUMN_W, COLUMN_H, COLUMN_W),
    'column-2': t(cx, colY, cz, 0, COLUMN_W, COLUMN_H, COLUMN_W),
    'column-3': t(cx, colY, -cz, 0, COLUMN_W, COLUMN_H, COLUMN_W),
    'column-4': t(-cx, colY, -cz, 0, COLUMN_W, COLUMN_H, COLUMN_W),
    'header-f': t(0, HEADER_Y, cz, 0, longBeam, HEADER_H, BEAM_D),
    'header-b': t(0, HEADER_Y, -cz, Math.PI, longBeam, HEADER_H, BEAM_D),
    'header-l': t(-cx, HEADER_Y, 0, -HALF_PI, shortBeam, HEADER_H, BEAM_D),
    'header-r': t(cx, HEADER_Y, 0, HALF_PI, shortBeam, HEADER_H, BEAM_D),
    'sign-f': t(0, signY, cz + face, 0),
    'sign-b': t(0, signY, -cz - face, Math.PI),
    'sign-l': t(-cx - face, signY, 0, -HALF_PI),
    'sign-r': t(cx + face, signY, 0, HALF_PI),
  };
}

function fixedDimsOf(id, kind) {
  if (kind === 'sign') return id === 'sign-f' || id === 'sign-b' ? FIXED_DIMS.signLong : FIXED_DIMS.signShort;
  return FIXED_DIMS[kind];
}

/** The ONE parametric description: spec → { partId: transform }. */
export function describeLayout(spec) {
  const out = skeleton(spec.w, spec.d);
  for (const [id, kind] of CATALOGUE) {
    if (out[id]) continue;
    const place = spec[id];
    const dims = fixedDimsOf(id, kind);
    const y = place.y ?? PLATFORM_H + dims.h / 2;
    out[id] = t(place.x, y, place.z, place.ry);
  }
  return out;
}

export const LAYOUT_A = describeLayout(SPEC_A);
export const LAYOUT_R = describeLayout(SPEC_R);

/** Exploded-axonometric offsets (workshop view): every part pushed out along its own axis. */
function explodeOffset(id, kind, a) {
  const radial = (k, lift) => ({ dx: a.x * k, dy: lift, dz: a.z * k });
  switch (kind) {
    case 'platform': return { dx: 0, dy: -0.02, dz: 0 };
    case 'strip': return radial(0.2, 0.28);
    case 'column': return radial(0.32, 0.55);
    case 'beam': return { dx: a.x * 0.22, dy: 1.75, dz: a.z * 0.22 };
    case 'sign': return { dx: a.x * 0.5, dy: 1.75, dz: a.z * 0.5 };
    case 'logo': return { dx: 0, dy: 0.62, dz: 0.2 };
    case 'counter': return { dx: 0, dy: 0.25, dz: 1.35 };
    case 'totem': return { dx: Math.sign(a.x) * 0.95, dy: 0.2, dz: 1.1 };
    case 'coffee': return { dx: -0.4, dy: 0.28, dz: -1.05 };
    case 'table': return { dx: a.x * 0.3, dy: 0.55, dz: a.z * 0.3 };
    default: return { dx: a.x * 0.45, dy: 0.32, dz: a.z * 0.45 };
  }
}

// Knolling (Bakım flat-lay): orientation per kind + footprint on the floor (fx along x, fz along z, h thickness).
function flatSpec(kind, a, dims) {
  switch (kind) {
    case 'platform': return { rx: 0, rz: 0, yaw: 0, fx: a.sx, fz: a.sz, h: a.sy };
    case 'strip': return { rx: 0, rz: 0, yaw: HALF_PI, fx: a.sz, fz: a.sx, h: a.sy };
    case 'column': return { rx: 0, rz: HALF_PI, yaw: 0, fx: a.sy, fz: a.sz, h: a.sx };
    case 'beam': return { rx: -HALF_PI, rz: 0, yaw: Math.abs(a.ry) > 3 ? Math.PI : 0, fx: a.sx, fz: a.sy, h: a.sz };
    case 'sign':
    case 'logo':
    case 'counter': return { rx: -HALF_PI, rz: 0, yaw: 0, fx: dims.w, fz: dims.h, h: dims.d };
    case 'totem': return { rx: -HALF_PI, rz: 0, yaw: HALF_PI, fx: dims.h, fz: dims.w, h: dims.d };
    default: return { rx: 0, rz: 0, yaw: 0, fx: dims.w, fz: dims.d, h: dims.h };
  }
}

const KNOLL_SIDE_ROWS = [
  ['column-1'], ['column-2'], ['column-3'], ['column-4'],
  ['sign-f'], ['sign-b'], ['sign-l', 'sign-r'],
];
const KNOLL_BOTTOM_ROWS = [
  ['header-f', 'header-b'],
  ['header-l', 'header-r', 'logo'],
  ['totem-l', 'counter', 'totem-r'],
  ['coffee', 'table-1', 'chair-1', 'chair-2', 'table-2', 'chair-3', 'chair-4'],
];
const KNOLL_STRIPS = ['strip-f', 'strip-b', 'strip-l', 'strip-r'];
const KNOLL_GAP = 0.3;
const KNOLL_ROW_GAP = 0.3;
const KNOLL_STRIP_PITCH = 0.14;
const KNOLL_CENTER_Z = -1.15;

const rowSize = (ids, flat) => ({
  width: ids.reduce((s, id) => s + flat[id].fx, 0) + KNOLL_GAP * (ids.length - 1),
  depth: Math.max(...ids.map((id) => flat[id].fz)),
});

/** Lay rows left-aligned from (x0, z0) downward; returns the block depth. */
function layRows(rows, flat, x0, z0, pos) {
  let z = z0;
  for (const ids of rows) {
    const { depth } = rowSize(ids, flat);
    let x = x0;
    for (const id of ids) {
      pos[id] = { x: x + flat[id].fx / 2, z: z + depth / 2 };
      x += flat[id].fx + KNOLL_GAP;
    }
    z += depth + KNOLL_ROW_GAP;
  }
  return z - z0 - KNOLL_ROW_GAP;
}

/** Deterministic, near-square flat-lay (fits the right-hand stage on desktop): platform top-left as the mat,
 *  neon strips beside it, small parts in a side block, long parts + furniture in full-width rows below. */
function computeKnolling(flat) {
  const plat = flat.platform;
  const stripsW = KNOLL_STRIPS.length * KNOLL_STRIP_PITCH;
  const sideX = plat.fx + KNOLL_GAP + stripsW + KNOLL_GAP;
  const sideW = Math.max(...KNOLL_SIDE_ROWS.map((r) => rowSize(r, flat).width));
  const bottomW = Math.max(...KNOLL_BOTTOM_ROWS.map((r) => rowSize(r, flat).width));
  const totalW = Math.max(sideX + sideW, bottomW);
  const pos = { platform: { x: plat.fx / 2, z: plat.fz / 2 } };
  KNOLL_STRIPS.forEach((id, i) => { pos[id] = { x: plat.fx + KNOLL_GAP + KNOLL_STRIP_PITCH * (i + 0.5), z: plat.fz / 2 }; });
  const sideD = layRows(KNOLL_SIDE_ROWS, flat, sideX, 0, pos);
  const topD = Math.max(plat.fz, sideD);
  const bottomD = layRows(KNOLL_BOTTOM_ROWS, flat, 0, topD + KNOLL_GAP * 1.5, pos);
  const totalD = topD + KNOLL_GAP * 1.5 + bottomD;
  const dx = -totalW / 2;
  const dz = KNOLL_CENTER_Z - totalD / 2;
  for (const id of Object.keys(pos)) pos[id] = { x: pos[id].x + dx, z: pos[id].z + dz };
  return { pos, bounds: { x0: dx, x1: dx + totalW, z0: dz, z1: dz + totalD } };
}

function buildParts() {
  const crateSlots = new Array(CRATE_COUNT).fill(0);
  const flat = {};
  const base = CATALOGUE.map(([id, kind], build) => {
    const a = LAYOUT_A[id];
    const rect = ['platform', 'strip', 'column', 'beam'].includes(kind);
    const dims = rect ? { w: a.sx, h: a.sy, d: a.sz } : fixedDimsOf(id, kind);
    flat[id] = flatSpec(kind, a, dims);
    const crate = CRATE_OF[id];
    const slot = crateSlots[crate]++;
    return { id, kind, build, rect, dims, crate, slot, A: a, R: LAYOUT_R[id], explode: explodeOffset(id, kind, a) };
  });
  const knoll = computeKnolling(flat);
  const parts = base.map((p) => {
    const f = flat[p.id];
    const k = knoll.pos[p.id];
    return Object.freeze({ ...p, flat: Object.freeze({ ...f, x: k.x, y: f.h / 2 + 0.002, z: k.z }) });
  });
  return { parts: Object.freeze(parts), knollBounds: Object.freeze(knoll.bounds) };
}

const BUILT = buildParts();
export const PARTS = BUILT.parts;
export const KNOLL_BOUNDS = BUILT.knollBounds;
export const PART_COUNT = PARTS.length;
export const partById = (id) => PARTS.find((p) => p.id === id);
