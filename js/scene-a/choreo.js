// PURE choreography core — zero imports of three/DOM. Everything the stand shows is f(P).
// P ∈ [-1, 9]: [-1,0) hero · [0,8) stages Tasarım…Yeniden Kullanım · [8,9] outro (CONTRACT §4/§5.1).

import { PARTS, PART_COUNT, KNOLL_BOUNDS, CRATE_COUNT } from './layout.js';

export const MIN_S = 0.02;          // parts at/below this uniform scale are hidden (inside a crate)
export const CHANNELS = ['floor', 'headerPink', 'headerCyan', 'counter', 'totem', 'logo'];

// ── easing ──────────────────────────────────────────────────────────────────
export const clamp01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x);
export const lerp = (a, b, u) => a + (b - a) * u;
export const smooth = (x) => { const u = clamp01(x); return u * u * (3 - 2 * u); };
export const easeInOut = (x) => { const u = clamp01(x); return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; };
export const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
export const easeIn = (x) => Math.pow(clamp01(x), 3);
export const seg = (p, a, b) => clamp01((p - a) / (b - a));
export const hash = (n) => { const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); };

/** Start of item k's window when n items of duration d are spread evenly across [a, b]. */
export const stagger = (k, n, a, b, d) => a + (b - a - d) * (n > 1 ? k / (n - 1) : 0);

/** Stage envelope: P → { i: -1 hero | 0..7 stage | 8 outro, t: local 0..1 }. */
export function stageOf(P) {
  if (P < 0) return { i: -1, t: clamp01(P + 1) };
  if (P >= 8) return { i: 8, t: clamp01(P - 8) };
  const i = Math.floor(P);
  return { i, t: P - i };
}

// ── crate stations (shared by part flights and crate poses) ─────────────────
export const CRATE_DIMS = { w: 1.0, h: 0.8, d: 1.2 };
export const STAGING_Z = 4.3;
export const CRATE_PITCH = 1.25;
export const crateStaging = (k) => ({ x: (k - 3.5) * CRATE_PITCH, y: CRATE_DIMS.h / 2, z: STAGING_Z });

// ── scan (Bakım) ────────────────────────────────────────────────────────────
export const SCAN_FROM = KNOLL_BOUNDS.x0 - 0.8;
export const SCAN_TO = KNOLL_BOUNDS.x1 + 0.8;
export function scanX(P) {
  return lerp(SCAN_FROM, SCAN_TO, easeInOut(seg(P, 6.36, 6.74)));
}
export const scanActive = (P) => seg(P, 6.33, 6.37) * (1 - seg(P, 6.74, 6.8));

// ── poses ───────────────────────────────────────────────────────────────────
const BASE = { rx: 0, rz: 0, s: 1, fade: 0, draw: 0, ink: 0, glow: 0, wear: 0, check: 0, grounded: 1, link: 1, visible: true };

const fromTransform = (tr, dims) => ({ ...BASE, x: tr.x, y: tr.y, z: tr.z, ry: tr.ry, sx: dims.sx, sy: dims.sy, sz: dims.sz });
const dimsOf = (part, tr) => (part.rect ? { sx: tr.sx, sy: tr.sy, sz: tr.sz } : { sx: 1, sy: 1, sz: 1 });

export const poseA = (part) => fromTransform(part.A, dimsOf(part, part.A));
export const poseR = (part) => fromTransform(part.R, dimsOf(part, part.R));

export function poseExploded(part) {
  const a = poseA(part);
  const e = part.explode;
  return { ...a, x: a.x + e.dx, y: a.y + e.dy, z: a.z + e.dz, grounded: 0, link: 0 };
}

export function poseFlat(part) {
  const f = part.flat;
  return { ...poseA(part), x: f.x, y: f.y, z: f.z, rx: f.rx, ry: f.yaw, rz: f.rz, link: 0 };
}

