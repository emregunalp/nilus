// The three rental layouts as simple 3D models, built from the shared stand kit (metres; +Z is the stand front,
// the origin sits on the floor under the platform's centre). Sizes follow the rental catalogue: a 3 × 2 m or
// 6 × 2 m platform, 3 m or 6 m illuminated fabric posters, 80 × 70 cm illuminated desk fronts. The posters are
// left blank on purpose — they carry the client's own artwork.

const PLATFORM_H = 0.08;
const DEPTH = 2;
const WALL_H = 2.72; // poster height above the platform
const WALL_D = 0.14;
const TAB_RISE = 0.3; // the name sign stands this much above the posters

/** [platform width, poster widths, desk x positions, table x positions] */
const LAYOUTS = Object.freeze({
  1: { width: 3, posters: [3], desks: [-0.9], tables: [0.72] },
  2: { width: 6, posters: [6], desks: [0], tables: [-1.95, 1.95] },
  3: { width: 6, posters: [3, 3], desks: [-2.05, 2.05], tables: [0] },
});

function softWhite(kit) {
  return kit.canvasTex(256, 256, (g, w, h) => {
    const glow = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.72);
    glow.addColorStop(0, '#ffffff');
    glow.addColorStop(1, '#e9e6e0');
    g.fillStyle = glow;
    g.fillRect(0, 0, w, h);
  });
}

/** The sign behind the left end of the back wall: rounded outer corner, sloping inner shoulder. */
function nameTab(kit, material) {
  const { THREE } = kit;
  const w = 1.25;
  const flat = 0.92;
  const top = WALL_H + TAB_RISE;
  const r = 0.16;
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(w, 0);
  s.lineTo(w, WALL_H);
  s.lineTo(flat, top);
  s.lineTo(r, top);
  s.absarc(r, top - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(0, 0);
  return kit.slab(s, 0.06, material);
}

function desk(kit, body, face) {
  const { THREE } = kit;
  const g = new THREE.Group();
  g.add(kit.box(0.9, 0.95, 0.45, body));
  const front = kit.plane(0.8, 0.7, face);
  front.position.set(0, 0.5, 0.228);
  g.add(front);
  return g;
}

function tableSet(kit, white) {
  const { THREE } = kit;
  const g = new THREE.Group();
  g.add(kit.roundTable(0.36, 0.74, white));
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const chair = kit.tubChair(0xf4f3f0);
    chair.position.set(Math.sin(a) * 0.62, 0, Math.cos(a) * 0.62);
    chair.rotation.y = a + Math.PI; // facing the table
    g.add(chair);
  }
  return g;
}

export function buildRentalStand(kit, layout) {
  const { THREE } = kit;
  const spec = LAYOUTS[layout];
  if (!spec) throw new Error(`unknown rental layout: ${layout}`);
  const white = kit.std(0xf6f5f2, { roughness: 0.5 });
  const floorTop = kit.std(0xefede9, { roughness: 0.7 });
  const face = kit.lit(softWhite(kit));
  const group = new THREE.Group();

  group.add(kit.platform(spec.width, DEPTH, PLATFORM_H, floorTop, { sideMaterial: white }));
  const wallZ = -DEPTH / 2 + WALL_D / 2 + 0.1;
  let x = -spec.width / 2;
  for (const w of spec.posters) {
    const poster = kit.lightbox(w - 0.02, WALL_H, WALL_D, {}, face, white, null);
    group.add(kit.at(poster, x + w / 2, PLATFORM_H, wallZ));
    x += w;
  }
  group.add(kit.at(nameTab(kit, white), -spec.width / 2 - 0.1, PLATFORM_H, wallZ - WALL_D / 2 - 0.04));
  for (const dx of spec.desks) group.add(kit.at(desk(kit, white, face), dx, PLATFORM_H, 0.48));
  for (const tx of spec.tables) group.add(kit.at(tableSet(kit, white), tx, PLATFORM_H, 0.12));
  return group;
}
