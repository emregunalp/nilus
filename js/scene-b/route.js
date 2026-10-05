// PURE path math for the transport stage: Catmull-Rom through XZ control points, arc-length
// parametrised, with an unwrapped heading so the truck never spins through ±π.

export const SAMPLES_PER_SEG = 48;

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])];
}

function densify(points) {
  const out = [];
  const n = points.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p3 = points[Math.min(n - 1, i + 2)];
    for (let s = 0; s < SAMPLES_PER_SEG; s++) out.push(catmull(p0, points[i], points[i + 1], p3, s / SAMPLES_PER_SEG));
  }
  out.push(points[n - 1]);
  return out;
}

const wrapNear = (angle, ref) => angle + Math.round((ref - angle) / (2 * Math.PI)) * 2 * Math.PI;

/** Truck-forward is local +X → yaw about Y that maps (1,0,0) onto direction (dx, dz). */
const yawOf = (dx, dz) => Math.atan2(-dz, dx);

/**
 * Build an arc-length parametrised path. `startYaw` lets consecutive paths share one unwrapped heading.
 * Returns { pts, cum, length, yaws, at(u) → {x, z, yaw} }.
 */
export function buildPath(points, startYaw = null) {
  const pts = densify(points);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  const yaws = [];
  let prev = startYaw;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const raw = yawOf(b[0] - a[0], b[1] - a[1]);
    const y = prev === null ? raw : wrapNear(raw, prev);
    yaws.push(y);
    prev = y;
  }
  const length = cum[cum.length - 1];
  function at(u) {
    const target = Math.min(1, Math.max(0, u)) * length;
    let lo = 0;
    let hi = cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= target) lo = mid; else hi = mid;
    }
    const span = cum[hi] - cum[lo] || 1;
    const f = (target - cum[lo]) / span;
    return {
      x: pts[lo][0] + (pts[hi][0] - pts[lo][0]) * f,
      z: pts[lo][1] + (pts[hi][1] - pts[lo][1]) * f,
      yaw: yaws[lo] + (yaws[hi] - yaws[lo]) * f,
    };
  }
  /** Arc-length fraction at control point k (dense index k × SAMPLES_PER_SEG). */
  const knotU = (k) => cum[Math.min(cum.length - 1, k * SAMPLES_PER_SEG)] / length;
  return { pts, cum, length, yaws, at, knotU, endYaw: yaws[yaws.length - 1] };
}
