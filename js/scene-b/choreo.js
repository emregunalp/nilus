// PURE choreography — the whole film as deterministic functions of progress P ∈ [-1, 9].
// Zero imports of three.js or the DOM (node-testable). Everything the scene shows is f(P);
// only ambient motion (idle sway, dust) and the load-time draw-in of the hero drawing may add
// wall-clock time, and never in snap mode (the clock is then null → the drawing is complete).

import {
  PARTS, PART_COUNT, CRATE_COUNT, CRATE, HALL_SLOTS, PACK_SLOTS, RACK_SLOTS, TRUCK_SLOTS,
  ROUTE_IN, ROUTE, ROUTE_OUT,
} from './layout.js';
import { buildPath, SAMPLES_PER_SEG } from './route.js';

export const P_MIN = -1;
export const P_MAX = 9;

// ── easing ────────────────────────────────────────────────────────────────────────────────
export const clamp01 = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { const x = clamp01(t); return x * x * (3 - 2 * x); };
export const easeInOut = (t) => { const x = clamp01(t); return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2; };
export const easeOut = (t) => 1 - (1 - clamp01(t)) ** 3;
export const easeIn = (t) => clamp01(t) ** 3;
export const easeSine = (t) => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(t));
export const segment = (P, a, b) => clamp01((P - a) / (b - a));
/** 0 → 1 → 0 bump over [a, b]. */
export const bump = (P, a, b) => Math.sin(Math.PI * segment(P, a, b));
export const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

export const STAGE_NAMES = Object.freeze([
  'Tasarım', 'Üretim', 'Depolama', 'Nakliye', 'Kurulum', 'Söküm', 'Bakım', 'Yeniden Kullanım',
]);

/** P → { index: -1 (hero) … 7, 8 (outro), t ∈ [0,1) }. */
export function stageOf(P) {
  const p = Math.min(P_MAX, Math.max(P_MIN, P));
  if (p < 0) return { index: -1, t: p + 1 };
  if (p >= 8) return { index: 8, t: Math.min(1, p - 8) };
  const index = Math.floor(p);
  return { index, t: p - index };
}

/** Item i of n gets its own sub-window inside [a, b]; `span` = fraction of the window each item occupies. */
export function stagger(P, a, b, i, n, span = 0.35) {
  const len = b - a;
  const d = len * span;
  const step = n > 1 ? (len - d) / (n - 1) : 0;
  return segment(P, a + step * i, a + step * i + d);
}

// ── timeline (single source of truth for every window) ───────────────────────────────────
// A stage's text card is fully on screen for roughly P ∈ [i + 0.28, i + 0.73] (desktop; a little earlier on phones)
// and has left by i + 1. What a stage is about must be on screen inside that window: Kurulum's finished, lit stand
// used to arrive only as its card was leaving (client, 2026-10-08), so the truck now arrives earlier, the stand is
// complete as the card settles and the neon comes on in front of the reader, then holds until Söküm.
export const T = Object.freeze({
  drawScroll: [-0.95, -0.3], // scrolling finishes the load-time draw-in if it is still running
  axes: [-0.6, 0.4], // cyan construction lines grow through the stand
  dims: [-0.1, 0.6], // ink dimension lines grow
  labels: [0.15, 0.7], // dimension figures + title block
  blueprintOff: [1.02, 1.34], // construction layer recedes as the volumes form
  form: [1.04, 1.9], // in place, build order: ink → paper-white volume → real materials
  crateIn: [2.02, 2.14],
  pack: [2.06, 2.44],
  lidClose1: [2.42, 2.52],
  toRack: [2.5, 2.84],
  truckIn: [2.76, 2.97],
  load: [2.97, 3.2],
  drive: [3.22, 3.72],
  unload: [3.72, 3.94],
  lidOpen1: [3.9, 3.98],
  truckOut: [3.96, 4.12],
  install: [3.96, 4.28],
  crateOut1: [4.25, 4.34],
  ignite: [4.3, 4.5], // first time the neon is ever lit (Kurulum climax)
  douse: [5.02, 5.26],
  crateIn2: [5.06, 5.16],
  dismantle: [5.12, 5.8],
  lidClose2: [5.78, 5.9],
  lidOpen2: [6.0, 6.08],
  unpack: [6.04, 6.4],
  crateOut2: [6.36, 6.48],
  scan: [6.34, 6.86],
  reuse: [7.0, 7.36],
  reignite: [7.34, 7.6],
  ring: [7.4, 8.0],
  ringClose: [8.0, 8.7],
});

