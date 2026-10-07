// World: builds the scene graph (stand, drafting layer, logistics, fx, light) and maps P → every object.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  PARTS, CRATE_COUNT, partPose, partLook, cratePose, truckPose, propsState, scanState,
  neonPower, neonBalance, NEON_CHANNELS, introDraw, introLevel,
} from './choreo.js';
import { PLATFORM_H } from './layout.js';
import { PALETTE, createNeonRegistry } from './materials.js';
import { buildStand, applyPart } from './stand.js';
import { buildBlueprint } from './props-blueprint.js';
import { buildLogistics } from './props-logistics.js';
import { buildFx } from './fx.js';

const NO_SHADOW = new Set(['neonFloor', 'header', 'truss', 'logo']);
const SHADOW_BASE = 0.38;
// Soft studio rig: warm key from the upper front-left, cool fill from the right, a faint rim from behind,
// plus RoomEnvironment reflections (lacquer clear coat, brushed aluminium, oak sheen).
const LIGHTS = Object.freeze({
  env: 0.55,
  key: { color: 0xfff0dd, intensity: 1.6, pos: [-6, 10, 7] },
  fill: { color: 0xe4ebff, intensity: 0.45, pos: [8, 4.5, 5] },
  rim: { color: 0xffffff, intensity: 0.4, pos: [3, 6, -9] },
  hemi: { sky: 0xfbf6ee, ground: 0xcfc3b0, intensity: 0.3 },
});

const tmpEuler = new THREE.Euler();
const tmpMat = new THREE.Matrix4();

/** World-space half extents of a rotated box (for blob shadows and check-mark lift). */
function halfExtents(size, pose) {
  tmpEuler.set(pose.rot[0], pose.rot[1], pose.rot[2], 'YXZ');
  tmpMat.makeRotationFromEuler(tmpEuler);
  const e = tmpMat.elements;
  const s = [size[0] * pose.k / 2, size[1] * pose.k / 2, size[2] * pose.k / 2];
  const ax = (r0, r1, r2) => Math.abs(r0) * s[0] + Math.abs(r1) * s[1] + Math.abs(r2) * s[2];
  return [ax(e[0], e[4], e[8]), ax(e[1], e[5], e[9]), ax(e[2], e[6], e[10])];
}

function worldSize(spec, pose) {
  return spec.unit ? pose.dims : spec.size;
}

function directional({ color, intensity, pos }) {
  const light = new THREE.DirectionalLight(color, intensity);
  light.position.set(pos[0], pos[1], pos[2]);
  return light;
}

function setupLights(scene, renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environment = env;
  scene.environmentIntensity = LIGHTS.env;
  const hemi = new THREE.HemisphereLight(LIGHTS.hemi.sky, LIGHTS.hemi.ground, LIGHTS.hemi.intensity);
  scene.add(directional(LIGHTS.key), directional(LIGHTS.fill), directional(LIGHTS.rim), hemi);
  return env;
}

