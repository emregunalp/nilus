// Camera rig: choreo keyframes (az/el/radius/target/fov) → a calm telephoto camera that fits the framing radius
// to the canvas aspect, then shifts the frustum with setViewOffset (CONTRACT §5 framing rule, perspective intact).

import { cameraAt } from './choreo-camera.js';

const DEG = Math.PI / 180;
const ASPECT_SPLIT = 1.05;
const WIDE = { fracW: 0.52, fracH: 0.84, centerX: 0.64 };   // stand centred at 64 % of the width, clear of the text column
const TALL = { fracW: 0.9, fracH: 0.44, centerY: 0.3 };    // stand centred at 30 % of the height, upper half

export function createCameraRig(camera) {
  let W = 1;
  let H = 1;

  function resize(w, h) {
    W = Math.max(1, w);
    H = Math.max(1, h);
    camera.aspect = W / H;
  }

  /** Pose the camera for progress P; parallax {x, y} in degrees. Returns pixels-per-metre at distance 1. */
  function apply(P, parallax) {
    const k = cameraAt(P);
    const aspect = W / H;
    const wide = aspect >= ASPECT_SPLIT;
    const fr = wide ? WIDE : TALL;
    const tanV = Math.tan((k.fov * DEG) / 2);
    const dist = k.r / Math.min(fr.fracW * tanV * aspect, fr.fracH * tanV);
    const az = (k.az + parallax.x) * DEG;
    const el = (k.el + parallax.y) * DEG;
    camera.position.set(
      k.tx + dist * Math.cos(el) * Math.sin(az),
      k.ty + dist * Math.sin(el),
      k.tz + dist * Math.cos(el) * Math.cos(az),
    );
    camera.fov = k.fov;
    camera.near = Math.max(0.2, dist * 0.1);
    camera.far = dist * 6;
    camera.lookAt(k.tx, k.ty, k.tz);
    if (wide) camera.setViewOffset(W, H, -(fr.centerX - 0.5) * W, 0, W, H);
    else camera.setViewOffset(W, H, 0, (0.5 - fr.centerY) * H, W, H);
    camera.updateProjectionMatrix();
    return H / (2 * tanV);
  }

  return { resize, apply };
}
