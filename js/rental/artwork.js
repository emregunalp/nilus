// Sample prints for the rental examples: the same three layouts, shown with artwork on the posters, the desk
// fronts and the name sign. Everything carries Nilus's own brand (site colours, the logo's own outlines) so that
// no client's material is used; a renter's stand carries their artwork instead.

import { drawLogo, WORDMARK_ASPECT } from '../scene-b/logo.js';
import { t } from '../i18n.js';

const PX = 320; // canvas pixels per metre of print
const POSTER_H = 2.66; // printed height inside the frame, metres
const INK = '#1B1916';
const CREAM = '#F3EDE3';
const PINK = '#FF2FB9';
const VIOLET = '#8A6BFF';
const CYAN = '#38D6FF';
const DISPLAY = '"Fraunces", "Iowan Old Style", Georgia, serif';
const MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace';

const HEADLINE = () => t('Markanız burada.', 'Your brand here.');
const CAPTION = () => t('IŞIKLI TEKSTİL BASKI', 'ILLUMINATED FABRIC PRINT');

function neon(g, x0, y0, x1, y1) {
  const grad = g.createLinearGradient(x0, y0, x1, y1);
  grad.addColorStop(0, PINK);
  grad.addColorStop(0.55, VIOLET);
  grad.addColorStop(1, CYAN);
  return grad;
}

/** Concentric neon arcs around (cx, cy): the glowing lines of the Nilus stand, as a print. */
function arcs(g, cx, cy, r0, step, count, width) {
  g.save();
  g.lineCap = 'round';
  g.strokeStyle = neon(g, cx - r0 - step * count, cy, cx + r0 + step * count, cy - r0);
  g.shadowColor = 'rgba(255, 47, 185, .55)';
  g.shadowBlur = width * 3;
  for (let i = 0; i < count; i++) {
    g.lineWidth = Math.max(2, width * (1 - i / (count * 1.4)));
    g.beginPath();
    g.arc(cx, cy, r0 + step * i, 0, Math.PI * 2);
    g.stroke();
  }
  g.restore();
}

/** Parallel flowing lines across the full width of a print. */
function ribbon(g, w, h, y, amp, count, width) {
  g.save();
  g.lineCap = 'round';
  g.strokeStyle = neon(g, 0, 0, w, 0);
  for (let i = 0; i < count; i++) {
    g.lineWidth = width;
    g.globalAlpha = 1 - i * (0.7 / count);
    g.beginPath();
    for (let x = -20; x <= w + 20; x += 12) {
      const u = x / w;
      const yy = y + i * width * 2.6 + Math.sin(u * Math.PI * 2.2 + i * 0.22) * amp * (1 - i * 0.05) + Math.sin(u * Math.PI * 5 + 1) * amp * 0.12;
      if (x === -20) g.moveTo(x, yy); else g.lineTo(x, yy);
    }
    g.stroke();
  }
  g.restore();
}

function caption(g, x, y, size, color) {
  g.save();
  g.font = `500 ${size}px ${MONO}`;
  g.fillStyle = color;
  g.textBaseline = 'alphabetic';
  let cx = x;
  for (const ch of CAPTION()) { g.fillText(ch, cx, y); cx += g.measureText(ch).width + size * 0.16; }
  g.restore();
}

function headline(g, text, x, y, size, color, align = 'left') {
  g.save();
  g.font = `300 ${size}px ${DISPLAY}`;
  g.fillStyle = color;
  g.textAlign = align;
  g.textBaseline = 'alphabetic';
  g.fillText(text, x, y);
  g.restore();
}

/* ---------- posters ---------- */
function inkPoster(g, w, h) {
  const bg = g.createRadialGradient(w * 0.7, h * 0.6, 20, w * 0.7, h * 0.6, w);
  bg.addColorStop(0, '#2E2924');
  bg.addColorStop(1, INK);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  arcs(g, w * 0.86, h * 0.98, h * 0.2, h * 0.085, 8, h * 0.014);
  const logoH = h * 0.12;
  drawLogo(g, w * 0.08 + (logoH * WORDMARK_ASPECT) / 2, h * 0.14, logoH, { color: CREAM });
  headline(g, HEADLINE(), w * 0.08, h * 0.5, h * 0.105, CREAM);
  caption(g, w * 0.08, h * 0.57, h * 0.022, 'rgba(243, 237, 227, .7)');
}