export function buildWorld({ renderer, quality, compact = false }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.cream);
  scene.fog = new THREE.Fog(PALETTE.cream, 30, 80);
  const env = setupLights(scene, renderer);
  const neon = createNeonRegistry();
  const stand = buildStand({ neon, quality });
  const blueprint = buildBlueprint();
  const logistics = buildLogistics();
  const fx = buildFx({ quality, compact, partCount: PARTS.length, shadowCount: PARTS.length + CRATE_COUNT + 1 });
  scene.add(stand.group, blueprint.group, logistics.group, fx.group);
  const platform = stand.parts.find((p) => p.spec.kind === 'platform');
  const logoIndex = stand.parts.findIndex((p) => p.spec.kind === 'logo');

  // The hanging wordmark is a two-sided sign: when the visitor turns the stand (js/orbit.js) and looks at it from
  // behind, it is turned round so the name never reads mirrored. The film's own camera always stays in front.
  function faceLogo(pose, viewAz) {
    if (!pose || !pose.visible || Math.abs(pose.rot[0]) > 0.01 || Math.abs(pose.rot[2]) > 0.01) return;
    if (Math.cos(THREE.MathUtils.degToRad(viewAz) - pose.rot[1]) < 0) stand.parts[logoIndex].root.rotation.y += Math.PI;
  }

  /** Neon is purely f(P): dark through the drawing and every stage until the Kurulum climax. */
  function updateNeon(P) {
    const balance = neonBalance(P);
    for (const ch of NEON_CHANNELS) neon.update(ch, neonPower(ch, P), balance);
  }

  function groundFor(x, z, platformPose) {
    if (!platformPose.visible || platformPose.k < 0.999) return 0.002;
    const [px, py, pz] = platformPose.pos;
    if (Math.abs(py - PLATFORM_H / 2) > 0.01) return 0.002;
    const inside = Math.abs(x - px) < platformPose.dims[0] / 2 && Math.abs(z - pz) < platformPose.dims[2] / 2;
    return inside ? PLATFORM_H + 0.003 : 0.002;
  }

  function shadowEntries(poses, looks, crates, truck) {
    const out = [];
    const platformPose = poses[stand.parts.indexOf(platform)];
    stand.parts.forEach((p, i) => {
      const pose = poses[i];
      if (NO_SHADOW.has(p.spec.kind) || !pose.visible) { out.push(null); return; }
      const ext = halfExtents(worldSize(p.spec, pose), pose);
      const isPlatform = p === platform;
      const ground = isPlatform ? 0.002 : groundFor(pose.pos[0], pose.pos[2], platformPose);
      const gap = Math.max(0, pose.pos[1] - ext[1] - ground);
      // Paper volumes already sit on the floor like a white model, so the shadow follows the volume wave.
      const present = looks[i].volume;
      const opacity = SHADOW_BASE * (isPlatform ? 1.45 : 1) * present * Math.min(1, pose.k * 3) / (1 + gap * 2.2) ** 2;
      out.push({ x: pose.pos[0], y: ground, z: pose.pos[2], w: ext[0] * 2.5 + 0.3, d: ext[2] * 2.5 + 0.3, opacity });
    });
    crates.forEach((c) => {
      out.push(c.visible ? { x: c.pos[0], y: 0.002, z: c.pos[2], w: 1.9 * c.k, d: 1.4 * c.k, ry: c.rot[1], opacity: SHADOW_BASE * c.k / (1 + Math.max(0, c.pos[1] - 0.4) * 1.5) ** 2 } : null);
    });
    out.push(truck.visible ? { x: truck.pos[0], y: 0.03, z: truck.pos[2], w: 6.2, d: 2.8, ry: truck.yaw, opacity: SHADOW_BASE * truck.alpha } : null);
    return out;
  }

  /**
   * Map progress (+ ambient clock) onto the whole scene. `introClock` = seconds since mount while the hero
   * drawing plots itself in (null in snap mode / reduced motion → the drawing is complete).
   */
  function update(P, { clock = 0, introClock = null, animate = true, viewAz = 0 } = {}) {
    const poses = PARTS.map((spec) => partPose(spec, P));
    const looks = PARTS.map((spec) => partLook(spec, P, introDraw(spec, introClock)));
    stand.parts.forEach((p, i) => applyPart(p, poses[i], looks[i]));
    faceLogo(poses[logoIndex], viewAz);
    stand.group.updateMatrixWorld(true);
    updateNeon(P);

    const crates = Array.from({ length: CRATE_COUNT }, (_, i) => cratePose(i, P));
    const truck = truckPose(P);
    const props = propsState(P, introLevel(introClock));
    logistics.update({ cratePoses: crates, truck, props });
    blueprint.update(props);

    if (animate) fx.dust.update(clock);
    fx.scanner.update(scanState(P));
    fx.checks.update(stand.parts.map((p, i) => ({
      check: looks[i].check, pos: poses[i].pos, lift: halfExtents(worldSize(p.spec, poses[i]), poses[i])[1] + 0.32,
    })));
    fx.shadows.update(shadowEntries(poses, looks, crates, truck));
    fx.ring.update(props.ring, props.ringAlpha);
  }

  function setFogForDistance(dist) {
    scene.fog.near = dist * 1.05;
    scene.fog.far = dist * 3.4;
  }

  function dispose() {
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        for (const v of Object.values(m)) if (v && v.isTexture) v.dispose();
        m.dispose();
      }
    });
    env.dispose();
  }

  return { scene, update, setFogForDistance, dispose, fx };
}
