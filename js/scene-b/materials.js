// Materials: palette (CONTRACT §2 tokens), drawing→paper→material surfaces, neon channels, crisp lines.

import * as THREE from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

export const PALETTE = Object.freeze({
  cream: 0xf3ede3,
  cream2: 0xeae1d2,
  cream3: 0xddd2bf,
  ink: 0x1b1916,
  ink2: 0x5e574d,
  pink: 0xff2fb9,
  cyan: 0x38d6ff,
  violet: 0x8a6bff,
  oak: 0xb98a5e,
  lacquer: 0xf7f4ee,
  charcoal: 0x2c2926,
  graphite: 0x3a3632,
  fabric: 0x27307a,
  steel: 0xb9b4ac,
});

const SCAN_GLOW = new THREE.Color(PALETTE.cyan).multiplyScalar(0.55);
// Formation look (drawing → object). Colours are linear (THREE.Color converts from sRGB hex), so the flat
// fill equals the cleared background exactly and a not-yet-formed body is invisible except for hiding lines.
const PAPER_WHITE = new THREE.Color(0xfdfbf7);
const BACKGROUND = new THREE.Color(PALETTE.cream);
const PAPER_LIGHT = new THREE.Vector3(-0.45, 0.8, 0.4).normalize();
/** Height fraction over which each formation wave (volume, then material) blends as it rises. */
const FORM_BAND = 0.45;
/** How much earlier the bottom of a part takes its material than the top (fraction of the solid ramp). */
const SOLID_BIAS = 0.3;
/**
 * Bloom only catches pixels with a channel > 1 (post.js). Lit surfaces must never get there — otherwise lacquer
 * and brushed-metal highlights flare like neon. A soft shoulder above HIGHLIGHT_KNEE compresses reflected light
 * asymptotically towards 1.0; emissive neon is added back on top, so only the neon blooms.
 */
const HIGHLIGHT_KNEE = 0.8;
const KNEE_GLSL = `
  vec3 nilusKnee(vec3 c) {
    vec3 over = max(c - ${HIGHLIGHT_KNEE.toFixed(2)}, 0.0);
    return min(c, vec3(${HIGHLIGHT_KNEE.toFixed(2)})) + ${(1 - HIGHLIGHT_KNEE).toFixed(2)} * (1.0 - exp(-over / ${(1 - HIGHLIGHT_KNEE).toFixed(2)}));
  }`;

/** Soft highlight shoulder for plain (non-`surface`) lit materials — trucks, crates, racks. */
export function softHighlights(mat) {
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>${KNEE_GLSL}`)
      .replace('#include <opaque_fragment>', `outgoingLight = nilusKnee(outgoingLight - totalEmissiveRadiance) + totalEmissiveRadiance;
        #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'nilus-knee';
  return mat;
}

/**
 * Standard/physical material that can also be "drawing paper". Uniforms (per material):
 *  uVolume ∈ [0,1] — flat background-coloured fill (a hidden-line occluder) → softly shaded paper-white volume
 *  uSolid  ∈ [0,1] — paper-white → the real material (develops almost uniformly, bottom slightly first)
 * The volume rises bottom-up through the WORLD-space height range `formRange` (set per part to its assembled
 * extent, so every mesh of a part shares one wave) with a soft band — the part materialises in place like a model
 * being made: no glow, no discard, always opaque.
 *  uGlow ∈ [0,1] — maintenance-scan highlight (adds a cyan emissive wash).
 */
export function surface({ physical = false, formRange = [0, 1], ...params } = {}) {
  const Ctor = physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  // polygonOffset pushes bodies a hair back so the ink edge lines drawn on them always win the depth test.
  const mat = new Ctor({ envMapIntensity: 1, polygonOffset: true, polygonOffsetFactor: 1.5, polygonOffsetUnits: 4, ...params });
  const volume = { value: 1 };
  const solid = { value: 1 };
  const glow = { value: 0 };
  const range = { value: new THREE.Vector2(formRange[0], formRange[1]) };
  mat.userData.formRange = range.value;
  mat.userData.volume = volume;
  mat.userData.solid = solid;
  mat.userData.glow = glow;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uVolume: volume, uSolid: solid, uGlow: glow, uFormRange: range,
      uPaperWhite: { value: PAPER_WHITE }, uBackground: { value: BACKGROUND },
      uPaperLight: { value: PAPER_LIGHT }, uScanColor: { value: SCAN_GLOW },
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vFormY;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vFormY = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).y;
        #else
          vFormY = (modelMatrix * vec4(transformed, 1.0)).y;
        #endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uVolume; uniform float uSolid; uniform float uGlow; uniform vec2 uFormRange;
        uniform vec3 uPaperWhite; uniform vec3 uBackground; uniform vec3 uPaperLight; uniform vec3 uScanColor;
        varying float vFormY;${KNEE_GLSL}
        float formWave(float level, float y) {
          return smoothstep(0.0, 1.0, clamp((level * (1.0 + ${FORM_BAND.toFixed(2)}) - y) / ${FORM_BAND.toFixed(2)}, 0.0, 1.0));
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += uScanColor * uGlow;`)
      .replace('#include <opaque_fragment>', `
        outgoingLight = nilusKnee(outgoingLight - totalEmissiveRadiance) + totalEmissiveRadiance;
        float formY = clamp((vFormY - uFormRange.x) / max(1e-4, uFormRange.y - uFormRange.x), 0.0, 1.0);
        // Material "develops" almost uniformly (a slight bottom-first bias) — a hard rising edge would drag dark
        // finishes (screens, fabric) through the paper white as a smear; the volume wave carries the rise.
        float formSolid = smoothstep(0.0, 1.0, clamp(uSolid * (1.0 + ${SOLID_BIAS.toFixed(2)}) - formY * ${SOLID_BIAS.toFixed(2)}, 0.0, 1.0));
        if (formSolid < 0.999) {
          vec3 paperN = inverseTransformDirection(nonPerturbedNormal, viewMatrix);
          float paperLit = dot(paperN, uPaperLight) * 0.5 + 0.5;
          float paperSky = paperN.y * 0.5 + 0.5;
          vec3 paper = uPaperWhite * (0.7 + 0.2 * paperLit + 0.1 * paperSky);
          vec3 drawn = mix(uBackground, paper, formWave(uVolume, formY));
          outgoingLight = mix(drawn, outgoingLight, formSolid);
        }
        #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => `nilus-form-${physical ? 'p' : 's'}`;
  return mat;
}

