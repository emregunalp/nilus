// The Nilus logo as drawn by the client (nilus logo/nilus logo black.svg): outlines for extruded 3D lettering
// and a canvas painter for printed surfaces. Glyph outlines are the artwork's own path data, never a font.

import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';

const GLYPHS = Object.freeze({
  n: 'M23.48,86.74c0-2.23-.15-3.59-.61-4.59-.46-.99-1.24-1.63-2.5-2.4l-4.08-2.23-4.08-2.23v-6.41l20-6.7,20-6.7h7.96v17.47c5.44-5.63,10.97-9.85,16.62-12.67,5.65-2.82,11.43-4.22,17.35-4.22,10.97,0,18.64,2.96,23.57,9.42,4.93,6.46,7.11,16.41,7.11,30.38v28.73c0,3.21.14,5.88.44,7.96.29,2.09.73,3.59,1.31,4.46.58.97,1.65,1.75,3.18,2.36,1.53.61,3.52,1.04,5.95,1.33v9.51h-57.47v-9.51c2.23-.48,4.08-1.07,5.49-1.75,1.41-.68,2.38-1.46,2.86-2.33s.87-2.28,1.14-4.27c.27-1.99.41-4.56.41-7.77v-20.38c0-9.32-.97-16.16-3.52-20.68-2.55-4.51-6.67-6.7-12.98-6.7-1.84,0-3.69.24-5.58.75-1.89.51-3.83,1.29-5.87,2.35v44.66c0,3.3.14,5.97.41,8.03.27,2.06.65,3.52,1.14,4.39.49.88,1.5,1.65,3.03,2.28s3.57,1.12,6.09,1.41v9.51H11.64v-9.51c2.62-.39,4.76-.92,6.41-1.58,1.65-.66,2.82-1.43,3.5-2.31.68-.87,1.16-2.33,1.48-4.37.31-2.04.46-4.66.46-7.87v-37.86Z',
  i: 'M205.43,150.23h-63.49v-9.51c3.11-.29,5.63-.73,7.55-1.33,1.92-.61,3.23-1.38,3.91-2.36.68-.87,1.16-2.38,1.48-4.46.31-2.09.46-4.76.46-7.96v-37.86c0-2.82-.05-4.47-.65-5.63-.61-1.16-1.77-1.84-4-2.72l-3.69-1.46-3.69-1.46v-7.18l19.41-6.41,19.41-6.41h9.9v69.12c0,3.21.19,5.88.56,7.96.36,2.09.9,3.59,1.58,4.46.68.97,1.94,1.75,3.81,2.36,1.87.61,4.34,1.04,7.45,1.33v9.51ZM173.01,48.49c-5.05,0-9.66-2.09-13.01-5.44-3.35-3.35-5.43-7.96-5.43-13.01s2.09-9.76,5.43-13.08c3.35-3.32,7.96-5.36,13.01-5.36,2.43,0,4.71.44,6.84,1.34,2.14.9,4.13,2.26,5.97,4.1,6.02,5.24,6.65,13.3,3.86,19.95-2.79,6.65-9,11.89-16.67,11.5Z',
  l: 'M225.25,42.67c0-2.81-.34-5.1-1.02-6.82-.68-1.72-1.7-2.89-3.06-3.47l-4.85-2.04-4.85-2.04v-6.99l21.36-4.85,21.36-4.85h9.7c-.68,3.59-1.16,6.99-1.48,10.15-.31,3.16-.46,6.07-.46,8.69v94.16c0,3.21.19,5.88.56,7.96.36,2.09.9,3.59,1.58,4.46.68.97,1.94,1.75,3.81,2.36,1.87.61,4.34,1.04,7.45,1.33v9.51h-63.49v-9.51c3.11-.29,5.63-.73,7.55-1.33,1.92-.61,3.23-1.38,3.91-2.36.68-.87,1.16-2.38,1.48-4.46.31-2.09.46-4.76.46-7.96V42.67Z',
  u: 'M406.99,147.9l-21.26,2.52-21.26,2.52h-7.77v-17.09c-5.63,5.53-11.26,9.71-16.87,12.5-5.61,2.79-11.19,4.2-16.72,4.2-10.48,0-18.25-2.77-23.4-8.81-5.14-6.04-7.67-15.36-7.67-28.47v-36.31c0-2.43,0-3.79-.39-4.66-.39-.87-1.17-1.26-2.72-1.75l-3.01-1.17-3.01-1.17v-8.93l23.79-2.33,23.79-2.33c-.58,1.84-1.02,3.93-1.31,6.28-.29,2.35-.44,4.97-.44,7.89v37.08c0,7.38,1.6,13.3,4.64,17.38,3.03,4.08,7.5,6.31,13.23,6.31,1.55,0,3.15-.24,4.83-.75,1.67-.51,3.42-1.29,5.27-2.36v-45.82c0-2.62-.24-4.71-.83-6.34-.58-1.63-1.5-2.79-2.86-3.57-1.36-.78-2.48-1.26-3.86-1.63s-3.03-.61-5.46-.9v-8.93l25.73-2.33,25.73-2.33c-.49,1.75-.88,3.79-1.14,6.14s-.41,5.02-.41,8.03v53.78c0,3.01.15,5.49.46,7.43s.8,3.35,1.48,4.22c.58.87,1.75,1.55,3.5,2.01,1.75.46,4.08.7,6.99.7h.97v8.93Z',
  s: 'M482.74,143.83c-4.18,3.2-8.98,5.58-14.42,7.16-5.44,1.58-11.5,2.35-18.2,2.35s-12.28-.53-17.6-1.6c-5.32-1.07-10.07-2.67-14.25-4.81l-1.75-13.4-1.75-13.4h8.93c2.81,6.7,6.26,11.6,10.92,14.83s10.53,4.78,18.2,4.78c3.2,0,6.21-1.02,8.42-2.6,2.21-1.58,3.62-3.71,3.62-5.94,0-2.62-1.12-4.66-3.79-6.46-2.67-1.8-6.89-3.35-13.11-5-10.87-2.91-19.03-6.99-24.46-12.23-5.44-5.24-8.15-11.65-8.15-19.22,0-5.44,1.07-10.19,3.2-14.27,2.14-4.08,5.34-7.48,9.61-10.2,4.27-2.72,9.03-4.76,14.27-6.11,5.24-1.36,10.97-2.04,17.18-2.04,4.37,0,9.08.48,14.15,1.48,5.07,1,10.51,2.5,16.33,4.54l.68,11.84.68,11.84h-9.12c-2.62-5.34-6.12-9.37-10.46-12.06-4.34-2.69-9.54-4.05-15.56-4.05-3.79,0-6.6.58-8.47,1.77-1.87,1.19-2.79,2.99-2.79,5.41s.83,3.98,3.42,5.48c2.6,1.5,6.96,2.96,14.05,5.19,10.77,3.4,18.93,7.28,24.39,12.28,5.46,5,8.23,11.11,8.23,18.98,0,5.34-1.02,10.1-3.08,14.32-2.06,4.22-5.17,7.91-9.34,11.12Z',
  dot: 'M549.36,132.76c0,5.44-2.18,10.39-5.73,13.98-3.54,3.59-8.45,5.82-13.88,5.82-5.14,0-9.95-2.28-13.47-5.9-3.52-3.62-5.75-8.57-5.75-13.91s2.14-10.49,5.61-14.05c3.47-3.57,8.28-5.75,13.61-5.75s10.44,2.18,13.95,5.75c3.52,3.57,5.65,8.52,5.65,14.05Z',
});
const ALL = Object.freeze(['n', 'i', 'l', 'u', 's', 'dot']);
// Bounding boxes in the artwork's own units (x, y, width, height; y grows downwards).
const WORDMARK_BOX = Object.freeze({ x: 11.64, y: 11.6, w: 537.72, h: 141.74 });
const N_BOX = Object.freeze({ x: 11.64, y: 55.48, w: 126.3, h: 94.75 });
// The short "n." mark: the full stop slides left to sit right after the n.
const SHORT_DOT_SHIFT = -360;
const SHORT_BOX = Object.freeze({ x: 11.64, y: 55.48, w: 177.72, h: 97.08 });
/** Width ÷ height of the single "n" — furniture built from it keeps this proportion. */
export const N_ASPECT = N_BOX.w / N_BOX.h;
export const WORDMARK_ASPECT = WORDMARK_BOX.w / WORDMARK_BOX.h;

