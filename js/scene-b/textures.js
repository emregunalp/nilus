// Canvas-drawn textures: oak grain (+bump), brushed metal, weave, header lettering, totem screens, counter bands,
// labels, the drawing's title block, soft masks.
// Fonts: page fonts when present (index.html loads them); the dev bench does not, so we fetch them
// from Google Fonts ourselves — never blocking mount for more than FONT_TIMEOUT_MS.

import * as THREE from 'three';
import { drawLogo, WORDMARK_ASPECT } from './logo.js';
import { t } from '../i18n.js';

export const FONT_DISPLAY = '"Fraunces", "Iowan Old Style", Georgia, serif';
export const FONT_MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace';
export const FONT_SANS = '"Inter Tight", "Helvetica Neue", Arial, sans-serif';

const FONT_TIMEOUT_MS = 1600;
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..700;1,9..144,300..600'
  + '&family=Inter+Tight:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap';

const INK = '#1B1916';
const PINK = '#FF2FB9';
const CYAN = '#38D6FF';
const VIOLET = '#8A6BFF';

export async function ensureFonts() {
  if (typeof document === 'undefined' || !document.fonts) return;
  if (new URLSearchParams(location.search).get('fonts') === '0') return;
  try {
    const hasLink = [...document.querySelectorAll('link[rel="stylesheet"]')].some((l) => l.href.includes('fonts.googleapis'));
    if (!hasLink) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = FONT_CSS;
      document.head.append(link);
    }
    const loads = ['600 64px "Fraunces"', 'italic 400 64px "Fraunces"', '500 32px "JetBrains Mono"', '600 32px "Inter Tight"']
      .map((f) => document.fonts.load(f).catch(() => null));
    await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, FONT_TIMEOUT_MS))]);
  } catch {
    /* typography falls back to system faces — cosmetic only */
  }
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(c, { srgb = true, repeat = false, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

/** Deterministic PRNG so textures are identical every load (screenshot stability). */
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/**
 * Oak: colour map + matching bump map drawn from the same deterministic grain (vertical, along V).
 * Growth-ring bands, fine pores, a few medullary flecks; the bump carries the pores/grooves so the
 * slats catch the key light like real rift-sawn oak. Cached — every oak surface shares one pair.
 */
let oakCache = null;
export function oakTextures() {
  if (oakCache) return oakCache;
  const W = 256;
  const H = 1024;
  const [c, g] = canvas(W, H);
  const [cb, gb] = canvas(W, H);
  const r = rng(7);
  const base = g.createLinearGradient(0, 0, W, 0);
  base.addColorStop(0, '#B58657');
  base.addColorStop(0.35, '#C09063');
  base.addColorStop(0.7, '#B3845A');
  base.addColorStop(1, '#BE8F60');
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  gb.fillStyle = '#9a9a9a';
  gb.fillRect(0, 0, W, H);
  const wavy = (gg, x, amp, phase, width) => {
    gg.lineWidth = width;
    gg.beginPath();
    gg.moveTo(x, 0);
    for (let y = 0; y <= H; y += 16) gg.lineTo(x + Math.sin(y * 0.006 + phase) * amp + Math.sin(y * 0.023 + phase * 2) * amp * 0.3, y);
    gg.stroke();
  };
  // Growth-ring bands: soft wide darker/lighter stripes.
  for (let i = 0; i < 16; i++) {
    const x = r() * W;
    const amp = 2 + r() * 5;
    const ph = r() * 6.28;
    const w = 5 + r() * 12;
    g.strokeStyle = r() > 0.5 ? `rgba(120,78,42,${0.1 + r() * 0.12})` : `rgba(222,180,128,${0.08 + r() * 0.1})`;
    wavy(g, x, amp, ph, w);
    gb.strokeStyle = `rgba(80,80,80,${0.12 + r() * 0.1})`;
    wavy(gb, x, amp, ph, w * 0.6);
  }
  // Fine grain + pores.
  for (let i = 0; i < 150; i++) {
    const x = r() * W;
    const amp = 1 + r() * 3;
    const ph = r() * 6.28;
    const w = 0.5 + r() * 1.6;
    const dark = r() > 0.35;
    g.strokeStyle = dark ? `rgba(88,54,26,${0.1 + r() * 0.22})` : `rgba(236,202,152,${0.06 + r() * 0.12})`;
    wavy(g, x, amp, ph, w);
    if (dark) { gb.strokeStyle = `rgba(30,30,30,${0.25 + r() * 0.35})`; wavy(gb, x, amp, ph, w); }
  }
  // Medullary flecks (short light dashes typical of oak).
  for (let i = 0; i < 90; i++) {
    const x = r() * W;
    const y = r() * H;
    const len = 6 + r() * 22;
    g.fillStyle = `rgba(232,196,146,${0.12 + r() * 0.15})`;
    g.fillRect(x, y, 1.2 + r() * 1.5, len);
    gb.fillStyle = 'rgba(200,200,200,0.35)';
    gb.fillRect(x, y, 1.2, len);
  }
  oakCache = { map: toTexture(c, { repeat: true }), bump: toTexture(cb, { repeat: true, srgb: false }) };
  return oakCache;
}

/** Brushed-metal streaks (roughness / bump): fine horizontal scratches along U. */
let brushedCache = null;
export function brushedTexture() {
  if (brushedCache) return brushedCache;
  const S = 256;
  const [c, g] = canvas(S, S);
  const r = rng(19);
  g.fillStyle = '#8c8c8c';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 900; i++) {
    const y = r() * S;
    const v = Math.round(90 + r() * 110);
    g.strokeStyle = `rgba(${v},${v},${v},${0.18 + r() * 0.3})`;
    g.lineWidth = 0.6 + r() * 0.9;
    g.beginPath();
    const x0 = r() * S;
    g.moveTo(x0 - 40, y);
    g.lineTo(x0 + 60 + r() * 140, y + (r() - 0.5) * 0.8);
    g.stroke();
  }
  brushedCache = toTexture(c, { repeat: true, srgb: false });
  return brushedCache;
}

/** Upholstery weave (bump): a fine basket weave, tiled. */
let weaveCache = null;
export function weaveTexture() {
  if (weaveCache) return weaveCache;
  const S = 128;
  const [c, g] = canvas(S, S);
  g.fillStyle = '#808080';
  g.fillRect(0, 0, S, S);
  const cell = 8;
  for (let y = 0; y < S; y += cell) {
    for (let x = 0; x < S; x += cell) {
      const horizontal = ((x + y) / cell) % 2 === 0;
      const grd = horizontal ? g.createLinearGradient(0, y, 0, y + cell) : g.createLinearGradient(x, 0, x + cell, 0);
      grd.addColorStop(0, '#5a5a5a');
      grd.addColorStop(0.5, '#c4c4c4');
      grd.addColorStop(1, '#5a5a5a');
      g.fillStyle = grd;
      g.fillRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
    }
  }
  weaveCache = toTexture(c, { repeat: true, srgb: false });
  return weaveCache;
}

/**
 * Drawing title block (ink on transparent): bordered cartouche with the sheet data.
 * Returns { texture, aspect }.
 */
export function titleBlockTexture() {
  const W = 1200;
  const H = 400;
  const [c, g] = canvas(W, H);
  g.clearRect(0, 0, W, H);
  g.strokeStyle = INK;
  g.fillStyle = INK;
  g.lineWidth = 6;
  g.strokeRect(8, 8, W - 16, H - 16);
  g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(8, 190);
  g.lineTo(W - 8, 190);
  g.moveTo(8, 296);
  g.lineTo(W - 8, 296);
  g.moveTo(820, 190);
  g.lineTo(820, H - 8);
  g.stroke();
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  drawLogo(g, 44 + (96 * WORDMARK_ASPECT) / 2, 100, 96, { color: INK });
  g.fillStyle = INK;
  g.font = `500 44px ${FONT_MONO}`;
  spaced(g, t('ADA STANDI 5×5', 'ISLAND STAND 5×5'), 44 + 330, 244, 5);
  g.font = `500 38px ${FONT_MONO}`;
  spaced(g, 'H 4.04 m', 820 + (W - 828) / 2, 244, 4);
  g.fillStyle = '#5E574D';
  spaced(g, t('KONGRE STANDI · 1:50', 'CONGRESS STAND · 1:50'), 44 + 330, 348, 4);
  spaced(g, t('ÇİZİM 01', 'DRAWING 01'), 820 + (W - 828) / 2, 348, 4);
  return { texture: toTexture(c), aspect: W / H };
}

/** The wordmark on a transparent ground, for signage on vehicles and props. Returns { texture, aspect }. */
export function logoTexture(color = INK) {
  const H = 160;
  const W = Math.ceil(H * WORDMARK_ASPECT) + 16;
  const [c, g] = canvas(W, H + 16);
  g.clearRect(0, 0, W, H + 16);
  drawLogo(g, W / 2, (H + 16) / 2, H, { color });
  return { texture: toTexture(c), aspect: W / (H + 16) };
}

/** Transparent lettering for the white header faces (ink on lacquer). */
export function headerTexture(kind) {
  const [c, g] = canvas(2048, 512);
  g.clearRect(0, 0, 2048, 512);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (kind === 'wordmark') {
    drawLogo(g, 1024, 256, 250, { color: INK });
  } else {
    g.fillStyle = INK;
    g.font = `500 108px ${FONT_MONO}`;
    spaced(g, kind, 1024, 262, 20);
  }
  return toTexture(c);
}

function spaced(g, text, cx, cy, tracking) {
  const chars = [...text];
  const widths = chars.map((ch) => g.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + tracking * (chars.length - 1);
  let x = cx - total / 2;
  g.textAlign = 'left';
  chars.forEach((ch, i) => { g.fillText(ch, x, cy); x += widths[i] + tracking; });
  g.textAlign = 'center';
}

/** Totem screen: abstract gradient + vertical wordmark. No people, no third-party marks. */
export function screenTexture(variant) {
  const [c, g] = canvas(512, 1536);
  const grd = g.createLinearGradient(0, 0, 0, 1536);
  if (variant === 0) {
    grd.addColorStop(0, '#16131F');
    grd.addColorStop(0.55, '#2A1840');
    grd.addColorStop(1, '#C0208E');
  } else {
    grd.addColorStop(0, '#0E1A22');
    grd.addColorStop(0.5, '#152E44');
    grd.addColorStop(1, '#1E9AC4');
  }
  g.fillStyle = grd;
  g.fillRect(0, 0, 512, 1536);
  const glow = g.createRadialGradient(256, 1300, 20, 256, 1300, 520);
  glow.addColorStop(0, variant === 0 ? 'rgba(255,120,210,0.55)' : 'rgba(120,230,255,0.5)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, 512, 1536);
  g.strokeStyle = 'rgba(255,255,255,0.10)';
  g.lineWidth = 2;
  for (let y = 120; y < 1536; y += 96) { g.beginPath(); g.moveTo(48, y); g.lineTo(464, y); g.stroke(); }
  g.save();
  g.translate(300, 800);
  g.rotate(-Math.PI / 2);
  drawLogo(g, 0, 0, 170, { color: 'rgba(247,244,238,0.94)' });
  g.restore();
  g.fillStyle = 'rgba(247,244,238,0.8)';
  g.font = `500 30px ${FONT_MONO}`;
  g.textAlign = 'left';
  g.fillText(variant === 0 ? t('25+ YIL', '25+ YEARS') : t('TEK EKİP', 'ONE TEAM'), 56, 90);
  g.fillText(variant === 0 ? t('KONGRE STANDLARI', 'CONGRESS STANDS') : t('TASARIM → KURULUM', 'DESIGN → INSTALLATION'), 56, 1470);
  return toTexture(c);
}

/** Top light box on the totems: warm white face with a small mark. */
export function lightboxTexture() {
  const [c, g] = canvas(512, 256);
  g.fillStyle = '#FFFFFF';
  g.fillRect(0, 0, 512, 256);
  drawLogo(g, 256, 128, 96, { color: INK, glyphs: ['n', 'dot'] });
  return toTexture(c);
}

/** Counter front: color map (frosted acrylic bands on lacquer) + emissive map (the glowing bands). */
export function counterBandTextures() {
  const W = 1024;
  const H = 512;
  const [cc, gc] = canvas(W, H);
  const [ce, ge] = canvas(W, H);
  gc.fillStyle = '#2B2724';
  gc.fillRect(0, 0, W, H);
  ge.fillStyle = '#000';
  ge.fillRect(0, 0, W, H);
  const bands = [0.2, 0.38, 0.56, 0.74];
  for (const b of bands) {
    const y = b * H;
    const h = H * 0.05;
    const ge2 = ge.createLinearGradient(0, 0, W, 0);
    ge2.addColorStop(0, PINK);
    ge2.addColorStop(0.55, VIOLET);
    ge2.addColorStop(1, CYAN);
    ge.fillStyle = ge2;
    ge.fillRect(0, y, W, h);
    const gc2 = gc.createLinearGradient(0, 0, W, 0);
    gc2.addColorStop(0, '#6B3A58');
    gc2.addColorStop(1, '#2F5C6B');
    gc.fillStyle = gc2;
    gc.fillRect(0, y, W, h);
  }
  return { color: toTexture(cc), emissive: toTexture(ce) };
}

/** Generic label: text on transparent or filled background. Returns { texture, aspect }. */
export function labelTexture(text, {
  font = `500 64px ${FONT_MONO}`, color = INK, bg = null, pad = 28, height = 128, tracking = 6, dot = null,
} = {}) {
  const [m, mg] = canvas(8, 8);
  mg.font = font;
  const chars = [...text];
  const widths = chars.map((ch) => mg.measureText(ch).width);
  const textW = widths.reduce((a, b) => a + b, 0) + tracking * (chars.length - 1);
  const dotW = dot ? height * 0.42 : 0;
  const w = Math.ceil(textW + pad * 2 + dotW);
  const [c, g] = canvas(w, height);
  if (bg) {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, height);
  }
  if (dot) {
    g.fillStyle = dot;
    g.beginPath();
    g.arc(pad + height * 0.12, height / 2, height * 0.1, 0, Math.PI * 2);
    g.fill();
  }
  g.font = font;
  g.fillStyle = color;
  g.textBaseline = 'middle';
  let x = pad + dotW;
  chars.forEach((ch, i) => { g.fillText(ch, x, height / 2 + 2); x += widths[i] + tracking; });
  return { texture: toTexture(c), aspect: w / height };
}

/** Radial soft disc (white, alpha falloff) — halos, sparks, dust, blob shadows. */
export function softDiscTexture(power = 2) {
  const [c, g] = canvas(128, 128);
  const img = g.createImageData(128, 128);
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const d = Math.min(1, Math.hypot(x - 63.5, y - 63.5) / 63.5);
      const a = (1 - d) ** power;
      const i = (y * 128 + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return toTexture(c, { srgb: false });
}

/** Floor light spill beside a strip: bright along one edge (v = 0), exponential falloff outward, soft ends. */
export function spillTexture() {
  const [c, g] = canvas(256, 128);
  const img = g.createImageData(256, 128);
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 256; x++) {
      const v = y / 127;
      const edge = Math.min(x, 255 - x) / 40;
      const ends = Math.min(1, edge) ** 1.5;
      const a = Math.exp(-v * 4.2) * (1 - v) * ends;
      const i = (y * 256 + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return toTexture(c, { srgb: false });
}

/**
 * Contact shadow (alpha mask) for a footprint occupying the inner ~40% of the quad: a dark, tight core right
 * under the object (ambient-occlusion contact) plus a long soft penumbra that dies into the floor.
 */
export function shadowTexture() {
  const S = 256;
  const [c, g] = canvas(S, S);
  const img = g.createImageData(S, S);
  const inner = 0.3;
  const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = Math.max(0, Math.abs(x - S / 2 + 0.5) / (S / 2) - inner);
      const dy = Math.max(0, Math.abs(y - S / 2 + 0.5) / (S / 2) - inner);
      const d = Math.min(1, Math.hypot(dx, dy) / (1 - inner));
      const core = 1 - smoothstep(0.02, 0.26, d);
      const tail = (1 - d) ** 2.6;
      const a = Math.min(1, 0.62 * core + 0.5 * tail);
      const i = (y * S + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return toTexture(c, { srgb: false });
}

/** Maintenance tick: thin ring + check, cyan. */
export function checkTexture() {
  const [c, g] = canvas(128, 128);
  g.strokeStyle = CYAN;
  g.lineWidth = 7;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.arc(64, 64, 52, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 9;
  g.beginPath();
  g.moveTo(40, 66);
  g.lineTo(57, 82);
  g.lineTo(89, 47);
  g.stroke();
  return toTexture(c);
}

/** Architectural axis bubble ("A", "1"…). */
export function bubbleTexture(letter) {
  const [c, g] = canvas(128, 128);
  g.strokeStyle = 'rgba(27,25,22,0.75)';
  g.lineWidth = 4;
  g.beginPath();
  g.arc(64, 64, 50, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = INK;
  g.font = `500 56px ${FONT_MONO}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(letter, 64, 68);
  return toTexture(c);
}