/** A part folded into its flight case: hidden, tiny, parked at the crate's staging spot. */
export function poseCrate(part, orient) {
  const c = crateStaging(part.crate);
  return { ...orient, x: c.x, y: c.y + 0.05, z: c.z, s: MIN_S, grounded: 0, link: 0, visible: false };
}

function mix(a, b, u) {
  const out = { ...b };
  for (const key of ['x', 'y', 'z', 'rx', 'ry', 'rz', 'sx', 'sy', 'sz', 's', 'grounded', 'link']) out[key] = lerp(a[key], b[key], u);
  return out;
}

/** Arc flight a → b; u already eased. Lift scales with horizontal distance. */
function arc(a, b, u, liftBase = 0.6) {
  const out = mix(a, b, u);
  const dist = Math.hypot(b.x - a.x, b.z - a.z);
  out.y += (liftBase + dist * 0.12) * Math.sin(Math.PI * u);
  const air = Math.sin(Math.PI * clamp01(u));
  out.grounded = lerp(a.grounded, b.grounded, u) * (1 - air);
  out.link = u >= 1 ? b.link : u <= 0 ? a.link : 0;
  return out;
}

function flyToCrate(from, part, u) {
  if (u >= 1) return poseCrate(part, from);
  const to = poseCrate(part, from);
  const p = arc(from, { ...to, visible: true }, easeInOut(u), 0.9);
  p.s = lerp(1, MIN_S, easeIn(u));
  p.visible = p.s > MIN_S;
  return p;
}

function flyFromCrate(part, to, u) {
  if (u <= 0) return poseCrate(part, to);
  const from = { ...poseCrate(part, to), visible: true };
  const p = arc(from, to, easeInOut(u), 0.9);
  p.s = lerp(MIN_S, 1, easeOut(u));
  p.visible = p.s > MIN_S;
  return p;
}

const N = PART_COUNT;

function tasarim(part, t) {
  const k = part.build;
  const d0 = stagger(k, N, 0.06, 0.52, 0.14);
  const u = easeInOut(seg(t, 0.78, 1.0));
  const p = u > 0 ? arc(poseA(part), poseExploded(part), u, 0) : poseA(part);
  return { ...p, fade: easeInOut(seg(t, 0, 0.22)), draw: seg(t, d0, d0 + 0.14), ink: 1 };
}

export const MATERIALISE = { a: 0.02, b: 0.6, d: 0.12 };

function uretim(part, t) {
  const ms = stagger(part.build, N, MATERIALISE.a, MATERIALISE.b, MATERIALISE.d);
  const fs = stagger(part.build, N, 0.56, 0.82, 0.14);
  const fu = easeInOut(seg(t, fs, fs + 0.14));
  const p = arc(poseExploded(part), poseA(part), fu, 0.25);
  p.link = fu >= 1 ? 1 : 0;
  p.grounded = fu;
  return { ...p, fade: 1 - easeInOut(seg(t, ms, ms + MATERIALISE.d)), draw: 1, ink: 1 - seg(t, ms + 0.04, ms + MATERIALISE.d + 0.02) };
}

function bakim(part, P, t) {
  const ks = stagger(part.build, N, 0.04, 0.44, 0.16);
  const u = seg(t, ks, ks + 0.16);
  const p = flyFromCrate(part, poseFlat(part), u);
  const dx = scanX(P) - part.flat.x;
  const passed = smooth(seg(dx, -0.2, 0.6));
  return { ...p, glow: Math.exp(-((dx / 0.5) ** 2)) * scanActive(P), wear: u * (1 - passed), check: passed * (u >= 1 ? 1 : 0) };
}

function reuse(part, P, t) {
  const ks = stagger(part.build, N, 0.02, 0.5, 0.18);
  const u = seg(t, ks, ks + 0.18);
  const p = u > 0 ? arc(poseFlat(part), poseR(part), easeInOut(u), 1.0) : poseFlat(part);
  return { ...p, check: 1 - seg(P, 7.02, 7.1) };
}