function creamPoster(g, w, h) {
  g.fillStyle = CREAM;
  g.fillRect(0, 0, w, h);
  ribbon(g, w, h, h * 0.64, h * 0.11, 7, h * 0.011);
  const logoH = h * 0.16;
  drawLogo(g, w * 0.06 + (logoH * WORDMARK_ASPECT) / 2, h * 0.2, logoH, { color: INK });
  headline(g, HEADLINE(), w * 0.94, h * 0.24, h * 0.12, INK, 'right');
  caption(g, w * 0.06, h * 0.93, h * 0.024, 'rgba(27, 25, 22, .62)');
}

function gradientPoster(g, w, h) {
  const bg = g.createLinearGradient(0, h, w, 0);
  bg.addColorStop(0, '#5B3FD6');
  bg.addColorStop(0.55, '#B23BD0');
  bg.addColorStop(1, PINK);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.save();
  g.globalAlpha = 0.22;
  g.strokeStyle = CREAM;
  g.lineWidth = h * 0.004;
  for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(w * 0.5, h * 0.44, h * (0.2 + i * 0.07), 0, Math.PI * 2); g.stroke(); }
  g.restore();
  const logoH = h * 0.15;
  drawLogo(g, w / 2, h * 0.44, logoH, { color: CREAM });
  caption(g, w * 0.08, h * 0.93, h * 0.022, 'rgba(243, 237, 227, .8)');
}

/* ---------- desk fronts (80 × 70 cm) and the name sign ---------- */
function deskFront(kit, bg, color, glyphs) {
  return kit.canvasTex(512, 448, (g, w, h) => {
    if (bg === 'gradient') {
      const grad = g.createLinearGradient(0, h, w, 0);
      grad.addColorStop(0, '#5B3FD6');
      grad.addColorStop(1, PINK);
      g.fillStyle = grad;
    } else g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    drawLogo(g, w / 2, h / 2, glyphs ? h * 0.3 : h * 0.17, { color, ...(glyphs && { glyphs }) });
  });
}

function signLogo(kit) {
  const h = 160;
  const w = Math.round(h * WORDMARK_ASPECT);
  return { aspect: w / h, texture: kit.canvasTex(w, h, (g) => drawLogo(g, w / 2, h / 2, h * 0.94, { color: INK })) };
}

const posterTex = (kit, metres, draw) => kit.canvasTex(Math.round(metres * PX), Math.round(POSTER_H * PX), draw);
const SHORT = ['n', 'dot'];

const SETS = {
  ink: (kit) => ({
    posters: [posterTex(kit, 2.92, inkPoster)],
    desks: [deskFront(kit, INK, CREAM, SHORT)],
    floor: 0x3a3632,
  }),
  cream: (kit) => ({
    posters: [posterTex(kit, 5.92, creamPoster)],
    desks: [deskFront(kit, CREAM, INK)],
    floor: 0xd8d0c2,
  }),
  duo: (kit) => ({
    posters: [posterTex(kit, 2.92, gradientPoster), posterTex(kit, 2.92, inkPoster)],
    desks: [deskFront(kit, 'gradient', CREAM, SHORT), deskFront(kit, INK, CREAM)],
    floor: 0x3a3632,
  }),
};

/** The site's fonts are used on the prints; wait briefly for them so the first drawing is not in a fallback face. */
export async function artworkReady() {
  if (!document.fonts?.load) return;
  const wanted = [`300 64px ${DISPLAY}`, `500 24px ${MONO}`].map((font) => document.fonts.load(font, HEADLINE() + CAPTION()));
  await Promise.race([Promise.allSettled(wanted), new Promise((resolve) => setTimeout(resolve, 1500))]);
}

export function rentalArtwork(kit, name) {
  const set = SETS[name];
  return set ? { ...set(kit), tab: signLogo(kit) } : null;
}
