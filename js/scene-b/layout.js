// PURE parametric description of the stand and its world (no three.js, no DOM — node-importable).
// One description, two layouts: A = 5×5 m island (hero), R = 7.2×3.6 m linear stand (reuse).
// Rectilinear parts are "unit" parts: unit geometry, real size lives in `dims` (→ object.scale), so A↔R lerps cleanly.
// Native parts (chairs, counter, logo…) are built at real size, centered on their bounding box (scale 1).

export const PLATFORM_H = 0.14;
export const COL = 0.42;
export const COL_H = 3.0;
export const HDR_H = 0.9;
export const HDR_T = 0.3;
export const HDR_Y = PLATFORM_H + COL_H + HDR_H / 2;
export const CRATE = Object.freeze([1.2, 0.78, 0.8]);
// Hanging logo centre height. The camera looks down from ~5–6 m, so the front header panel hides anything
// above ≈2.8 m at the logo's depth (sight line over the header's bottom edge) — keep the letters below it.
export const LOGO_Y = 2.48;

/** Native part sizes [w, h, d] — builders in stand.js construct geometry to exactly these boxes. */
export const NATIVE_SIZE = Object.freeze({
  column: [COL, COL_H, COL],
  counter: [1.44, 1.12, 0.66], // the logo's "n", extruded: width follows the letter's own proportion (≈ 4 : 3)
  logo: [1.7, 0.55, 0.14],
  totem: [0.62, 2.5, 0.34],
  table: [0.74, 0.74, 0.74],
  chair: [0.78, 0.76, 0.78],
  coffee: [1.5, 1.0, 0.56],
});

const HALF_PI = Math.PI / 2;
const NEON_LIFT = PLATFORM_H / 2;

/** Frame (platform, floor neon, columns, header, truss) for a w×d footprint. */
function frame(w, d) {
  const hw = w / 2;
  const hd = d / 2;
  const cx = hw - 0.45;
  const cz = hd - 0.45;
  const outerX = cx + COL / 2;
  const outerZ = cz + COL / 2;
  const fbLen = outerX * 2;
  const sideLen = outerZ * 2 - HDR_T * 2;
  const strip = (len) => [len + 0.03, 0.036, 0.024];
  const colY = PLATFORM_H + COL_H / 2;
  return {
    platform: { pos: [0, PLATFORM_H / 2, 0], ry: 0, dims: [w, PLATFORM_H, d] },
    floorF: { pos: [0, NEON_LIFT, hd + 0.012], ry: 0, dims: strip(w) },
    floorR: { pos: [hw + 0.012, NEON_LIFT, 0], ry: HALF_PI, dims: strip(d) },
    floorB: { pos: [0, NEON_LIFT, -hd - 0.012], ry: Math.PI, dims: strip(w) },
    floorL: { pos: [-hw - 0.012, NEON_LIFT, 0], ry: -HALF_PI, dims: strip(d) },
    col0: { pos: [-cx, colY, cz], ry: 0 },
    col1: { pos: [cx, colY, cz], ry: 0 },
    col2: { pos: [cx, colY, -cz], ry: 0 },
    col3: { pos: [-cx, colY, -cz], ry: 0 },
    hdrF: { pos: [0, HDR_Y, outerZ - HDR_T / 2], ry: 0, dims: [fbLen, HDR_H, HDR_T] },
    hdrR: { pos: [outerX - HDR_T / 2, HDR_Y, 0], ry: HALF_PI, dims: [sideLen, HDR_H, HDR_T] },
    hdrB: { pos: [0, HDR_Y, -(outerZ - HDR_T / 2)], ry: Math.PI, dims: [fbLen, HDR_H, HDR_T] },
    hdrL: { pos: [-(outerX - HDR_T / 2), HDR_Y, 0], ry: -HALF_PI, dims: [sideLen, HDR_H, HDR_T] },
    truss: { pos: [0, HDR_Y + HDR_H / 2 - 0.07, 0.35], ry: 0, dims: [fbLen - HDR_T * 2, 0.07, 0.07] },
  };
}

const onDeck = (kind) => PLATFORM_H + NATIVE_SIZE[kind][1] / 2;
const facing = (from, to) => Math.atan2(to[0] - from[0], to[2] - from[2]);

function furniture(spec) {
  const out = {};
  for (const [id, kind, x, z, ry] of spec.items) out[id] = { pos: [x, onDeck(kind), z], ry };
  for (const [id, x, z, table] of spec.chairs) {
    const t = spec.items.find((it) => it[0] === table);
    out[id] = { pos: [x, onDeck('chair'), z], ry: facing([x, 0, z], [t[2], 0, t[3]]) };
  }
  out.logo = { pos: [spec.logo[0], LOGO_Y, spec.logo[1]], ry: 0 };
  return out;
}

