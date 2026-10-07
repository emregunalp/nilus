// Shared building blocks for the project stand models: materials, primitives with a floor-level origin,
// canvas-drawn graphics and the furniture that repeats across stands. Units are metres; +Z is the stand front.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const loader = new THREE.TextureLoader();
const SANS = '"Inter Tight", "Helvetica Neue", Arial, sans-serif';

/* ---------- textures ---------- */
function finish(texture) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Image texture, resolved against the project's `tex/` folder by the caller. */
export function tex(url) {
  return finish(loader.load(url));
}

/** Image texture whose alpha is derived per pixel by `alphaOf(r, g, b)` (0–255) — used to cut printed shapes out. */
export function keyedTex(url, alphaOf) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 2;
  const texture = finish(new THREE.CanvasTexture(canvas));
  const img = new Image();
  img.onload = () => {
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const g = canvas.getContext('2d');
    g.drawImage(img, 0, 0);
    const data = g.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < data.data.length; i += 4) data.data[i + 3] = alphaOf(data.data[i], data.data[i + 1], data.data[i + 2]);
    g.putImageData(data, 0, 0);
    texture.needsUpdate = true;
  };
  img.src = url;
  return texture;
}

/** Canvas texture; `draw(g, w, h)` paints it. */
export function canvasTex(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  return finish(new THREE.CanvasTexture(canvas));
}

/** Single- or multi-line lettering on a transparent (or `bg`) canvas. Returns { texture, aspect }. */
export function textTex(lines, { color = '#fff', bg = null, font = `700 160px ${SANS}`, tracking = 0, pad = 40, lineGap = 1.15, glow = null } = {}) {
  const list = (Array.isArray(lines) ? lines : [lines]).map((l) => (typeof l === 'string' ? { text: l } : l));
  const probe = document.createElement('canvas').getContext('2d');
  const sizeOf = (f) => Number(/(\d+)px/.exec(f)[1]);
  const measured = list.map((l) => {
    const f = l.font || font;
    probe.font = f;
    const chars = [...l.text];
    const t = l.tracking ?? tracking;
    const width = chars.reduce((sum, ch) => sum + probe.measureText(ch).width, 0) + t * (chars.length - 1);
    return { ...l, f, chars, t, width, size: sizeOf(f) };
  });
  const w = Math.ceil(Math.max(...measured.map((m) => m.width)) + pad * 2);
  const h = Math.ceil(measured.reduce((sum, m) => sum + m.size * lineGap, 0) + pad * 2);
  const texture = canvasTex(w, h, (g) => {
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
    g.textBaseline = 'middle';
    let y = pad;
    for (const m of measured) {
      g.font = m.f;
      g.fillStyle = m.color || color;
      if (glow) { g.shadowColor = glow; g.shadowBlur = m.size * 0.22; }
      let x = (w - m.width) / 2;
      const cy = y + (m.size * lineGap) / 2;
      for (const ch of m.chars) { g.fillText(ch, x, cy); x += g.measureText(ch).width + m.t; }
      y += m.size * lineGap;
    }
  });
  return { texture, aspect: w / h };
}

