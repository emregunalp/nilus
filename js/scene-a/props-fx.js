// Effects: workshop sparks, maintenance scanner + check marks, closing neon loop ring, hall plot tape, dust.

import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { PARTS, PART_COUNT, KNOLL_BOUNDS } from './layout.js';
import { stagger, seg, hash, scanX, scanActive, poseExploded, MATERIALISE } from './choreo.js';
import { glowMaterial, lineMaterial, NEON_HDR } from './materials.js';
import { checkTexture, dotTexture } from './textures.js';

const SPARKS = 240;
const RING_R = 5.0;
const RING_SEGS = 180;
const DUST = 90;

const POINTS_VERT = /* glsl */`
  attribute float aAlpha;
  attribute float aSize;
  uniform float uScale;
  varying float vAlpha;
  void main() {
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;

const POINTS_FRAG = /* glsl */`
  uniform sampler2D uMap;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vAlpha;
  void main() {
    vec4 t = texture2D(uMap, gl_PointCoord);
    #ifdef TINTED
    gl_FragColor = vec4(uColor, t.a * vAlpha * uOpacity);
    #else
    gl_FragColor = vec4(t.rgb, t.a * vAlpha * uOpacity);
    #endif
    #include <colorspace_fragment>
  }`;

function pointsObject(count, { map, color = '#FFFFFF', tinted = true, blending = THREE.NormalBlending }) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(count), 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(count), 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: map }, uColor: { value: color.isColor ? color : new THREE.Color(color) }, uOpacity: { value: 1 }, uScale: { value: 1000 } },
    vertexShader: POINTS_VERT,
    fragmentShader: POINTS_FRAG,
    defines: tinted ? { TINTED: '' } : {},
    transparent: true,
    depthWrite: false,
    blending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  POINT_MATERIALS.push(mat);
  return { points, geo, mat };
}

const POINT_MATERIALS = [];

/** Pixels per world unit at distance 1 (viewport height / (2·tan(fov/2))) — keeps sprite sizes in metres. */
export function setPointScale(value) {
  for (const m of POINT_MATERIALS) m.uniforms.uScale.value = value;
}

// ── sparks (Üretim): each part throws a short deterministic burst while it materialises ──
export function createSparks(quality) {
  const count = quality === 'low' ? SPARKS / 2 : SPARKS;
  const hdr = new THREE.Color().setRGB(2.2, 1.0, 0.35);
  const { points, geo } = pointsObject(count, { map: dotTexture(), color: hdr });
  const pos = geo.attributes.position;
  const alpha = geo.attributes.aAlpha;
  const size = geo.attributes.aSize;
  const origins = PARTS.map((p) => ({ a: poseExploded(p) }));

  function update(P, level) {
    points.visible = level > 0.001;
    if (!points.visible) return;
    const t = P - 1;
    for (let j = 0; j < count; j++) {
      const k = j % PART_COUNT;
      const ms = stagger(k, PART_COUNT, MATERIALISE.a, MATERIALISE.b, MATERIALISE.d);
      const birth = ms + hash(j * 1.7) * MATERIALISE.d;
      const age = (t - birth) / 0.09;
      const o = origins[k];
      const live = age > 0 && age < 1;
      const h1 = hash(j * 3.1) - 0.5;
      const h2 = hash(j * 5.3);
      const h3 = hash(j * 7.9) - 0.5;
      const ax = o.a.x;
      const az = o.a.z;
      const ay = o.a.y;
      const a = Math.max(0, age);
      pos.setXYZ(j, ax + h1 * 1.8 * a, ay + (0.9 + h2 * 1.4) * a - 2.4 * a * a, az + h3 * 1.8 * a);
      alpha.setX(j, live ? (1 - age) * level : 0);
      size.setX(j, 0.08 + h2 * 0.1);
    }
    pos.needsUpdate = true;
    alpha.needsUpdate = true;
    size.needsUpdate = true;
  }
  return { group: points, update };
}

// ── scanner (Bakım): light plane + floor line sweeping x, check marks above passed parts ──
export function createScanner() {
  const group = new THREE.Group();
  group.name = 'scanner';
  const depth = KNOLL_BOUNDS.z1 - KNOLL_BOUNDS.z0 + 1.2;
  const zc = (KNOLL_BOUNDS.z0 + KNOLL_BOUNDS.z1) / 2;
  const sheetMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color('#38D6FF') }, uOpacity: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv;
      void main(){ float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
        gl_FragColor = vec4(uColor, pow(1.0 - vUv.y, 1.6) * 0.42 * edge * uOpacity);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(depth, 1.4), sheetMat);
  sheet.rotation.y = Math.PI / 2;
  sheet.position.set(0, 0.7, zc);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, depth), glowMaterial({ on: NEON_HDR.cyan }));
  beam.position.set(0, 0.012, zc);
  group.add(sheet, beam);
  const checks = pointsObject(PART_COUNT, { map: checkTexture(), tinted: false });
  const cPos = checks.geo.attributes.position;
  PARTS.forEach((p, i) => cPos.setXYZ(i, p.flat.x, p.flat.h + 0.32, p.flat.z));
  cPos.needsUpdate = true;
  group.add(checks.points);

  function update(P, poses) {
    const on = scanActive(P);
    const x = scanX(P);
    sheet.visible = on > 0.001;
    beam.visible = on > 0.001;
    sheet.position.x = x;
    beam.position.x = x;
    sheetMat.uniforms.uOpacity.value = on;
    let anyCheck = false;
    poses.forEach((pose, i) => {
      const a = pose.visible ? pose.check : 0;
      anyCheck = anyCheck || a > 0.001;
      checks.geo.attributes.aAlpha.setX(i, a);
      checks.geo.attributes.aSize.setX(i, 0.3 * (0.6 + 0.4 * Math.min(1, a * 1.5)));
    });
    checks.geo.attributes.aAlpha.needsUpdate = true;
    checks.geo.attributes.aSize.needsUpdate = true;
    checks.points.visible = anyCheck;
    group.visible = sheet.visible || anyCheck;
  }
  return { group, update };
}

// ── loop ring (Yeniden Kullanım + outro): the lifecycle closes around the reused stand ──
export function createRing() {
  const group = new THREE.Group();
  group.name = 'ring';
  const positions = [];
  const colors = [];
  const stops = [NEON_HDR.cyan, NEON_HDR.violet, NEON_HDR.pink, NEON_HDR.cyan];
  for (let i = 0; i <= RING_SEGS; i++) {
    const u = i / RING_SEGS;
    const a = -Math.PI / 2 + u * Math.PI * 2;
    positions.push(Math.cos(a) * RING_R, 0.02, Math.sin(a) * RING_R);
    const f = u * (stops.length - 1);
    const k = Math.min(stops.length - 2, Math.floor(f));
    const c = new THREE.Vector3().lerpVectors(stops[k], stops[k + 1], f - k);
    colors.push(c.x, c.y, c.z);
  }
  const geo = new LineGeometry();
  geo.setPositions(positions);
  geo.setColors(colors);
  const mat = lineMaterial({ width: 2.6, vertexColors: true });
  const line = new Line2(geo, mat);
  line.frustumCulled = false;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 10), glowMaterial({ on: NEON_HDR.cyan }));
  const ticks = pointsObject(8, { map: dotTexture(), color: new THREE.Color().setRGB(0.9, 1.1, 1.8) });
  for (let k = 0; k < 8; k++) {
    const a = -Math.PI / 2 + (k / 8) * Math.PI * 2;
    ticks.geo.attributes.position.setXYZ(k, Math.cos(a) * RING_R, 0.03, Math.sin(a) * RING_R);
  }
  group.add(line, head, ticks.points);

  function update(progress) {
    group.visible = progress > 0.001;
    if (!group.visible) return;
    geo.instanceCount = Math.max(1, Math.floor(progress * RING_SEGS));
    const a = -Math.PI / 2 + progress * Math.PI * 2;
    head.position.set(Math.cos(a) * RING_R, 0.05, Math.sin(a) * RING_R);
    head.visible = progress < 0.999;
    for (let k = 0; k < 8; k++) {
      const on = seg(progress, k / 8, k / 8 + 0.04);
      ticks.geo.attributes.aAlpha.setX(k, on);
      ticks.geo.attributes.aSize.setX(k, 0.16);
    }
    ticks.geo.attributes.aAlpha.needsUpdate = true;
    ticks.geo.attributes.aSize.needsUpdate = true;
  }
  return { group, update, lineMaterials: [mat] };
}

// ── hall plot tape (Kurulum): dashed 5×5 m footprint on the congress floor ──
export function createPlot() {
  const h = 2.62;
  const y = 0.004;
  const c = [[-h, -h], [h, -h], [h, h], [-h, h]];
  const pos = [];
  for (let i = 0; i < 4; i++) { const a = c[i]; const b = c[(i + 1) % 4]; pos.push(a[0], y, a[1], b[0], y, b[1]); }
  const geo = new LineSegmentsGeometry();
  geo.setPositions(pos);
  const mat = lineMaterial({ color: '#19AEDD', width: 1.6, dashed: true });
  const line = new LineSegments2(geo, mat);
  line.computeLineDistances();
  line.frustumCulled = false;
  return {
    group: line,
    update(opacity) { line.visible = opacity > 0.001; mat.opacity = opacity; },
    lineMaterials: [mat],
  };
}

// ── dust: a few slow motes around the hero stand (static in snap mode) ──
export function createDust(quality) {
  const count = quality === 'low' ? DUST / 2 : DUST;
  const { points, geo, mat } = pointsObject(count, { map: dotTexture(), color: '#7A6F60' });
  const base = [];
  for (let i = 0; i < count; i++) {
    base.push([(hash(i * 1.3) - 0.5) * 9, 0.3 + hash(i * 2.7) * 4.6, (hash(i * 4.1) - 0.5) * 9]);
    geo.attributes.aAlpha.setX(i, 0.25 + hash(i * 6.1) * 0.35);
    geo.attributes.aSize.setX(i, 0.008 + hash(i * 8.3) * 0.012);
  }
  geo.attributes.aAlpha.needsUpdate = true;
  geo.attributes.aSize.needsUpdate = true;

  function update(opacity, time) {
    points.visible = opacity > 0.001;
    mat.uniforms.uOpacity.value = opacity;
    if (!points.visible) return;
    const p = geo.attributes.position;
    base.forEach(([x, y, z], i) => {
      const s = time * 0.06 + i;
      p.setXYZ(i, x + Math.sin(s * 0.7) * 0.25, y + Math.sin(s * 0.5 + i) * 0.18, z + Math.cos(s * 0.6) * 0.25);
    });
    p.needsUpdate = true;
  }
  return { group: points, update };
}
