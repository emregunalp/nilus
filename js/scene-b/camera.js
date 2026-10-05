// Camera rig: choreo keyframe (target, azimuth, elevation, subject radius, fov) → camera pose,
// with aspect-driven framing (CONTRACT §5): landscape → subject centred at 64% width via setViewOffset;
// portrait → subject centred at 30% height, fitted into the upper half.

import * as THREE from 'three';

const LANDSCAPE_MIN = 1.05;
const FRAME = Object.freeze({
  landscape: { cx: 0.64, cy: 0.5, fitX: 0.56, fitY: 0.86 },
  portrait: { cx: 0.5, cy: 0.3, fitX: 0.92, fitY: 0.56 },
});
// During the process the page has a text card on the left (to ≈43% width) and the stage rail on the right
// (from ≈87%), so the subject is fitted into that band instead of the roomier hero framing.
const PROCESS_LANDSCAPE = Object.freeze({ cx: 0.655, cy: 0.5, fitX: 0.44, fitY: 0.8 });

const mix = (a, b, t) => a + (b - a) * t;
function blendFrame(hero, process, heroW) {
  return {
    cx: mix(process.cx, hero.cx, heroW),
    cy: mix(process.cy, hero.cy, heroW),
    fitX: mix(process.fitX, hero.fitX, heroW),
    fitY: mix(process.fitY, hero.fitY, heroW),
  };
}

export function createCameraRig() {
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 220);
  const target = new THREE.Vector3();

  /** key: cameraAt(P); view: { w, h }; sway: { az, el } extra degrees (idle / cursor); heroW: 1 hero → 0 process. */
  function apply(key, view, sway = { az: 0, el: 0 }, heroW = 1) {
    const aspect = view.w / Math.max(1, view.h);
    const mode = aspect >= LANDSCAPE_MIN ? blendFrame(FRAME.landscape, PROCESS_LANDSCAPE, heroW) : FRAME.portrait;
    const vt = Math.tan(THREE.MathUtils.degToRad(key.fov) / 2);
    const ht = vt * aspect;
    const dist = Math.max(key.radius / (ht * mode.fitX), key.radius / (vt * mode.fitY));
    const az = THREE.MathUtils.degToRad(key.az + sway.az);
    const el = THREE.MathUtils.degToRad(key.el + sway.el);
    target.set(key.target[0], key.target[1], key.target[2]);
    camera.position.set(
      target.x + dist * Math.sin(az) * Math.cos(el),
      target.y + dist * Math.sin(el),
      target.z + dist * Math.cos(az) * Math.cos(el),
    );
    camera.fov = key.fov;
    camera.aspect = aspect;
    camera.lookAt(target);
    camera.setViewOffset(view.w, view.h, (0.5 - mode.cx) * view.w, (0.5 - mode.cy) * view.h, view.w, view.h);
    camera.updateProjectionMatrix();
    return dist;
  }

  return { camera, apply };
}