/** Subtle plank pattern for platform floors. */
export function woodTex(base = '#D8C2A2', line = 'rgba(120, 90, 55, .22)') {
  const texture = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(${90 + Math.random() * 60}, ${65 + Math.random() * 40}, 40, ${0.02 + Math.random() * 0.05})`;
      g.fillRect(Math.random() * w, Math.random() * h, 40 + Math.random() * 160, 1 + Math.random() * 1.5);
    }
    g.fillStyle = line;
    for (let y = 0; y < h; y += 64) g.fillRect(0, y, w, 1.5);
    for (let row = 0; row < 8; row++) g.fillRect(((row * 197) % w), row * 64, 1.5, 64);
  });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/* ---------- materials ---------- */
export const std = (color, { roughness = 0.6, metalness = 0, ...rest } = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...rest });
/** Self-lit printed graphic (lightbox face, screen): colours stay true to the artwork. */
export const lit = (map, opts = {}) => new THREE.MeshBasicMaterial({ map, toneMapped: false, ...opts });
/** Self-lit flat colour (LED lines, illuminated letters). */
export const glow = (color, opts = {}) => new THREE.MeshBasicMaterial({ color, toneMapped: false, ...opts });
export const chrome = () => std(0xdfe3e6, { roughness: 0.18, metalness: 1 });
export const glass = (color = 0xffffff, opacity = 0.18) =>
  new THREE.MeshPhysicalMaterial({ color, roughness: 0.05, metalness: 0, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });

/* ---------- primitives (origin at the bottom centre) ---------- */
function mesh(geometry, material, shadow = true) {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = shadow;
  m.receiveShadow = shadow;
  return m;
}
export const box = (w, h, d, material) => mesh(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), material);
export const rbox = (w, h, d, r, material) => mesh(new RoundedBoxGeometry(w, h, d, 4, r).translate(0, h / 2, 0), material);
export const cyl = (rTop, rBottom, h, material, segments = 40) =>
  mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments).translate(0, h / 2, 0), material);
/** Flat graphic facing +Z, centred on its own origin. Never casts a shadow. */
export const plane = (w, h, material) => mesh(new THREE.PlaneGeometry(w, h), material, false);

/** Places an object and returns it: at(obj, x, y, z, rotationY). */
export function at(obj, x = 0, y = 0, z = 0, ry = 0) {
  obj.position.set(x, y, z);
  obj.rotation.y = ry;
  return obj;
}

/** Rounded rectangle outline with per-corner radii, bottom edge on y = 0, centred on x. */
export function roundedShape(w, h, { tl = 0, tr = 0, br = 0, bl = 0 } = {}) {
  const x0 = -w / 2;
  const x1 = w / 2;
  const s = new THREE.Shape();
  s.moveTo(x0 + bl, 0);
  s.lineTo(x1 - br, 0);
  if (br) s.absarc(x1 - br, br, br, -Math.PI / 2, 0, false);
  s.lineTo(x1, h - tr);
  if (tr) s.absarc(x1 - tr, h - tr, tr, 0, Math.PI / 2, false);
  s.lineTo(x0 + tl, h);
  if (tl) s.absarc(x0 + tl, h - tl, tl, Math.PI / 2, Math.PI, false);
  s.lineTo(x0, bl);
  if (bl) s.absarc(x0 + bl, bl, bl, Math.PI, Math.PI * 1.5, false);
  return s;
}

/** Extruded panel from a shape; depth is centred on z. */
export function slab(shape, depth, material) {
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 16 }).translate(0, 0, -depth / 2);
  return mesh(geometry, material);
}

/** Flat graphic cut to a shape, facing +Z; UVs span the w × h bounding box. */
export function card(shape, w, h, material) {
  const geometry = new THREE.ShapeGeometry(shape, 16);
  const pos = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + w / 2) / w, pos.getY(i) / h);
  return mesh(geometry, material, false);
}

/**
 * Upright band following an XZ polyline (curved headers, ring fascias). Texture u runs along the path.
 * points: [[x, z], …]
 */
export function band(points, y0, height, material) {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  const total = lengths[lengths.length - 1];
  const pos = [];
  const uv = [];
  const idx = [];
  points.forEach(([x, z], i) => {
    pos.push(x, y0, z, x, y0 + height, z);
    uv.push(lengths[i] / total, 0, lengths[i] / total, 1);
    if (i > 0) { const k = i * 2; idx.push(k - 2, k, k - 1, k - 1, k, k + 1); }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(idx);
  geometry.computeVertexNormals();
  const m = mesh(geometry, material, false);
  m.userData.length = total;
  return m;
}

/** Double-sided lightbox: white body with a printed face on both sides. Shape origin at the bottom centre. */
export function lightbox(w, h, depth, radii, faceMaterial, bodyMaterial, backMaterial = faceMaterial) {
  const g = new THREE.Group();
  g.add(slab(roundedShape(w, h, radii), depth, bodyMaterial));
  const inset = 0.012;
  const shrink = (r) => Math.max(0, r - inset);
  const radiiIn = { tl: shrink(radii.tl || 0), tr: shrink(radii.tr || 0), br: shrink(radii.br || 0), bl: shrink(radii.bl || 0) };
  const fw = w - inset * 2;
  const fh = h - inset * 2;
  const front = card(roundedShape(fw, fh, radiiIn), fw, fh, faceMaterial);
  front.position.set(0, inset, depth / 2 + 0.002);
  g.add(front);
  if (backMaterial) {
    const mirrored = { tl: radiiIn.tr, tr: radiiIn.tl, br: radiiIn.bl, bl: radiiIn.br };
    const back = card(roundedShape(fw, fh, mirrored), fw, fh, backMaterial);
    back.position.set(0, inset, -depth / 2 - 0.002);
    back.rotation.y = Math.PI;
    g.add(back);
  }
  return g;
}

/** Soft coloured light spilling on the floor around a w × d footprint (platform edge LEDs). */
export function underglow(w, d, color, spread = 0.9) {
  const px = 64;
  const texture = canvasTex(Math.round((w + spread * 2) * px), Math.round((d + spread * 2) * px), (g, cw, ch) => {
    g.clearRect(0, 0, cw, ch);
    g.shadowColor = color;
    g.shadowBlur = spread * px * 0.75;
    g.fillStyle = color;
    for (let i = 0; i < 3; i++) g.fillRect(spread * px, spread * px, w * px, d * px);
  });
  const m = plane(w + spread * 2, d + spread * 2, new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.9 }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.004;
  m.renderOrder = -1;
  return m;
}

/** Raised platform with an optional glowing edge. Top surface sits at y = height. */
export function platform(w, d, height, topMaterial, { edge = null, sideMaterial = std(0xf1f0ee, { roughness: 0.5 }) } = {}) {
  const g = new THREE.Group();
  const body = box(w, height, d, [sideMaterial, sideMaterial, topMaterial, sideMaterial, sideMaterial, sideMaterial]);
  g.add(body);
  if (edge) {
    const led = box(w + 0.02, height * 0.55, d + 0.02, glow(edge));
    led.castShadow = led.receiveShadow = false;
    g.add(led, underglow(w, d, edge));
  }
  return g;
}

/* ---------- furniture ---------- */
/** Tub chair: shell seat on four splayed metal legs. */
export function tubChair(color) {
  const g = new THREE.Group();
  const shell = std(color, { roughness: 0.75, side: THREE.DoubleSide });
  g.add(at(rbox(0.5, 0.11, 0.48, 0.05, shell), 0, 0.4, 0));
  const back = mesh(new THREE.CylinderGeometry(0.29, 0.25, 0.4, 28, 1, true, Math.PI * 0.37, Math.PI * 1.26).translate(0, 0.66, 0.02), shell);
  g.add(back);
  const metal = chrome();
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.46, 8).translate(0, 0.21, 0), metal);
    leg.position.set(sx * 0.14, 0, sz * 0.13);
    leg.rotation.set(sz * 0.32, 0, -sx * 0.32);
    g.add(leg);
  }
  return g;
}

/** Pedestal table: disc top on a central column. */
export function roundTable(radius, height, topMaterial, metal = chrome()) {
  const g = new THREE.Group();
  g.add(at(cyl(radius, radius, 0.03, topMaterial), 0, height - 0.03, 0));
  g.add(cyl(0.028, 0.028, height - 0.03, metal, 16));
  g.add(cyl(radius * 0.62, radius * 0.66, 0.018, metal));
  return g;
}

/** Small table on three splayed legs. */
export function tripodTable(radius, height, topMaterial, legMaterial) {
  const g = new THREE.Group();
  g.add(at(cyl(radius, radius, 0.03, topMaterial), 0, height - 0.03, 0));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = mesh(new THREE.CylinderGeometry(0.014, 0.01, height, 8).translate(0, height / 2, 0), legMaterial);
    leg.position.set(Math.cos(a) * radius * 0.28, 0, Math.sin(a) * radius * 0.28);
    leg.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3);
    g.add(leg);
  }
  return g;
}

/** Upholstered drum seat with softened edges. */
export function pouf(radius, height, color) {
  const r = Math.min(0.06, height / 3);
  const profile = [];
  profile.push(new THREE.Vector2(0, 0), new THREE.Vector2(radius - r, 0));
  for (let i = 0; i <= 6; i++) { const a = -Math.PI / 2 + (i / 6) * (Math.PI / 2); profile.push(new THREE.Vector2(radius - r + Math.cos(a) * r, r + Math.sin(a) * r)); }
  for (let i = 0; i <= 6; i++) { const a = (i / 6) * (Math.PI / 2); profile.push(new THREE.Vector2(radius - r + Math.cos(a) * r, height - r + Math.sin(a) * r)); }
  profile.push(new THREE.Vector2(0, height));
  return mesh(new THREE.LatheGeometry(profile, 40), std(color, { roughness: 0.92 }));
}

/** Bar stool: moulded seat with a low back on a chrome column, footrest ring and disc base. */
export function barStool(seatColor = 0xf6f6f4, seatHeight = 0.76) {
  const g = new THREE.Group();
  const metal = chrome();
  const seatMat = std(seatColor, { roughness: 0.35 });
  g.add(cyl(0.2, 0.21, 0.02, metal));
  g.add(cyl(0.025, 0.025, seatHeight, metal, 16));
  const ring = mesh(new THREE.TorusGeometry(0.15, 0.011, 8, 32).rotateX(Math.PI / 2), metal);
  ring.position.y = seatHeight * 0.42;
  g.add(ring);
  g.add(at(rbox(0.4, 0.06, 0.38, 0.028, seatMat), 0, seatHeight, 0));
  g.add(at(rbox(0.4, 0.2, 0.05, 0.024, seatMat), 0, seatHeight + 0.03, -0.17));
  return g;
}

/** Wireframe glass showcase (device placeholder vitrines). */
export function wireBox(w, h, d, lineColor = 0x6f7672) {
  const g = new THREE.Group();
  const geometry = new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
  g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: lineColor })));
  g.add(new THREE.Mesh(geometry, glass(0xffffff, 0.07)));
  return g;
}

/** Wall-mounted screen: thin dark body, optional lit image. */
export function screen(w, h, imageMaterial = null) {
  const g = new THREE.Group();
  g.add(at(box(w, h, 0.05, std(0x141414, { roughness: 0.25 })), 0, -h / 2, 0));
  const face = plane(w - 0.04, h - 0.04, imageMaterial || std(0x1b1b1d, { roughness: 0.12, metalness: 0.3 }));
  face.position.z = 0.027;
  g.add(face);
  return g;
}

/** Lettering as a flat graphic of a given height (width follows the text). */
export function label(lines, height, opts = {}) {
  const { texture, aspect } = textTex(lines, opts);
  const m = plane(height * aspect, height, new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false, depthWrite: false }));
  m.userData.width = height * aspect;
  return m;
}

export { THREE, SANS };
