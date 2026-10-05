// Canvas textures: oak grain, LED header faces, totem screens, crate labels, drawing labels, shadows, glyphs.
// Page fonts (Fraunces / Inter Tight / JetBrains Mono) are used when available; never block > ~2.2 s on them.

import * as THREE from 'three';

const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..700;1,9..144,300..700&family=Inter+Tight:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap';
const FONT_PROBES = ['600 64px Fraunces', 'italic 400 64px Fraunces', '500 32px "JetBrains Mono"', '400 32px "Inter Tight"'];
const FONT_TIMEOUT_MS = 2200;

export const INK = '#1B1916';
export const INK_2 = '#5E574D';
export const CREAM = '#F3EDE3';
export const CREAM_2 = '#EAE1D2';
export const PINK = '#FF2FB9';
export const CYAN = '#38D6FF';
export const VIOLET = '#8A6BFF';

const SERIF = 'Fraunces, "Iowan Old Style", Georgia, serif';
const MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace';
const SANS = '"Inter Tight", "Helvetica Neue", Arial, sans-serif';

/** Load the page fonts if the host page did not (dev/scene.html). Resolves within FONT_TIMEOUT_MS no matter what. */
export async function ensureFonts() {
  if (typeof document === 'undefined' || !document.fonts) return;
  try {
    if (FONT_PROBES.every((f) => document.fonts.check(f))) return;
    if (!document.querySelector('link[data-scene-a-fonts]') && !document.querySelector('link[href*="fonts.googleapis.com"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = FONT_CSS;
      link.dataset.sceneAFonts = '1';
      document.head.append(link);
      await new Promise((resolve) => { link.onload = resolve; link.onerror = resolve; setTimeout(resolve, FONT_TIMEOUT_MS / 2); });
    }
    const loads = Promise.all(FONT_PROBES.map((f) => document.fonts.load(f).catch(() => null)));
    await Promise.race([loads, new Promise((r) => setTimeout(r, FONT_TIMEOUT_MS / 2))]);
  } catch {
    /* fonts are cosmetic — canvas falls back to system faces */
  }
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d') };
}

function toTexture(c, { srgb = true, repeat = false } = {}) {
  const tex = new THREE.CanvasTexture(c);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (repeat) { tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping; }
  tex.needsUpdate = true;
  return tex;
}

function spaced(g, text, x, y, spacing) {
  let cx = x;
  for (const ch of text) { g.fillText(ch, cx, y); cx += g.measureText(ch).width + spacing; }
  return cx - spacing;
}

const spacedWidth = (g, text, spacing) => [...text].reduce((w, ch) => w + g.measureText(ch).width + spacing, -spacing);

/** Warm oak: one slat's worth of fine vertical grain with soft growth rings. */
export function oakTexture() {
  const { c, g } = canvas(128, 1024);
  const base = g.createLinearGradient(0, 0, 128, 0);
  base.addColorStop(0, '#B07F52');
  base.addColorStop(0.5, '#C29466');
  base.addColorStop(1, '#AE7C50');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 1024);
  for (let i = 0; i < 46; i++) {
    const x = (i * 37.3) % 128;
    const wob = 2 + (i % 5);
    g.strokeStyle = i % 3 === 0 ? 'rgba(92,56,28,0.28)' : 'rgba(120,78,40,0.16)';
    g.lineWidth = 0.6 + (i % 4) * 0.35;
    g.beginPath();
    for (let y = 0; y <= 1024; y += 16) g.lineTo(x + Math.sin(y / (70 + i * 3) + i) * wob, y);
    g.stroke();
  }
  g.fillStyle = 'rgba(255,236,205,0.08)';
  g.fillRect(40, 0, 24, 1024);
  return toTexture(c);
}

