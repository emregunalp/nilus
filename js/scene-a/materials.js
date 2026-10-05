// Materials: studio-maket surfaces, HDR neon (linear > 1 → bloom), paper-fade patch, drawing lines.
// Colours follow CONTRACT §2 tokens. Neon HDR bases are "display-corrected": the dominant channel carries the
// energy (> 1 for bloom) while the others stay < 1, so the clipped core still reads as the token hue on screen.

import * as THREE from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { oakTexture } from './textures.js';

export const COLORS = {
  cream: '#F3EDE3', cream2: '#EAE1D2', cream3: '#DDD2BF', ink: '#1B1916', ink2: '#5E574D',
  oak: '#B98A5E', lacquer: '#F7F4EE', paper: '#F8F4EC', carpet: '#D4CDC2',
};

export const NEON_HDR = {
  pink: new THREE.Vector3(1.8, 0.04, 0.5),
  cyan: new THREE.Vector3(0.04, 0.67, 1.8),
  violet: new THREE.Vector3(0.36, 0.2, 1.8),
  warm: new THREE.Vector3(1.6, 1.1, 0.95),
};
export const NEON_OFF = new THREE.Color('#E6E1DA');

const linear = (hex) => new THREE.Color(hex);
const PAPER = linear(COLORS.paper);
const FX_KEY = 'scene-a-fx-1';

/** Paper-fade / wear / scan-glow patch. Returns the material with per-instance uniforms in userData.fx. */
export function withFx(material) {
  const fx = {
    uFade: { value: 0 },
    uWear: { value: 0 },
    uGlow: { value: new THREE.Color(0, 0, 0) },
    uPaper: { value: PAPER.clone() },
  };
  material.userData.fx = fx;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, fx);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uFade;\nuniform float uWear;\nuniform vec3 uGlow;\nuniform vec3 uPaper;')
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
        float fxL = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
        gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(fxL) * vec3(0.9, 0.86, 0.8), uWear * 0.7);
        gl_FragColor.rgb += uGlow;
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uPaper * (0.94 + 0.06 * fxL), uFade);`);
  };
  material.customProgramCacheKey = () => FX_KEY;
  // Push solid faces back a hair so drawn ink edges win the depth test.
  material.polygonOffset = true;
  material.polygonOffsetFactor = 1;
  material.polygonOffsetUnits = 1;
  return material;
}

/** Clone a base material into a per-part instance carrying its own fx uniforms. */
export const cloneFx = (base) => withFx(base.clone());

let oakMap = null;

/** Base (shared, never mutated per part) surface materials. */
export function createBaseMaterials() {
  oakMap = oakMap || oakTexture();
  return {
    lacquer: new THREE.MeshPhysicalMaterial({ color: COLORS.lacquer, roughness: 0.32, clearcoat: 0.55, clearcoatRoughness: 0.22 }),
    carpet: new THREE.MeshStandardMaterial({ color: COLORS.carpet, roughness: 0.96 }),
    oak: new THREE.MeshStandardMaterial({ color: '#E8D2B8', map: oakMap, roughness: 0.62 }),
    oakCore: new THREE.MeshStandardMaterial({ color: '#3B2C20', roughness: 0.9 }),
    metal: new THREE.MeshStandardMaterial({ color: '#C8C4BD', metalness: 1, roughness: 0.34 }),
    fabric: new THREE.MeshPhysicalMaterial({ color: '#2B2E63', roughness: 0.92, sheen: 1, sheenColor: new THREE.Color('#8A90EE'), sheenRoughness: 0.55 }),
    dark: new THREE.MeshStandardMaterial({ color: '#2A2826', roughness: 0.55, metalness: 0.2 }),
    stone: new THREE.MeshStandardMaterial({ color: '#D9D2C6', roughness: 0.45 }),
    porcelain: new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.25 }),
  };
}

const GLOW_VERT = /* glsl */`
  #ifdef USE_VCOL
  attribute vec3 color;
  varying vec3 vCol;
  #endif
  void main() {
    #ifdef USE_VCOL
    vCol = color;
    #endif
    vec4 p = vec4(position, 1.0);
    #ifdef USE_INSTANCING
    p = instanceMatrix * p;
    #endif
    gl_Position = projectionMatrix * modelViewMatrix * p;
  }`;

const GLOW_FRAG = /* glsl */`
  uniform vec3 uOn;
  uniform vec3 uOff;
  uniform float uLevel;
  uniform float uFade;
  uniform vec3 uPaper;
  #ifdef USE_VCOL
  varying vec3 vCol;
  #endif
  void main() {
    vec3 on = uOn;
    #ifdef USE_VCOL
    on = vCol * uOn.x;
    #endif
    vec3 c = mix(uOff, on, uLevel);
    c = mix(c, uPaper, uFade);
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }`;

/** Neon tube / lightbox: off = milky diffuser, on = HDR colour. vertexColors → per-vertex hue, uOn.x = gain. */
export function glowMaterial({ on = NEON_HDR.pink, vertexColors = false } = {}) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uOn: { value: on.clone() },
      uOff: { value: NEON_OFF.clone() },
      uLevel: { value: 1 },
      uFade: { value: 0 },
      uPaper: { value: PAPER.clone() },
    },
    vertexShader: GLOW_VERT,
    fragmentShader: GLOW_FRAG,
    defines: vertexColors ? { USE_VCOL: '' } : {},
  });
  mat.userData.glow = true;
  return mat;
}

const HALO_FRAG = /* glsl */`
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec3 vLocal;
  void main() {
    float d = length(vLocal.yz) * 2.0;
    float a = pow(clamp(1.0 - d, 0.0, 1.0), 2.2);
    gl_FragColor = vec4(uColor, a * uOpacity);
    #include <colorspace_fragment>
  }`;

const HALO_VERT = /* glsl */`
  varying vec3 vLocal;
  void main() {
    vLocal = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

/** Low-quality neon halo (no bloom): tinted soft volume around a strip, normal-blended so it reads on cream. */
export function haloMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: 0 } },
    vertexShader: HALO_VERT,
    fragmentShader: HALO_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/** Transparent decal (shadow, light spill, label). */
export function decalMaterial(map, { color = '#FFFFFF', opacity = 1 } = {}) {
  return new THREE.MeshBasicMaterial({ map, color, transparent: true, opacity, depthWrite: false, toneMapped: false });
}

/** Screen-space drawing line (px width). */
export function lineMaterial({ color = COLORS.ink, width = 1.1, opacity = 1, dashed = false, vertexColors = false } = {}) {
  const mat = new LineMaterial({
    color: vertexColors ? 0xffffff : color, linewidth: width, transparent: true, opacity, dashed, vertexColors,
    dashSize: 0.18, gapSize: 0.12, depthWrite: false,
  });
  return mat;
}