/** Load-time draw-in of the hero drawing (seconds after mount; only when not in snap mode).
 *  Client (2026-09-26): "çizim animasyonunu biraz yavaşlat" — 0.35–3.3 s → 0.5–6.0 s (≈1.8× slower).
 *  Client (2026-10-08): the opening felt long — "kısaltalım ve daha rahat aksın" → 0.25–4.2 s; the clock now also
 *  starts only once the first frame is ready (index.js), so none of it is lost behind the loading. */
export const INTRO = Object.freeze({ start: 0.25, end: 4.2, span: 0.4, grid: [0.05, 1.3] });
const FORM_SPAN = 0.34;

// ── pose helpers ───────────────────────────────────────────────────────────────────────────
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** Blend two poses. `tk` (defaults to t) lets scale ease more gently than position for big parts. */
function mixPose(a, b, t, arc = 0, tk = t) {
  const pos = lerp3(a.pos, b.pos, t);
  pos[1] += arc * Math.sin(Math.PI * t);
  return { pos, rot: lerp3(a.rot, b.rot, t), dims: lerp3(a.dims, b.dims, tk), k: lerp(a.k, b.k, tk) };
}

const withK = (state, k = 1) => ({ pos: state.pos, rot: state.rot, dims: state.dims, k });

// ── transport paths (built once; pure) ─────────────────────────────────────────────────────
// One C1 path (arrival → İstanbul → Ankara → Antalya → exit) so the heading never kinks at a junction.
const J1 = ROUTE_IN.length - 1;
const J2 = J1 + ROUTE.length - 1;
const PATH = buildPath([...ROUTE_IN, ...ROUTE.slice(1), ...ROUTE_OUT.slice(1)]);
const U1 = PATH.knotU(J1);
const U2 = PATH.knotU(J2);
export const PATHS = Object.freeze({
  full: PATH,
  main: { pts: PATH.pts.slice(J1 * SAMPLES_PER_SEG, J2 * SAMPLES_PER_SEG + 1) },
  /** Arc-length fractions of İstanbul and Antalya on the full path. */
  mainU: Object.freeze([U1, U2]),
});

/** Truck world pose. yaw maps truck-local +X (forward) onto the path tangent. */
export function truckPose(P) {
  let u;
  if (P < T.truckIn[1]) u = lerp(0, U1, easeOut(segment(P, T.truckIn[0], T.truckIn[1])));
  else if (P < T.drive[0]) u = U1;
  else if (P < T.truckOut[0]) u = lerp(U1, U2, easeSine(segment(P, T.drive[0], T.drive[1])));
  else u = lerp(U2, 1, easeIn(segment(P, T.truckOut[0], T.truckOut[1])));
  const at = PATH.at(u);
  const alpha = smooth(segment(P, T.truckIn[0], T.truckIn[0] + 0.06)) * (1 - smooth(segment(P, T.truckOut[1] - 0.05, T.truckOut[1])));
  return { pos: [at.x, 0, at.z], yaw: at.yaw, alpha, visible: alpha > 0.004 };
}

/** Fraction of the İstanbul → Antalya road already travelled (drives the progress trace). */
export function routeProgress(P) {
  return easeSine(segment(P, T.drive[0], T.drive[1]));
}

function truckLocalToWorld(local, P) {
  const tp = truckPose(P);
  const c = Math.cos(tp.yaw);
  const s = Math.sin(tp.yaw);
  // rotation about Y by yaw: x' = x cos + z sin, z' = -x sin + z cos
  return { pos: [tp.pos[0] + local[0] * c + local[2] * s, local[1], tp.pos[2] - local[0] * s + local[2] * c], yaw: tp.yaw };
}