const LAYOUT_A = {
  ...frame(5, 5),
  ...furniture({
    items: [
      ['counter', 'counter', 0, 1.5, 0],
      ['totem0', 'totem', -1.52, 1.58, 0.12],
      ['totem1', 'totem', 1.62, -1.5, -0.12],
      ['coffee', 'coffee', -0.25, -1.88, 0],
      ['table0', 'table', -1.12, -0.55, 0],
      ['table1', 'table', 1.08, 0.3, 0],
    ],
    chairs: [
      ['chair0', -1.78, -0.12, 'table0'],
      ['chair1', -0.52, -1.02, 'table0'],
      ['chair2', 1.72, 0.78, 'table1'],
      ['chair3', 0.48, -0.22, 'table1'],
    ],
    logo: [0, 0.6],
  }),
};

const LAYOUT_R = {
  ...frame(7.2, 3.6),
  ...furniture({
    items: [
      ['counter', 'counter', -1.55, 0.92, 0],
      ['totem0', 'totem', -2.62, 0.85, 0.1],
      ['totem1', 'totem', 2.62, -0.95, -0.1],
      ['coffee', 'coffee', 0.55, -1.22, 0],
      ['table0', 'table', 1.72, 0.45, 0],
      ['table1', 'table', -0.95, -0.72, 0],
    ],
    chairs: [
      ['chair0', 2.42, 0.78, 'table0'],
      ['chair1', 1.02, 0.86, 'table0'],
      ['chair2', -1.62, -0.42, 'table1'],
      ['chair3', -0.28, -0.98, 'table1'],
    ],
    logo: [-0.2, 0.5],
  }),
};

// Knolling (maintenance): every part laid flat in a tidy grid. rot = [rx, ry, rz] (Euler order YXZ).
const LAY_BACK = -HALF_PI;
const KNOLL = {
  platform: { pos: [-2.6, PLATFORM_H / 2, -1.9], rot: [0, 0, 0] },
  floorF: { pos: [-2.6, 0.018, 1.25], rot: [0, 0, 0] },
  floorR: { pos: [-2.6, 0.018, 1.5], rot: [0, 0, 0] },
  floorB: { pos: [-2.6, 0.018, 1.75], rot: [0, 0, 0] },
  floorL: { pos: [-2.6, 0.018, 2.0], rot: [0, 0, 0] },
  col0: { pos: [-3.45, 0.21, 2.75], rot: [0, 0, HALF_PI] },
  col1: { pos: [-3.45, 0.21, 3.35], rot: [0, 0, HALF_PI] },
  col2: { pos: [-3.45, 0.21, 3.95], rot: [0, 0, HALF_PI] },
  col3: { pos: [-3.45, 0.21, 4.55], rot: [0, 0, HALF_PI] },
  truss: { pos: [-0.6, 0.035, 3.3], rot: [0, 0, 0] },
  hdrF: { pos: [2.95, 0.15, -4.0], rot: [LAY_BACK, 0, 0] },
  hdrB: { pos: [2.95, 0.15, -2.85], rot: [LAY_BACK, Math.PI, 0] },
  hdrR: { pos: [2.65, 0.15, -1.7], rot: [LAY_BACK, 0, 0] },
  hdrL: { pos: [2.65, 0.15, -0.55], rot: [LAY_BACK, 0, 0] },
  totem0: { pos: [6.05, 0.17, -3.3], rot: [LAY_BACK, 0, 0] },
  totem1: { pos: [6.05, 0.17, -0.45], rot: [LAY_BACK, 0, 0] },
  counter: { pos: [1.75, 0.33, 1.35], rot: [LAY_BACK, 0, 0] },
  logo: { pos: [1.75, 0.07, 2.75], rot: [LAY_BACK, 0, 0] },
  coffee: { pos: [4.85, 0.5, 1.2], rot: [0, 0, 0] },
  table0: { pos: [4.25, 0.37, 2.7], rot: [0, 0, 0] },
  table1: { pos: [5.45, 0.37, 2.7], rot: [0, 0, 0] },
  chair0: { pos: [1.0, 0.38, 4.1], rot: [0, 0, 0] },
  chair1: { pos: [2.05, 0.38, 4.1], rot: [0, 0, 0] },
  chair2: { pos: [3.1, 0.38, 4.1], rot: [0, 0, 0] },
  chair3: { pos: [4.15, 0.38, 4.1], rot: [0, 0, 0] },
};

// [id, kind, buildOrder, crate, slot, neon channel(s) carried]
const PART_TABLE = [
  ['platform', 'platform', 0, 0, 0],
  ['floorF', 'neonFloor', 1, 0, 1, 'floor0'],
  ['floorR', 'neonFloor', 2, 0, 2, 'floor1'],
  ['floorB', 'neonFloor', 3, 0, 3, 'floor2'],
  ['floorL', 'neonFloor', 4, 0, 4, 'floor3'],
  ['col0', 'column', 5, 1, 0],
  ['col1', 'column', 6, 1, 1],
  ['col2', 'column', 7, 2, 0],
  ['col3', 'column', 8, 2, 1],
  ['hdrF', 'header', 9, 3, 0, 'hdr'],
  ['hdrR', 'header', 10, 3, 1, 'hdr'],
  ['hdrB', 'header', 11, 4, 0, 'hdr'],
  ['hdrL', 'header', 12, 4, 1, 'hdr'],
  ['truss', 'truss', 13, 4, 2],
  ['counter', 'counter', 14, 5, 0, 'counter'],
  ['totem0', 'totem', 15, 6, 0, 'totem0'],
  ['totem1', 'totem', 16, 6, 1, 'totem1'],
  ['coffee', 'coffee', 17, 6, 2],
  ['table0', 'table', 18, 7, 0],
  ['table1', 'table', 19, 7, 1],
  ['chair0', 'chair', 20, 7, 2],
  ['chair1', 'chair', 21, 7, 3],
  ['chair2', 'chair', 22, 5, 1],
  ['chair3', 'chair', 23, 5, 2],
  ['logo', 'logo', 24, 5, 3, 'logo'],
];