/** Per-frame formation state of a surface material (see `surface`). */
export function setSurfaceState(mat, volume, solid, glow) {
  mat.userData.volume.value = volume;
  mat.userData.solid.value = solid;
  mat.userData.glow.value = glow;
}

/** Brushed aluminium (anisotropic highlight, streaked roughness). */
export function brushedMetal({ color = 0xc8c4bd, roughness = 0.34, map = null } = {}) {
  return surface({
    physical: true, color, metalness: 1, roughness, roughnessMap: map, anisotropy: 0.65, anisotropyRotation: 0,
  });
}

// ── neon ──────────────────────────────────────────────────────────────────────────────────
const NEON_OFF = {
  pink: new THREE.Color(0xeedde4), cyan: new THREE.Color(0xdbe9ee), violet: new THREE.Color(0xe2def0), white: new THREE.Color(0xf2efe9),
};
const NEON_HUE = {
  pink: new THREE.Color(PALETTE.pink), cyan: new THREE.Color(PALETTE.cyan), violet: new THREE.Color(PALETTE.violet), white: new THREE.Color(0xffffff),
};

/**
 * Registry of everything that lights up, grouped by channel. Entry kinds:
 *  'basic'   — MeshBasicMaterial strip: colour = off-tint → HDR hue × gain × power
 *  'surface' — fabrication-aware surface whose *emissive* carries the light (logo, counter bands, screens)
 *  'glow'    — soft additive-looking halo/spill (Points or planes): opacity = power × gain, colour = hue
 * `update(channel, power, balance)` recolours a whole channel per frame (balance 0 = pink-led, 1 = cyan-led).
 */
export function createNeonRegistry() {
  const byChannel = new Map();
  const tmp = new THREE.Color();

  function register(channel, mat, kind, hue, gain, reuseHue, reuseGain) {
    mat.userData.neon = { kind, hue, gain, reuseHue: reuseHue || hue, reuseGain: reuseGain ?? gain };
    if (!byChannel.has(channel)) byChannel.set(channel, []);
    byChannel.get(channel).push(mat);
    return mat;
  }

  function basic(channel, hue, { gain = 2.6, reuseHue = null, reuseGain = null } = {}) {
    const mat = new THREE.MeshBasicMaterial({ color: NEON_OFF[hue].clone(), toneMapped: false });
    return register(channel, mat, 'basic', hue, gain, reuseHue, reuseGain);
  }

  function lit(channel, hue, mat, { gain = 2.2, reuseHue = null, reuseGain = null } = {}) {
    return register(channel, mat, 'surface', hue, gain, reuseHue, reuseGain);
  }

  function glow(channel, hue, mat, { gain = 0.5, reuseHue = null, reuseGain = null } = {}) {
    return register(channel, mat, 'glow', hue, gain, reuseHue, reuseGain);
  }

  function update(channel, power, balance) {
    const list = byChannel.get(channel);
    if (!list) return;
    for (const mat of list) {
      const n = mat.userData.neon;
      const gain = THREE.MathUtils.lerp(n.gain, n.reuseGain, balance);
      tmp.copy(NEON_HUE[n.hue]).lerp(NEON_HUE[n.reuseHue], balance);
      if (n.kind === 'glow') {
        mat.color.copy(tmp);
        mat.opacity = Math.min(1, gain * power);
        mat.visible = mat.opacity > 0.002;
      } else if (n.kind === 'surface') {
        mat.emissive.copy(tmp).multiplyScalar(gain * power);
      } else {
        const off = NEON_OFF[balance > 0.5 ? n.reuseHue : n.hue];
        mat.color.copy(off).multiplyScalar(1 - Math.min(1, power * 1.6)).add(tmp.multiplyScalar(gain * power));
      }
    }
  }

  return { basic, lit, glow, update, channels: () => [...byChannel.keys()] };
}

// ── lines ─────────────────────────────────────────────────────────────────────────────────
const lineMats = new Set();

/** Screen-space thick line material; resolution is kept in sync by `setLineResolution`. */
export function lineMaterial({ color = PALETTE.ink, width = 1.4, opacity = 1, dashed = false, dashSize = 0.2, gapSize = 0.12, vertexColors = false } = {}) {
  const mat = new LineMaterial({
    color, linewidth: width, transparent: true, opacity, dashed, dashSize, gapSize, vertexColors,
    worldUnits: false, alphaToCoverage: false, depthWrite: false,
  });
  mat.userData.baseWidth = width;
  lineMats.add(mat);
  return mat;
}

export function setLineResolution(w, h, dpr) {
  for (const m of lineMats) {
    m.resolution.set(w * dpr, h * dpr);
    m.linewidth = m.userData.baseWidth * dpr;
  }
}

export function forgetLineMaterials() {
  lineMats.clear();
}