/** Header LED face: crisp wordmark on satin white. kind: 'word' | 'sub'. */
export function signTexture(kind, wM, hM) {
  const H = 200;
  const W = Math.round((H * wM) / hM);
  const { c, g } = canvas(W, H);
  g.fillStyle = '#FBF8F2';
  g.fillRect(0, 0, W, H);
  g.textBaseline = 'alphabetic';
  if (kind === 'word') {
    g.fillStyle = INK;
    g.font = `600 ${H * 0.56}px ${SERIF}`;
    const word = 'nilus';
    g.font = `600 ${H * 0.56}px ${SERIF}`;
    const w1 = g.measureText(word).width;
    g.font = `400 ${H * 0.2}px ${SANS}`;
    const w2 = spacedWidth(g, 'DESIGN', H * 0.06);
    const gap = H * 0.2;
    const x0 = (W - (w1 + gap + w2)) / 2;
    g.font = `600 ${H * 0.56}px ${SERIF}`;
    g.fillText(word, x0, H * 0.68);
    g.fillStyle = PINK;
    g.beginPath();
    g.arc(x0 + w1 + gap * 0.42, H * 0.64, H * 0.035, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = INK_2;
    g.font = `400 ${H * 0.2}px ${SANS}`;
    spaced(g, 'DESIGN', x0 + w1 + gap, H * 0.64, H * 0.06);
  } else {
    g.fillStyle = INK_2;
    g.font = `500 ${H * 0.2}px ${MONO}`;
    const text = 'KONGRE STANDLARI';
    const w = spacedWidth(g, text, H * 0.05);
    spaced(g, text, (W - w) / 2, H * 0.6, H * 0.05);
  }
  return toTexture(c);
}

/** Totem screen: abstract light field + restrained typography (no people). variant 0 = pink-led, 1 = cyan-led. */
export function screenTexture(variant) {
  const W = 300;
  const H = 1056;
  const { c, g } = canvas(W, H);
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#15131F');
  bg.addColorStop(1, '#221A30');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  const [a, b] = variant === 0 ? [PINK, VIOLET] : [CYAN, VIOLET];
  const orb = (x, y, r, col, alpha) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, col);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = alpha;
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
  };
  orb(W * 0.7, H * 0.42, W * 1.1, a, 0.85);
  orb(W * 0.2, H * 0.62, W * 0.9, b, 0.6);
  g.globalAlpha = 1;
  g.strokeStyle = 'rgba(255,255,255,0.18)';
  g.lineWidth = 1;
  for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(24, (H * i) / 6); g.lineTo(W - 24, (H * i) / 6); g.stroke(); }
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.font = `500 22px ${MONO}`;
  spaced(g, variant === 0 ? 'NILUS / 01' : 'NILUS / 02', 24, 52, 3);
  g.font = `italic 300 ${W * 0.62}px ${SERIF}`;
  g.fillText(variant === 0 ? 'n' : 'd', 22, H * 0.56);
  g.font = `500 20px ${MONO}`;
  spaced(g, 'KONGRE', 24, H - 110, 4);
  spaced(g, 'STANDLARI', 24, H - 80, 4);
  g.fillStyle = 'rgba(255,255,255,0.6)';
  g.font = `400 20px ${SANS}`;
  g.fillText(variant === 0 ? '25+ yıl deneyim' : 'tek ekip · tek nokta', 24, H - 38);
  return toTexture(c);
}

/** Counter N bands: emissive map (black ground) + base map (white ground, milky bands). */
export function counterBandTextures() {
  const W = 1024;
  const H = 448;
  const bands = [0.16, 0.3, 0.44, 0.58, 0.72, 0.86];
  const bandH = H * 0.045;
  const draw = (ground, fill) => {
    const { c, g } = canvas(W, H);
    g.fillStyle = ground;
    g.fillRect(0, 0, W, H);
    for (const y of bands) {
      g.fillStyle = fill(g);
      g.fillRect(0, H * (1 - y) - bandH / 2, W, bandH);
    }
    return toTexture(c);
  };
  const emissive = draw('#000000', (g) => {
    const gr = g.createLinearGradient(0, 0, W, 0);
    gr.addColorStop(0, '#FF2896');
    gr.addColorStop(0.5, '#9A5CFF');
    gr.addColorStop(1, '#2FC8FF');
    return gr;
  });
  const base = draw('#FFFFFF', () => '#E4DFD8');
  return { emissive, base };
}