const UNIT_KINDS = new Set(['platform', 'neonFloor', 'header', 'truss']);

function makePart([id, kind, order, crate, slot, channel]) {
  const a = LAYOUT_A[id];
  const r = LAYOUT_R[id];
  const unit = UNIT_KINDS.has(kind);
  const size = unit ? a.dims : NATIVE_SIZE[kind];
  return Object.freeze({
    id, kind, order, unit, channel: channel || null, size,
    crate, slot,
    A: { pos: a.pos, rot: [0, a.ry, 0], dims: unit ? a.dims : [1, 1, 1] },
    R: { pos: r.pos, rot: [0, r.ry, 0], dims: unit ? r.dims : [1, 1, 1] },
    K: { pos: KNOLL[id].pos, rot: KNOLL[id].rot, dims: unit ? a.dims : [1, 1, 1] },
  });
}

export const PARTS = Object.freeze(PART_TABLE.map(makePart));
export const PART_COUNT = PARTS.length;
export const CRATE_COUNT = 8;

// Crates. The İstanbul side (packing block + warehouse rack) sits LEFT of the stand, the Antalya side
// (hall block where the stand is installed) RIGHT of it, so the transport road can run one way across
// the frame — İstanbul upper-left → Antalya lower-right — instead of looping back to where it started.
const slotBlock = (x0, x1) => Array.from({ length: CRATE_COUNT }, (_, i) => [i < 4 ? x0 : x1, CRATE[1] / 2, -1.35 + (i % 4) * 0.9]);
/** Where crates appear for packing (workshop / İstanbul side). */
export const PACK_SLOTS = Object.freeze(slotBlock(-4.35, -5.68));
/** Congress-hall block (Antalya side): unloading, install, dismantle, unpack for maintenance. */
export const HALL_SLOTS = Object.freeze(slotBlock(4.35, 5.68));
export const RACK = Object.freeze({ x0: -8.8, z: -3.7, bays: 4, bay: 1.4, levels: [0.12, 1.2], depth: 1.0, height: 2.3 });
export const RACK_SLOTS = Object.freeze(
  Array.from({ length: CRATE_COUNT }, (_, i) => [
    RACK.x0 + RACK.bay * (RACK.bays - (i % 4) - 0.5),
    RACK.levels[Math.floor(i / 4)] + CRATE[1] / 2,
    RACK.z,
  ]),
);
export const TRUCK = Object.freeze({ deckY: 0.96, bedX0: -2.4, bedX1: 0.7, width: 1.9 });
export const TRUCK_SLOTS = Object.freeze(
  Array.from({ length: CRATE_COUNT }, (_, i) => [
    i % 2 === 0 ? -0.22 : -1.48,
    TRUCK.deckY + CRATE[1] / 2 + (i >= 4 ? CRATE[1] + 0.02 : 0),
    (Math.floor(i / 2) % 2 === 0 ? 1 : -1) * 0.42,
  ]),
);

// Transport route (world XZ). The truck arrives at the loading bay in front of the rack (İstanbul), drives a
// winding highway — straight runs joined by distinct bends — past Ankara to Antalya beside the hall block,
// and leaves toward the lower right. Seen from the transport camera (azimuth ≈ 20°) the whole road runs
// from the upper-left of the frame to the lower-right.
export const ROUTE_IN = Object.freeze([[-21, -1.6], [-15, -1.6], [-10.5, -1.6], [-6.9, -1.6]]);
export const ROUTE = Object.freeze([
  [-6.9, -1.6], [-4.6, -1.5], [-2.7, -2.5], [-0.7, -3.9], [1.6, -3.7], [3.4, -2.2],
  [4.6, 0.2], [6.2, 2.4], [8.6, 3.1], [10.4, 4.4],
]);
export const ROUTE_OUT = Object.freeze([[10.4, 4.4], [12.2, 5.9], [15.2, 7.0], [19.5, 7.6], [22.5, 7.9]]);
export const CITIES = Object.freeze([
  { name: 'İSTANBUL', pos: [-6.9, -1.6], label: [-1.5, 1.2] },
  { name: 'ANKARA', pos: [3.4, -2.2], label: [1.5, -0.5] },
  { name: 'ANTALYA', pos: [10.4, 4.4], label: [0.8, 1.2] },
]);