let outlines = null;
function outlineOf(glyph) {
  if (!outlines) {
    outlines = {};
    const loader = new SVGLoader();
    for (const key of ALL) {
      const { paths } = loader.parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${GLYPHS[key]}"/></svg>`);
      // Flatten to polygons and flip to y-up, so extrusions face the right way without a negative scale.
      outlines[key] = paths.flatMap((p) => SVGLoader.createShapes(p)).map((shape) => {
        const flipped = new THREE.Shape(shape.getPoints(14).map((p) => new THREE.Vector2(p.x, -p.y)));
        flipped.holes = shape.holes.map((hole) => new THREE.Path(hole.getPoints(14).map((p) => new THREE.Vector2(p.x, -p.y))));
        return flipped;
      });
    }
  }
  return outlines[glyph];
}

/**
 * Extruded logo lettering, centred on its bounding box and scaled uniformly to fit inside width × height.
 * `glyphs`: any of n, i, l, u, s, dot (default: the whole wordmark). Depth runs along z, centred.
 */
export function logoGeometry({ width, height, depth, glyphs = ALL, bevel = 0 }) {
  const box = glyphs.length === 1 && glyphs[0] === 'n' ? N_BOX : WORDMARK_BOX;
  const k = Math.min(width / box.w, height / box.h);
  const geometry = new THREE.ExtrudeGeometry(glyphs.flatMap(outlineOf), bevel
    ? { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: (bevel * 0.75) / k, bevelSegments: 1 }
    : { depth, bevelEnabled: false });
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox;
  geometry.translate(-(bb.min.x + bb.max.x) / 2, -(bb.min.y + bb.max.y) / 2, -(bb.min.z + bb.max.z) / 2);
  geometry.scale(k, k, 1);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Paints the logo on a 2D canvas, `height` px tall, centred on (cx, cy). `glyphs` as in logoGeometry;
 * with only ['n', 'dot'] the full stop is drawn right after the n (the short "n." mark).
 */
export function drawLogo(g, cx, cy, height, { color = '#1d1d1b', glyphs = ALL } = {}) {
  const short = glyphs.length === 2 && glyphs.includes('n') && glyphs.includes('dot');
  const dotShift = short ? SHORT_DOT_SHIFT : 0;
  const box = short ? SHORT_BOX : WORDMARK_BOX;
  const k = height / box.h;
  g.save();
  g.translate(cx - (box.w * k) / 2, cy - (box.h * k) / 2);
  g.scale(k, k);
  g.translate(-box.x, -box.y);
  g.fillStyle = color;
  for (const key of glyphs) {
    g.save();
    if (key === 'dot') g.translate(dotShift, 0);
    g.fill(new Path2D(GLYPHS[key]));
    g.restore();
  }
  g.restore();
  return (box.w * k); // painted width in px
}