/** The per-part pose at progress P. Deterministic; no hidden state. */
export function partPose(part, P) {
  const { i, t } = stageOf(P);
  const kr = N - 1 - part.build;
  switch (i) {
    case -1: return poseA(part);
    case 0: return tasarim(part, t);
    case 1: return uretim(part, t);
    case 2: { const s = stagger(kr, N, 0.04, 0.4, 0.1); return flyToCrate(poseA(part), part, seg(t, s, s + 0.1)); }
    case 3: return poseCrate(part, poseA(part));
    case 4: { const s = stagger(part.build, N, 0.1, 0.78, 0.12); return flyFromCrate(part, poseA(part), seg(t, s, s + 0.12)); }
    case 5: { const s = stagger(kr, N, 0.12, 0.7, 0.105); return flyToCrate(poseA(part), part, seg(t, s, s + 0.105)); }
    case 6: return bakim(part, P, t);
    case 7: return reuse(part, P, t);
    default: return poseR(part);
  }
}

export const allPoses = (P) => PARTS.map((part) => partPose(part, P));

// ── neon ────────────────────────────────────────────────────────────────────
/** Ignition curve with deterministic flicker: 0 at u=0, 1 at u=1. */
export function igniteCurve(u, seed) {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  if (u < 0.72) {
    const r = hash(Math.floor(u * 16) * 7.13 + seed * 3.7);
    return r < 0.2 + u * 0.95 ? 0.3 + 0.5 * u : 0.03;
  }
  return 0.7 + 0.3 * smooth((u - 0.72) / 0.28);
}

function sequence(t, a, step, dur, reverse) {
  return CHANNELS.map((_, c) => {
    const k = reverse ? CHANNELS.length - 1 - c : c;
    const u = seg(t, a + k * step, a + k * step + dur);
    return reverse ? 1 - igniteCurve(u, c + 11) : igniteCurve(u, c + 3);
  });
}

/** Lit level per neon channel (CHANNELS order). Hero on, stages off, Kurulum climax, Söküm flicker-off, reuse on. */
export function neonLevels(P) {
  const { i, t } = stageOf(P);
  if (i === -1) return CHANNELS.map((_, c) => 1 - smooth(seg(P, -0.4 + c * 0.03, -0.12 + c * 0.015)));
  if (i === 4) return sequence(t, 0.8, 0.024, 0.05, false);
  if (i === 5) return sequence(t, 0.0, 0.016, 0.05, true);
  if (i === 7) return sequence(t, 0.5, 0.022, 0.05, false);
  if (i === 8) return CHANNELS.map(() => 1);
  return CHANNELS.map(() => 0);
}

/** Workshop light test (Üretim t≈0.85, CONTRACT §5.1): a separate, dimmer flicker channel — not the stand's lit state. */
export function neonTest(P) {
  const u = seg(P, 1.8, 1.96);
  if (u <= 0 || u >= 1) return 0;
  const on = hash(Math.floor(u * 22) * 5.3) < 0.55;
  return on ? 0.55 * Math.sin(Math.PI * u) : 0.04;
}

/** Colour balance: 0 = pink-led island (A), 1 = cyan-led linear stand (R). Changes only while the neon is dark. */
export const neonBalance = (P) => smooth(seg(P, 6.85, 7.15));

/** Hero first-load ignition (time-based, skipped in snap mode): channel c lit fraction at `sec` after mount. */
export function bootIgnite(sec, c) {
  const u = seg(sec, 0.6 + c * 0.24, 0.6 + c * 0.24 + 0.45);
  return igniteCurve(u, c + 21);
}

/** Uniform idle-sway weight: full in hero, gone by P=0 (deterministic part of the idle). */
export const idleWeight = (P) => 1 - smooth(seg(P, -0.45, -0.05));

/** Slow outro turn of the whole stand (radians). */
export const outroTurn = (P) => easeInOut(seg(P, 8, 9)) * 0.55;

export { PARTS, PART_COUNT, CRATE_COUNT };
