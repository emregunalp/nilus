// PURE camera keyframes — plain numbers, monotone cubic (Fritsch–Carlson) per channel → C1, no overshoot.
// az: degrees from +z (front) toward +x · el: degrees above the floor · r: framing radius (m) the rig must fit
// t*: look-at target · fov: vertical degrees (telephoto "maket" lens ≈ 22–30).

export const CAMERA_KEYS = [
  { p: -1.0, az: 33, el: 19, r: 4.3, tx: 0, ty: 1.8, tz: 0, fov: 30 },
  { p: -0.4, az: 31, el: 21, r: 4.4, tx: 0, ty: 1.8, tz: 0, fov: 30 },
  { p: 0.15, az: 38, el: 36, r: 5.0, tx: 0, ty: 1.6, tz: 0.3, fov: 24 },
  { p: 0.6, az: 42, el: 42, r: 5.2, tx: 0, ty: 1.5, tz: 0.4, fov: 22 },
  { p: 0.95, az: 40, el: 32, r: 5.9, tx: 0, ty: 2.2, tz: 0.3, fov: 24 },
  { p: 1.5, az: 34, el: 24, r: 6.0, tx: 0, ty: 2.1, tz: 0.3, fov: 28 },
  { p: 1.9, az: 30, el: 17, r: 4.5, tx: 0, ty: 1.85, tz: 0, fov: 30 },
  { p: 2.3, az: 46, el: 24, r: 6.2, tx: 0, ty: 1.0, tz: 2.2, fov: 30 },
  { p: 2.85, az: 58, el: 26, r: 5.8, tx: 0, ty: 1.0, tz: 1.4, fov: 30 },
  { p: 3.2, az: 36, el: 26, r: 6.6, tx: 0, ty: 1.2, tz: -1.6, fov: 30 },
  { p: 3.55, az: 16, el: 42, r: 6.8, tx: 0, ty: 0.6, tz: -0.4, fov: 30 },
  { p: 3.95, az: 22, el: 32, r: 6.4, tx: 0, ty: 0.9, tz: 1.0, fov: 30 },
  { p: 4.45, az: 28, el: 26, r: 5.8, tx: 0, ty: 1.4, tz: 1.4, fov: 30 },
  { p: 4.95, az: 34, el: 14, r: 4.4, tx: 0, ty: 1.85, tz: 0, fov: 30 },
  { p: 5.5, az: 48, el: 22, r: 5.8, tx: 0, ty: 1.3, tz: 1.5, fov: 30 },
  { p: 5.95, az: 40, el: 30, r: 5.8, tx: 0, ty: 1.0, tz: 2.0, fov: 30 },
  { p: 6.5, az: 4, el: 68, r: 5.8, tx: 0, ty: 0, tz: -1.15, fov: 28 },
  { p: 6.95, az: 10, el: 58, r: 5.8, tx: 0, ty: 0, tz: -1.15, fov: 28 },
  { p: 7.5, az: 26, el: 24, r: 5.6, tx: 0, ty: 1.5, tz: 0, fov: 30 },
  { p: 7.95, az: 30, el: 20, r: 5.6, tx: 0, ty: 1.6, tz: 0, fov: 30 },
  { p: 9.0, az: 16, el: 34, r: 7.0, tx: 0, ty: 1.4, tz: 0, fov: 30 },
];

export const CAMERA_CHANNELS = ['az', 'el', 'r', 'tx', 'ty', 'tz', 'fov'];

/** Fritsch–Carlson tangents for one channel. */
function monotoneTangents(xs, ys) {
  const n = xs.length;
  const d = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  const m = [d[0]];
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
  m.push(d[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const h = a * a + b * b;
    if (h > 9) { const s = 3 / Math.sqrt(h); m[i] = s * a * d[i]; m[i + 1] = s * b * d[i]; }
  }
  return m;
}

const XS = CAMERA_KEYS.map((k) => k.p);
const TANGENTS = Object.fromEntries(CAMERA_CHANNELS.map((c) => [c, monotoneTangents(XS, CAMERA_KEYS.map((k) => k[c]))]));

function hermite(c, i, x) {
  const x0 = XS[i];
  const h = XS[i + 1] - x0;
  const s = (x - x0) / h;
  const s2 = s * s;
  const s3 = s2 * s;
  const y0 = CAMERA_KEYS[i][c];
  const y1 = CAMERA_KEYS[i + 1][c];
  const m = TANGENTS[c];
  return (2 * s3 - 3 * s2 + 1) * y0 + (s3 - 2 * s2 + s) * h * m[i] + (-2 * s3 + 3 * s2) * y1 + (s3 - s2) * h * m[i + 1];
}

/** Camera keyframe values at P (clamped to the key range). */
export function cameraAt(P) {
  const x = Math.min(XS[XS.length - 1], Math.max(XS[0], P));
  let i = 0;
  while (i < XS.length - 2 && x > XS[i + 1]) i++;
  const out = {};
  for (const c of CAMERA_CHANNELS) out[c] = hermite(c, i, x);
  return out;
}