// ── crates ────────────────────────────────────────────────────────────────────────────────
const crateState = (pos, ry, k = 1) => ({ pos, rot: [0, ry, 0], dims: [1, 1, 1], k });

/** Crate pose: { pos, rot, dims, k, lid (0 closed … 1 open), visible }. */
export function cratePose(ci, P) {
  const n = CRATE_COUNT;
  const pack = crateState(PACK_SLOTS[ci], 0);
  const hall = crateState(HALL_SLOTS[ci], 0);
  const rack = crateState(RACK_SLOTS[ci], 0);
  const lift = (s) => ({ ...s, pos: [s.pos[0], s.pos[1] + 0.35, s.pos[2]], k: 0 });
  let pose;
  if (P < T.toRack[0]) {
    pose = mixPose(lift(pack), pack, smooth(stagger(P, ...T.crateIn, ci, n, 0.5)));
  } else if (P < T.load[0]) {
    pose = mixPose(pack, rack, easeInOut(stagger(P, ...T.toRack, ci, n, 0.45)), 0.6);
  } else if (P < T.drive[0]) {
    const tw = truckLocalToWorld(TRUCK_SLOTS[ci], P);
    pose = mixPose(rack, crateState(tw.pos, tw.yaw), easeInOut(stagger(P, ...T.load, ci, n, 0.4)), 1.1);
  } else if (P < T.unload[0]) {
    const tw = truckLocalToWorld(TRUCK_SLOTS[ci], P);
    pose = crateState(tw.pos, tw.yaw);
  } else if (P < T.crateOut1[0]) {
    const tw = truckLocalToWorld(TRUCK_SLOTS[ci], P);
    pose = mixPose(crateState(tw.pos, tw.yaw), hall, easeInOut(stagger(P, ...T.unload, ci, n, 0.5)), 1.2);
  } else if (P < T.crateIn2[0]) {
    pose = mixPose(hall, lift(hall), smooth(stagger(P, ...T.crateOut1, ci, n, 0.5)));
  } else if (P < T.crateOut2[0]) {
    pose = mixPose(lift(hall), hall, smooth(stagger(P, ...T.crateIn2, ci, n, 0.5)));
  } else {
    pose = mixPose(hall, lift(hall), smooth(stagger(P, ...T.crateOut2, ci, n, 0.5)));
  }
  return { ...pose, lid: crateLid(ci, P), visible: pose.k > 0.004 };
}

function crateLid(ci, P) {
  const n = CRATE_COUNT;
  const open1 = 1 - smooth(stagger(P, ...T.lidClose1, ci, n, 0.5));
  if (P < T.lidOpen1[0]) return open1;
  const open2 = smooth(stagger(P, ...T.lidOpen1, ci, n, 0.5));
  if (P < T.crateIn2[0]) return open2;
  const close2 = 1 - smooth(stagger(P, ...T.lidClose2, ci, n, 0.5));
  if (P < T.lidOpen2[0]) return close2;
  return smooth(stagger(P, ...T.lidOpen2, ci, n, 0.5));
}

/** Where a part sits inside its crate (shrunk to k = 0 — invisible, but still continuous in space). */
function inCrate(part, P) {
  const c = cratePose(part.crate, P);
  const off = (part.slot - 2) * 0.16;
  const cs = Math.cos(c.rot[1]);
  const sn = Math.sin(c.rot[1]);
  return { pos: [c.pos[0] + off * cs, c.pos[1], c.pos[2] - off * sn], rot: [0, c.rot[1], 0], dims: part.A.dims, k: 0 };
}

function crateMouth(part, P) {
  const c = inCrate(part, P);
  const maxDim = Math.max(...part.size);
  return { ...c, pos: [c.pos[0], c.pos[1] + 1.05, c.pos[2]], k: Math.min(0.34, 0.95 / maxDim) };
}

/** Two-phase flight into a crate: arc to the crate mouth while shrinking, then drop inside. */
function packLeg(from, part, P, u) {
  const mouth = crateMouth(part, P);
  if (u < 0.72) { const v = u / 0.72; return mixPose(from, mouth, easeInOut(v), 0.9, smooth(v)); }
  const v = (u - 0.72) / 0.28;
  return mixPose(mouth, inCrate(part, P), easeIn(v), 0, smooth(v));
}

