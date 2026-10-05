// PURE prop choreography (crates, rack, truck, road, route, drawing layers, ring) — f(P), no three/DOM.

import {
  stageOf, seg, lerp, easeInOut, easeOut, easeIn, stagger, crateStaging, CRATE_DIMS, CRATE_COUNT,
} from './choreo.js';

// ── stations ────────────────────────────────────────────────────────────────
export const RACK_BAY_X = [-1.95, -0.65, 0.65, 1.95];
export const RACK_SHELF_Y = [0.14, 1.24];
export const TRUCK_Z = -3.4;
export const TRAILER_BED = 0.95;
export const TRAILER_BAY_X = [-2.55, -1.47, -0.39, 0.69];
export const TRUCK_ENTER_X = -12;
export const TRUCK_EXIT_X = 14;
export const ROAD_TRAVEL = 30;

/** Ease-in, linear body, ease-out end — so a drawn line keeps a steady pen speed mid-stroke. */
const RAMP = 0.15;
export const smoothRamp = (u) => {
  const k = 2 * RAMP * (1 - RAMP);
  if (u <= RAMP) return (u * u) / k;
  if (u >= 1 - RAMP) return 1 - ((1 - u) * (1 - u)) / k;
  return (u - RAMP / 2) / (1 - RAMP);
};

export const rackSlot =(k) => ({ x: RACK_BAY_X[k % 4], y: RACK_SHELF_Y[Math.floor(k / 4)] + CRATE_DIMS.h / 2, z: 0 });

// ── truck ───────────────────────────────────────────────────────────────────
export function truckState(P) {
  const { i, t } = stageOf(P);
  if (i === 3) {
    const drive = seg(t, 0.34, 0.4) * (1 - seg(t, 0.84, 0.9));
    return {
      x: lerp(TRUCK_ENTER_X, 0, easeOut(seg(t, 0, 0.16))),
      s: seg(t, 0, 0.02),
      travel: easeInOut(seg(t, 0.34, 0.88)) * ROAD_TRAVEL,
      bob: 0.018 * Math.sin(P * 140) * drive,
      visible: t > 0,
    };
  }
  if (i === 4) {
    const s = 1 - seg(t, 0.14, 0.2);
    return { x: lerp(0, TRUCK_EXIT_X, easeIn(seg(t, 0, 0.2))), s, travel: ROAD_TRAVEL, bob: 0, visible: s > 0 };
  }
  return { x: TRUCK_ENTER_X, s: 0, travel: 0, bob: 0, visible: false };
}

export const trailerSlot = (k, truck) => ({
  x: truck.x + TRAILER_BAY_X[k % 4],
  y: TRAILER_BED + CRATE_DIMS.h / 2 + Math.floor(k / 4) * 0.84 + truck.bob,
  z: TRUCK_Z,
});

// ── crates ──────────────────────────────────────────────────────────────────
const HIDDEN_CRATE = { s: 0, lid: 0, visible: false };

function arcBetween(a, b, u, lift) {
  return { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u) + lift * Math.sin(Math.PI * u), z: lerp(a.z, b.z, u) };
}

const risen = (S, r) => ({ x: S.x, y: S.y - (1 - r) * 0.5, z: S.z });

function crateDepolama(k, t) {
  const S = crateStaging(k);
  const r = easeOut(seg(t, k * 0.008, 0.1 + k * 0.008));
  const lid = seg(t, 0.02, 0.08) - seg(t, 0.4, 0.47);
  const st = stagger(k, CRATE_COUNT, 0.47, 0.82, 0.14);
  const m = easeInOut(seg(t, st, st + 0.14));
  const pos = m > 0 ? arcBetween(S, rackSlot(k), m, 1.1) : risen(S, r);
  return { ...pos, s: r, lid, visible: r > 0.01 };
}

function crateNakliye(k, t, P) {
  const truck = truckState(P);
  const inS = stagger(k, CRATE_COUNT, 0.12, 0.34, 0.1);
  const outS = stagger(k, CRATE_COUNT, 0.82, 1.0, 0.12);
  const load = easeInOut(seg(t, inS, inS + 0.1));
  const unload = easeInOut(seg(t, outS, outS + 0.12));
  const slot = trailerSlot(k, truck);
  let pos;
  if (unload > 0) pos = arcBetween(slot, crateStaging(k), unload, 1.6);
  else if (load > 0) pos = arcBetween(rackSlot(k), slot, load, 1.2);
  else pos = rackSlot(k);
  return { ...pos, s: 1, lid: 0, visible: true };
}

function crateAtStaging(k, rise, lid) {
  const S = crateStaging(k);
  return { ...risen(S, rise), s: rise, lid, visible: rise > 0.01 };
}

/** Crate k at progress P: { x, y, z, s, lid (0 closed … 1 open), visible }. */
export function cratePose(k, P) {
  const { i, t } = stageOf(P);
  const o = k * 0.006;
  switch (i) {
    case 2: return crateDepolama(k, t);
    case 3: return crateNakliye(k, t, P);
    case 4: return crateAtStaging(k, 1 - easeIn(seg(t, 0.74 + o, 0.86 + o)), seg(t, 0.05, 0.11));
    case 5: return crateAtStaging(k, easeOut(seg(t, 0.04 + o, 0.16 + o)), seg(t, 0.06, 0.14) - seg(t, 0.7, 0.8));
    case 6: return crateAtStaging(k, 1 - easeIn(seg(t, 0.3 + o, 0.4 + o)), seg(t, 0, 0.08));
    default: return { ...crateStaging(k), ...HIDDEN_CRATE };
  }
}

// ── environment layers ──────────────────────────────────────────────────────
export function propState(P) {
  const { i, t } = stageOf(P);
  return {
    rack: i === 2 ? seg(t, 0.36, 0.46) : i === 3 ? 1 - seg(t, 0.3, 0.4) : 0,
    road: i === 3 ? seg(t, 0.28, 0.38) * (1 - seg(t, 0.86, 0.96)) : 0,
    routeOpacity: i === 3 ? seg(t, 0.2, 0.32) : i === 4 ? 1 - seg(t, 0, 0.1) : 0,
    routeDraw: i === 3 ? seg(t, 0.36, 0.84) : i === 4 ? 1 : 0,
    blueprint: seg(P, 0, 0.25) * (1 - seg(P, 1.45, 1.9)),
    hall: seg(P, 4.0, 4.12) * (1 - seg(P, 7.35, 7.6)),
    plot: seg(P, 4.02, 4.14) * (1 - seg(P, 4.7, 4.82)),
    constructGrow: easeInOut(seg(P, 0.14, 0.5)),
    constructOpacity: 1 - seg(P, 0.78, 0.9),
    dimsGrow: easeInOut(seg(P, 0.3, 0.52)),
    dimsLabels: seg(P, 0.4, 0.54) * (1 - seg(P, 0.78, 0.9)),
    dimsOpacity: 1 - seg(P, 0.78, 0.9),
    ring: i === 7 ? 0.85 * smoothRamp(seg(t, 0.4, 0.95)) : i === 8 ? 0.85 + 0.15 * easeInOut(seg(t, 0, 0.5)) : 0,
    dust: 1 - seg(P, -0.25, 0.1),
    sparks: i === 1 ? 1 - seg(t, 0.66, 0.72) : 0,
  };
}

export { CRATE_COUNT };