/** "NLS-0x" crate label plates in one atlas (rows of 1:0.36). */
export function crateLabelAtlas(count) {
  const W = 512;
  const RH = 184;
  const { c, g } = canvas(W, RH * count);
  for (let i = 0; i < count; i++) {
    const y = i * RH;
    g.fillStyle = CREAM_2;
    g.fillRect(0, y, W, RH);
    g.fillStyle = INK;
    g.font = `500 78px ${MONO}`;
    spaced(g, `NLS-0${i + 1}`, 34, y + 104, 4);
    g.fillStyle = INK_2;
    g.font = `400 26px ${MONO}`;
    spaced(g, 'NILUS DESIGN · FLIGHT CASE', 36, y + 150, 2);
    g.fillStyle = PINK;
    g.fillRect(W - 60, y + 36, 24, 24);
  }
  return toTexture(c);
}

/** Generic transparent ink label. Returns { texture, aspect }. */
export function labelTexture(text, { size = 64, font = 'mono', color = INK, weight = 500, spacing = 0.08, pad = 0.4 } = {}) {
  const family = font === 'serif' ? SERIF : font === 'sans' ? SANS : MONO;
  const probe = canvas(8, 8).g;
  probe.font = `${weight} ${size}px ${family}`;
  const tw = spacedWidth(probe, text, size * spacing);
  const W = Math.ceil(tw + size * pad * 2);
  const H = Math.ceil(size * 1.5);
  const { c, g } = canvas(W, H);
  g.font = `${weight} ${size}px ${family}`;
  g.fillStyle = color;
  g.textBaseline = 'middle';
  spaced(g, text, size * pad, H * 0.54, size * spacing);
  return { texture: toTexture(c), aspect: W / H };
}

/** Soft contact shadow: radial (round) or blurred rounded-rectangle (square footprints). */
export function shadowTexture(shape = 'round') {
  const S = 256;
  const { c, g } = canvas(S, S);
  if (shape === 'round') {
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(60,44,28,0.55)');
    gr.addColorStop(0.45, 'rgba(60,44,28,0.28)');
    gr.addColorStop(1, 'rgba(60,44,28,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
  } else {
    g.filter = 'blur(14px)';
    g.fillStyle = 'rgba(60,44,28,0.5)';
    g.fillRect(S * 0.2, S * 0.2, S * 0.6, S * 0.6);
    g.filter = 'blur(4px)';
    g.fillStyle = 'rgba(40,30,20,0.35)';
    g.fillRect(S * 0.18, S * 0.18, S * 0.64, S * 0.64);
  }
  return toTexture(c, { srgb: false });
}

/** Neon light-spill ring for the floor strip (white; tinted by material colour). Inner square = platform. */
export function spillTexture() {
  const S = 512;
  const { c, g } = canvas(S, S);
  const inner = S * (1 / 1.5);
  const o = (S - inner) / 2;
  g.filter = 'blur(26px)';
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = 34;
  g.strokeRect(o, o, inner, inner);
  g.filter = 'blur(6px)';
  g.lineWidth = 8;
  g.strokeStyle = 'rgba(255,255,255,1)';
  g.strokeRect(o, o, inner, inner);
  return toTexture(c, { srgb: false });
}

/** Maintenance check glyph: cyan disc, ink tick. */
export function checkTexture() {
  const S = 128;
  const { c, g } = canvas(S, S);
  g.fillStyle = '#FBF8F2';
  g.beginPath(); g.arc(S / 2, S / 2, S * 0.44, 0, Math.PI * 2); g.fill();
  g.strokeStyle = CYAN;
  g.lineWidth = S * 0.06;
  g.stroke();
  g.strokeStyle = INK;
  g.lineWidth = S * 0.08;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath(); g.moveTo(S * 0.3, S * 0.52); g.lineTo(S * 0.45, S * 0.66); g.lineTo(S * 0.72, S * 0.36); g.stroke();
  return toTexture(c);
}

/** Soft round sprite for particles (alpha only). */
export function dotTexture() {
  const S = 64;
  const { c, g } = canvas(S, S);
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0.6)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  return toTexture(c, { srgb: false });
}

/** Road surface: side lines + centre dashes along u (repeat in u). */
export function roadTexture() {
  const W = 512;
  const H = 128;
  const { c, g } = canvas(W, H);
  g.fillStyle = '#DCD2C1';
  g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(27,25,22,0.55)';
  g.fillRect(0, H * 0.08, W, 2);
  g.fillRect(0, H * 0.92 - 2, W, 2);
  g.fillStyle = '#FBF8F2';
  g.fillRect(W * 0.1, H / 2 - 3, W * 0.4, 6);
  return toTexture(c, { repeat: true });
}
