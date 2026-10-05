// Director: applies the pure choreography (poses, neon, props) to scene objects for one frame.

import * as THREE from 'three';
import { allPoses, neonLevels, neonTest, neonBalance, bootIgnite, idleWeight, outroTurn, CHANNELS } from './choreo.js';
import { propState } from './choreo-props.js';
import { HUES } from './stand-kit.js';

const FADE_MAX = 0.96;
const SCAN_TINT = new THREE.Color(0.02, 0.2, 0.3);
const SPILL_OPACITY = 0.55;
const HALO_OPACITY = 0.6;
const CHANNEL_INDEX = Object.fromEntries(CHANNELS.map((c, i) => [c, i]));

function applyTransform(group, p) {
  group.visible = p.visible;
  if (!p.visible) return;
  group.position.set(p.x, p.y, p.z);
  group.rotation.set(p.rx, p.ry, p.rz);
  group.scale.set(p.sx * p.s, p.sy * p.s, p.sz * p.s);
}

function applySurface(part, p) {
  const fade = p.fade * FADE_MAX;
  for (const mat of part.fx) {
    const fx = mat.userData.fx;
    fx.uFade.value = fade;
    fx.uWear.value = p.wear;
    fx.uGlow.value.copy(SCAN_TINT).multiplyScalar(p.glow);
  }
  const shadowK = p.grounded * (1 - p.fade);
  for (const s of part.shadows) { s.mat.opacity = s.base * shadowK; }
  if (part.cables) {
    part.cables.group.visible = p.link > 0.5;
    part.cables.mat.opacity = 1 - p.fade * 0.7;
  }
  const e = part.edges;
  if (e) {
    e.line.visible = p.visible && p.draw > 0.001 && p.ink > 0.01;
    e.line.geometry.instanceCount = Math.ceil(p.draw * e.count);
    e.mat.opacity = p.ink;
  }
}

function applyNeon(part, p, lit, balance) {
  for (const g of part.glows) {
    const level = lit[CHANNEL_INDEX[g.channel]];
    if (g.kind === 'emissive') {
      g.mat.emissiveIntensity = g.gain * level;
      continue;
    }
    g.mat.uniforms.uLevel.value = level;
    g.mat.uniforms.uOn.value.copy(g.hue(balance));
    g.mat.uniforms.uFade.value = p.fade;
  }
  for (const h of part.halos) {
    const level = lit[CHANNEL_INDEX[h.channel]];
    const c = h.hue(balance);
    h.mat.uniforms.uColor.value.setRGB(Math.min(c.x, 1), Math.min(c.y, 1), Math.min(c.z, 1));
    h.mat.uniforms.uOpacity.value = level * HALO_OPACITY * (1 - p.fade);
  }
  if (part.spill) {
    const level = lit[CHANNEL_INDEX.floor];
    const c = HUES.floor(balance);
    part.spill.visible = level > 0.01;
    part.spill.material.opacity = level * SPILL_OPACITY * p.grounded;
    part.spill.material.color.setRGB(Math.min(c.x, 1), Math.min(c.y, 1), Math.min(c.z, 1));
  }
}

/** Per-channel lit level: choreo × first-load ignition, never below the workshop light test. */
function litLevels(P, bootSec) {
  const levels = neonLevels(P);
  const test = neonTest(P);
  return levels.map((v, c) => Math.max(v * (P < 0 ? bootIgnite(bootSec, c) : 1), test));
}

export function createDirector(scene) {
  const { stand, drawing, crates, rack, truck, road, route, sparks, scanner, ring, plot, dust } = scene;

  /** env: { bootSec (Infinity in snap), idleYaw (radians), time } */
  return function apply(P, env) {
    const poses = allPoses(P);
    const lit = litLevels(P, env.bootSec);
    const balance = neonBalance(P);
    const ps = propState(P);
    stand.parts.forEach((part, i) => {
      const p = poses[i];
      applyTransform(part.group, p);
      applySurface(part, p);
      applyNeon(part, p, lit, balance);
    });
    stand.root.rotation.y = outroTurn(P) + env.idleYaw * idleWeight(P);
    drawing.update(ps);
    crates.update(P);
    rack.update(ps.rack);
    truck.update(P);
    road.update(P, ps.road);
    route.update(ps.routeOpacity, ps.routeDraw);
    sparks.update(P, ps.sparks);
    scanner.update(P, poses);
    ring.update(ps.ring);
    ring.group.rotation.y = stand.root.rotation.y;
    plot.update(ps.plot);
    dust.update(ps.dust, env.time);
  };
}
