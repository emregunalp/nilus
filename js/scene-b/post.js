// Render pipeline. High: MSAA HalfFloat target → bloom (threshold ≥ 1: only HDR neon blooms) → OutputPass
// (NoToneMapping → pure sRGB encode, so the cream background comes out exactly #F3EDE3).
// Low: plain renderer.render with native MSAA; glow is faked by halo sprites in the scene.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const BLOOM = Object.freeze({
  strength: 0.62, radius: 0, threshold: 1.1, smoothWidth: 0.4,
  // Per-mip weights (fine → coarse). Neon should glow tight on cream: the coarse mips are what wash
  // a dark platform pink, so they are nearly muted.
  mipFactors: [1.0, 0.62, 0.26, 0.07, 0.0],
});

/**
 * Luminance under-weights saturated pink (#FF2FB9 → luma 0.27), so a luma threshold either misses pink neon
 * or blooms white lacquer. Thresholding the brightest channel instead means: only pixels with a channel
 * above 1.0 (HDR emissive) bloom — lit surfaces and the cream background (all channels < 1) never do.
 */
function useMaxChannelThreshold(bloom) {
  const hp = bloom.materialHighPassFilter;
  hp.fragmentShader = hp.fragmentShader.replace('float v = luminance( texel.xyz );', 'float v = max( texel.r, max( texel.g, texel.b ) );');
  hp.needsUpdate = true;
  bloom.highPassUniforms.smoothWidth.value = BLOOM.smoothWidth;
  bloom.compositeMaterial.uniforms.bloomFactors.value = [...BLOOM.mipFactors];
}

export function createPipeline(renderer, scene, camera, quality) {
  if (quality === 'low') {
    return {
      render: () => renderer.render(scene, camera),
      setSize: () => {},
      dispose: () => {},
    };
  }
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), BLOOM.strength, BLOOM.radius, BLOOM.threshold);
  useMaxChannelThreshold(bloom);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  return {
    render: () => composer.render(),
    setSize(w, h, dpr) {
      composer.setPixelRatio(dpr);
      composer.setSize(w, h);
    },
    dispose() {
      bloom.dispose();
      composer.dispose();
      target.dispose();
    },
  };
}