function unpackLeg(to, part, P, u) {
  const mouth = crateMouth(part, P);
  if (u < 0.28) { const v = u / 0.28; return mixPose(inCrate(part, P), mouth, easeOut(v), 0, smooth(v)); }
  const v = (u - 0.28) / 0.72;
  return mixPose(mouth, to, easeInOut(v), 0.9, smooth(v));
}

// ── stand parts ───────────────────────────────────────────────────────────────────────────
const N = PART_COUNT;
const rev = (part) => N - 1 - part.order;

/**
 * Part pose at P: { pos, rot (Euler YXZ), dims (unit parts' size → scale), k (uniform multiplier), visible }.
 * The stand is drawn and then materialises IN PLACE (no exploded kit): layout A from the hero until packing.
 * The legs are chained so each starts exactly where the previous one ended (continuity invariant).
 */
export function partPose(part, P) {
  const A = withK(part.A);
  const R = withK(part.R);
  const K = withK(part.K);
  let pose;
  if (P < T.pack[0]) pose = A;
  else if (P < T.install[0]) pose = packLeg(A, part, P, stagger(P, ...T.pack, rev(part), N, 0.35));
  else if (P < T.dismantle[0]) {
    const u = stagger(P, ...T.install, part.order, N, 0.26);
    pose = u >= 1 ? A : unpackLeg(A, part, P, u);
  } else if (P < T.unpack[0]) pose = packLeg(A, part, P, stagger(P, ...T.dismantle, rev(part), N, 0.26));
  else if (P < T.reuse[0]) {
    const u = stagger(P, ...T.unpack, part.order, N, 0.46);
    pose = u >= 1 ? K : unpackLeg(K, part, P, u);
  } else pose = mixPose(K, R, easeInOut(stagger(P, ...T.reuse, part.order, N, 0.3)), 0.8);
  return { ...pose, visible: pose.k > 0.004 };
}

/** Scanner sweep X during maintenance (world), and its visibility. */
export function scanState(P) {
  const u = segment(P, ...T.scan);
  return { x: lerp(-5.6, 7.2, u), alpha: smooth(segment(P, T.scan[0] - 0.03, T.scan[0] + 0.04)) * (1 - smooth(segment(P, T.scan[1] - 0.04, T.scan[1] + 0.03))) };
}

/**
 * Load-time draw-in of one part's ink drawing: seconds since mount → 0…1, staggered in build order.
 * `clock === null` (snap mode / reduced motion) → the drawing is complete.
 */
export function introDraw(part, clock) {
  if (clock === null || clock === undefined) return 1;
  return easeSine(stagger(clock, INTRO.start, INTRO.end, part.order, N, INTRO.span));
}

/** Global 0…1 fade of the drawing paper (grid) on load; 1 when the clock is null. */
export function introLevel(clock) {
  if (clock === null || clock === undefined) return 1;
  return smooth(segment(clock, ...INTRO.grid));
}

/** Formation progress of one part (0 = ink drawing … 1 = real object), build order, in place. */
export function formOf(part, P) {
  return stagger(P, ...T.form, part.order, N, FORM_SPAN);
}

/**
 * Material channels for a part at P (`drawn` = its load-time draw-in, 1 when complete):
 *  lineDraw / lineAlpha — ink drawing (fraction of edges plotted / opacity)
 *  fill   — 1 once the body takes part in the picture (hidden-line occluder, then volume/material)
 *  volume — 0 = flat paper (reads as the background, only hides lines behind it) … 1 = shaded paper-white volume
 *  solid  — 0 = paper-white … 1 = real materials (oak, lacquer, charcoal, fabric)
 *  glow — maintenance scan highlight · check — maintenance tick.
 */
