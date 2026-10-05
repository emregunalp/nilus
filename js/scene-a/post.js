// Post: MSAA HalfFloat render → selective bloom (max-channel threshold ≥ 1) → "neon-on-cream" composite → sRGB.
// Why custom: UnrealBloom's luminance threshold ignores saturated pink (low luminance), and additive bloom
// washes out on cream. Here the halo TINTS the paper (multiply by hue) and adds its energy — light, not haze.
// NoToneMapping everywhere, so the empty background leaves the pipeline as exactly #F3EDE3.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const BLOOM = { strength: 0.85, radius: 0.4, threshold: 1.0 };
const TINT = { gain: 2.1, maxAlpha: 0.8, add: 0.28 };

const COMPOSITE = {
  uniforms: {
    tDiffuse: { value: null },
    tBloom: { value: null },
    uGain: { value: TINT.gain },
    uMaxA: { value: TINT.maxAlpha },
    uAdd: { value: TINT.add },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform sampler2D tBloom;
    uniform float uGain;
    uniform float uMaxA;
    uniform float uAdd;
    varying vec2 vUv;
    void main() {
      vec3 base = texture2D(tDiffuse, vUv).rgb;
      vec3 b = texture2D(tBloom, vUv).rgb;
      if (any(isnan(b)) || any(isinf(b))) b = vec3(0.0);
      if (any(isnan(base)) || any(isinf(base))) base = vec3(0.0);
      float m = max(b.r, max(b.g, b.b));
      vec3 hue = b / max(m, 1e-4);
      float a = clamp(m * uGain, 0.0, uMaxA);
      gl_FragColor = vec4(base * mix(vec3(1.0), hue, a) + b * uAdd, 1.0);
    }`,
};

// Chromatic threshold (white never blooms, saturated neon does) + NaN/Inf guard: one bad pixel would otherwise
// be smeared across the low bloom mips into a black block on some GPUs (seen on Apple Metal, not SwiftShader).
const HIGH_PASS_BODY = `
  if ( any( isnan( texel.rgb ) ) || any( isinf( texel.rgb ) ) ) texel = vec4( 0.0 );
  texel.rgb = min( texel.rgb, vec3( 16.0 ) );
  float v = max( texel.r, max( texel.g, texel.b ) ) - 0.5 * min( texel.r, min( texel.g, texel.b ) );`;

function patchHighPass(bloom) {
  const mat = bloom.materialHighPassFilter;
  mat.fragmentShader = mat.fragmentShader.replace('float v = luminance( texel.xyz );', HIGH_PASS_BODY);
  mat.needsUpdate = true;
  // The bloom pass must not blend itself; the composite pass below does the tinting.
  bloom.blendMaterial.colorWrite = false;
}

/** High path: returns { render(), setSize(w, h, dpr), dispose() }. */
export function createPost(renderer, scene, camera, { width, height, dpr, clearColor }) {
  const target = new THREE.WebGLRenderTarget(width * dpr, height * dpr, {
    type: THREE.HalfFloatType,
    samples: renderer.capabilities.isWebGL2 ? 4 : 0,
  });
  const composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(dpr);
  composer.setSize(width, height);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), BLOOM.strength, BLOOM.radius, BLOOM.threshold);
  patchHighPass(bloom);
  composer.addPass(bloom);
  const composite = new ShaderPass(COMPOSITE);
  composite.uniforms.tBloom.value = bloom.renderTargetsHorizontal[0].texture;
  composer.addPass(composite);
  composer.addPass(new OutputPass());
  // three.js converts the clear colour for whatever target is bound when it is SET. RenderPass clears before the
  // scene's background refresh, so an sRGB value left over from the screen pass would be encoded twice (≈ +7/255).
  const clearLinear = () => {
    renderer.setRenderTarget(composer.readBuffer);
    renderer.setClearColor(clearColor, 1);
    renderer.setRenderTarget(null);
  };
  return {
    render: () => { clearLinear(); composer.render(); },
    setSize: (w, h, ratio) => { composer.setPixelRatio(ratio); composer.setSize(w, h); },
    dispose: () => { composer.dispose(); bloom.dispose(); target.dispose(); },
  };
}

/** Low path: plain render (halos stand in for bloom). */
export function createPlain(renderer, scene, camera) {
  return {
    render: () => renderer.render(scene, camera),
    setSize: () => {},
    dispose: () => {},
  };
}