export function partLook(part, P, drawn = 1) {
  const f = formOf(part, P);
  const volume = smooth(segment(f, 0, 0.55));
  const solid = smooth(segment(f, 0.4, 1));
  const lineAlpha = 1 - smooth(segment(f, 0.5, 1));
  const scrolled = easeSine(stagger(P, ...T.drawScroll, part.order, N, 0.5));
  const lineDraw = Math.max(clamp01(drawn), scrolled);
  const fill = lineDraw > 0.001 || volume > 0 ? 1 : 0;
  const sc = scanState(P);
  const kx = part.K.pos[0];
  const inScan = P > T.scan[0] - 0.05 && P < T.reuse[0] + 0.05;
  const glow = inScan ? Math.exp(-(((sc.x - kx) / 0.55) ** 2)) * sc.alpha : 0;
  const passed = inScan ? smooth((sc.x - kx - 0.15) / 0.6) : 0;
  const check = passed * (1 - smooth(segment(P, T.reuse[0], T.reuse[0] + 0.12)));
  return { solid, volume, fill, lineDraw, lineAlpha, glow, check };
}

// ── neon ──────────────────────────────────────────────────────────────────────────────────
export const NEON_CHANNELS = Object.freeze([
  'floor0', 'floor1', 'floor2', 'floor3', 'hdrPink', 'hdrCyan', 'counter', 'totem0', 'totem1', 'logo',
]);
const NEON_ORDER = Object.fromEntries(NEON_CHANNELS.map((c, i) => [c, i]));
const NC = NEON_CHANNELS.length;
// Per-channel stagger inside each switching window: [step between channels, fade length] (P units).
const NEON_STAGGER = Object.freeze({ ignite: [0.017, 0.09], douse: [0.016, 0.08], reignite: [0.02, 0.1] });

/** Smooth, monotonic switch-on curve (no flicker): 0 at u ≤ 0 → exactly 1 at u ≥ 1. */
export const ignite = (u) => smooth(u);

/** Lifecycle neon power of a channel ∈ [0, 1]: dark until the Kurulum climax → on → doused → reuse on. */
export function neonPower(channel, P) {
  const o = NEON_ORDER[channel] ?? 0;
  const r = NC - 1 - o;
  const w = (win, i, [step, len]) => segment(P, win[0] + i * step, win[0] + i * step + len);
  if (P < T.ignite[0]) return 0;
  if (P < T.douse[0]) return ignite(w(T.ignite, o, NEON_STAGGER.ignite));
  if (P < T.reignite[0]) return 1 - ignite(w(T.douse, r, NEON_STAGGER.douse));
  return ignite(w(T.reignite, o, NEON_STAGGER.reignite));
}

/** 0 = original pink-led balance, 1 = reuse balance (cyan-led). */
export function neonBalance(P) {
  return smooth(segment(P, 6.9, 7.4));
}

// ── props & atmosphere ────────────────────────────────────────────────────────────────────
// City markers appear only while the truck is not parked on them (İstanbul once it has pulled away,
// Antalya until it pulls in) — otherwise the labels would print through the truck. [in0, in1, out0, out1]
const CITY_SHOW = Object.freeze([[3.34, 3.44, 3.86, 4.08], [3.08, 3.2, 3.86, 4.08], [3.08, 3.2, 3.6, 3.7]]);
/** Props at P; `intro` = introLevel(clock) (1 in snap mode). */
export function propsState(P, intro = 1) {
  const fadeInOut = (a0, a1, b0, b1) => smooth(segment(P, a0, a1)) * (1 - smooth(segment(P, b0, b1)));
  const bpOut = 1 - smooth(segment(P, ...T.blueprintOff));
  const paper = Math.max(clamp01(intro), smooth(segment(P, -0.9, -0.35)));
  return {
    grid: paper * lerp(0.45, 1, smooth(segment(P, -0.45, 0.35))) * (1 - smooth(segment(P, 1.25, 1.95))),
    axes: easeInOut(segment(P, ...T.axes)),
    axesAlpha: bpOut,
    dims: easeInOut(segment(P, ...T.dims)),
    dimsAlpha: bpOut,
    labels: smooth(segment(P, ...T.labels)) * bpOut,
    rack: fadeInOut(2.42, 2.6, 3.78, 3.98),
    map: fadeInOut(2.98, 3.14, 3.86, 4.08),
    cities: CITY_SHOW.map(([a0, a1, b0, b1]) => fadeInOut(a0, a1, b0, b1)),
    trail: routeProgress(P),
    hall: fadeInOut(3.72, 3.96, 6.95, 7.25),
    ring: 0.74 * easeInOut(segment(P, ...T.ring)) + 0.26 * easeInOut(segment(P, ...T.ringClose)),
    ringAlpha: smooth(segment(P, T.ring[0] - 0.05, T.ring[0] + 0.05)),
  };
}

// ── camera keyframes (plain numbers) ──────────────────────────────────────────────────────
// [P, targetX, targetY, targetZ, azimuth°, elevation°, subjectRadius m, fov°]
export const CAMERA_KEYS = Object.freeze([
  [-1.0, 0.0, 1.9, 0.0, 24, 10, 3.95, 28],
  [-0.45, 0.0, 1.85, 0.0, 28, 15, 4.2, 28],
  [0.2, 0.0, 1.5, 0.0, 42, 32, 5.3, 26],
  [0.95, 0.0, 1.35, 0.0, 50, 40, 5.5, 24],
  [1.4, 0.0, 1.6, 0.0, 44, 29, 5.2, 26],
  [1.8, 0.0, 1.8, 0.0, 32, 16, 4.8, 28],
  [2.05, -0.9, 1.6, 0.0, 16, 16, 5.3, 29],
  [2.32, -2.8, 1.3, -0.4, -22, 18, 5.5, 30],
  [2.62, -5.5, 1.2, -2.3, -14, 14, 4.5, 30],
  [2.88, -6.3, 1.0, -2.3, -6, 27, 5.9, 30],
  [3.15, -4.2, 0.8, -1.6, 4, 38, 6.4, 30],
  [3.46, 1.6, 0.2, 0.3, 20, 58, 10.5, 30],
  [3.72, 6.6, 0.5, 2.4, 28, 44, 8.2, 30],
  [3.9, 5.0, 0.8, 1.6, 34, 32, 6.6, 30],
  [4.12, 1.9, 1.4, 0.4, 40, 22, 6.4, 30],
  [4.42, 0.0, 1.85, 0.0, 35, 10, 4.4, 30],
  [4.97, 0.0, 1.85, 0.0, 28, 11, 4.5, 30], // the finished stand holds, turning slowly, while the card is read
  [5.45, 1.5, 1.6, 0.0, 52, 20, 5.4, 30],
  [6.05, 1.2, 0.7, 0.0, 26, 44, 6.4, 28],
  [6.55, 0.8, 0.0, 0.1, 6, 62, 8.3, 28],
  [7.0, 0.6, 0.6, 0.1, 18, 42, 6.0, 29],
  [7.6, 0.0, 1.55, 0.0, 26, 18, 5.9, 30],
  [7.97, 0.0, 1.6, 0.0, 30, 13, 5.6, 30],
  [8.5, 0.0, 1.3, 0.0, 50, 26, 7.3, 30],
  [9.0, 0.0, 1.2, 0.0, 72, 32, 8.0, 30],
]);

/** Uniform Catmull-Rom through the keys (C1 → no velocity pops at key boundaries). */
export function cameraAt(P) {
  const keys = CAMERA_KEYS;
  const p = Math.min(keys[keys.length - 1][0], Math.max(keys[0][0], P));
  let i = 0;
  while (i < keys.length - 2 && p > keys[i + 1][0]) i++;
  const k0 = keys[Math.max(0, i - 1)];
  const k1 = keys[i];
  const k2 = keys[i + 1];
  const k3 = keys[Math.min(keys.length - 1, i + 2)];
  const t = (p - k1[0]) / (k2[0] - k1[0]);
  const cr = (a, b, c, d) => {
    const t2 = t * t;
    const t3 = t2 * t;
    return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  };
  const v = (j) => cr(k0[j], k1[j], k2[j], k3[j]);
  return { target: [v(1), v(2), v(3)], az: v(4), el: v(5), radius: v(6), fov: v(7) };
}

export { PARTS, CRATE_COUNT, CRATE };
