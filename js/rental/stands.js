// The three rental layouts as simple 3D models, built from the shared stand kit (metres; +Z is the stand front,
// the origin sits on the floor under the platform's centre). Sizes follow the rental catalogue: a 3 × 2 m or
// 6 × 2 m platform, 3 m or 6 m illuminated fabric posters, 80 × 70 cm illuminated desk fronts.
// Without artwork the lightboxes are blank, as in the catalogue drawings; with artwork (./artwork.js) the same
// stand is shown printed.

const PLATFORM_H = 0.08;
const DEPTH = 2;
const WALL_H = 2.72; // poster height above the platform
const WALL_D = 0.14;
const FRAME = 0.03; // aluminium profile showing around a lightbox face
const TAB_RISE = 0.3; // the name sign stands this much above the posters
const TAB_W = 1.25;
const TAB_FLAT = 0.92; // width of the sign's level top edge, before the shoulder slopes down

/** [platform width, poster widths, desk x positions, table x positions] */
const LAYOUTS = Object.freeze({
  1: { width: 3, posters: [3], desks: [-0.9], tables: [0.72] },
  2: { width: 6, posters: [6], desks: [0], tables: [-1.95, 1.95] },
  3: { width: 6, posters: [3, 3], desks: [-2.05, 2.05], tables: [0] },
});

/** An unprinted lightbox: bright in the middle, falling off to grey towards the frame. */
function blankFace(kit) {
  return kit.canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#c3c5c8';
    g.fillRect(0, 0, w, h);
    const glow = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w * 0.62);
    glow.addColorStop(0, '#ffffff');
    glow.addColorStop(0.45, '#eceded');
    glow.addColorStop(1, 'rgba(195, 197, 200, 0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, w, h);
  });
}

function poster(kit, w, body, face) {
  const { THREE } = kit;
  const g = new THREE.Group();
  g.add(kit.box(w, WALL_H, WALL_D, body));
  const front = kit.plane(w - FRAME * 2, WALL_H - FRAME * 2, face);
  front.position.set(0, WALL_H / 2, WALL_D / 2 + 0.002);
  g.add(front);
  return g;
}

/** The sign behind the left end of the back wall: rounded outer corner, sloping inner shoulder. */
function nameTab(kit, material, logo) {
  const { THREE } = kit;
  const top = WALL_H + TAB_RISE;
  const r = 0.16;
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(TAB_W, 0);
  s.lineTo(TAB_W, WALL_H);
  s.lineTo(TAB_FLAT, top);
  s.lineTo(r, top);
  s.absarc(r, top - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(0, 0);
  const g = new THREE.Group();
  g.add(kit.slab(s, 0.06, material));
  if (logo) {
    const height = 0.15;
    const mark = kit.plane(height * logo.aspect, height, logo.material);
    mark.position.set(0.12 + (height * logo.aspect) / 2, WALL_H + TAB_RISE / 2 + 0.01, 0.033);
    g.add(mark);
  }
  return g;
}

function desk(kit, body, frame, face) {
  const { THREE } = kit;
  const g = new THREE.Group();
  g.add(kit.box(0.9, 0.95, 0.45, body));
  const rim = kit.plane(0.86, 0.76, frame);
  rim.position.set(0, 0.5, 0.2265);
  const front = kit.plane(0.8, 0.7, face);
  front.position.set(0, 0.5, 0.228);
  g.add(rim, front);
  return g;
}

/** Moulded shell chair on four splayed wooden legs, as in the catalogue drawings. */
function shellChair(kit, shell, wood) {
  const { THREE } = kit;
  const g = new THREE.Group();
  g.add(kit.at(kit.rbox(0.44, 0.05, 0.42, 0.024, shell), 0, 0.42, 0.02));
  const back = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.215, 0.4, 24, 1, true, Math.PI * 0.62, Math.PI * 0.76).translate(0, 0.65, 0.04), shell);
  back.castShadow = true;
  g.add(back);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    // Hinged under the seat, the foot splayed outwards.
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.01, 0.45, 8).translate(0, -0.225, 0), wood);
    leg.castShadow = true;
    leg.position.set(sx * 0.13, 0.43, sz * 0.12 + 0.02);
    leg.rotation.set(-sz * 0.24, 0, sx * 0.24);
    g.add(leg);
  }
  return g;
}

function tableSet(kit, top, shell, wood) {
  const { THREE } = kit;
  const g = new THREE.Group();
  g.add(kit.roundTable(0.36, 0.74, top));
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const chair = shellChair(kit, shell, wood);
    chair.position.set(Math.sin(a) * 0.62, 0, Math.cos(a) * 0.62);
    chair.rotation.y = a + Math.PI; // facing the table
    g.add(chair);
  }
  return g;
}

/**
 * `art` (optional, from ./artwork.js): { posters: [texture…], desks: [texture…], tab: { texture, aspect }, floor }.
 * Missing entries stay blank.
 */
export function buildRentalStand(kit, layout, art = null) {
  const { THREE } = kit;
  const spec = LAYOUTS[layout];
  if (!spec) throw new Error(`unknown rental layout: ${layout}`);
  const white = kit.std(0xeceded, { roughness: 0.55 });
  const frame = kit.std(0xd3d5d8, { roughness: 0.4, metalness: 0.35 });
  const floorTop = kit.std(art?.floor ?? 0xdfe0e2, { roughness: 0.85 });
  const shell = kit.std(art ? 0xcfc6b8 : 0xf2f2f1, { roughness: 0.6, side: THREE.DoubleSide });
  const wood = kit.std(0xd2ac80, { roughness: 0.6 });
  const tableTop = art ? kit.std(0xc9a57c, { roughness: 0.5 }) : white;
  const blank = kit.lit(blankFace(kit));
  const faceOf = (texture) => (texture ? kit.lit(texture) : blank);
  const group = new THREE.Group();

  group.add(kit.platform(spec.width, DEPTH, PLATFORM_H, floorTop, { sideMaterial: white }));
  const wallZ = -DEPTH / 2 + WALL_D / 2 + 0.1;
  let x = -spec.width / 2;
  spec.posters.forEach((w, i) => {
    group.add(kit.at(poster(kit, w - 0.02, frame, faceOf(art?.posters?.[i])), x + w / 2, PLATFORM_H, wallZ));
    x += w;
  });
  const tabLogo = art?.tab && { aspect: art.tab.aspect, material: kit.lit(art.tab.texture, { transparent: true }) };
  group.add(kit.at(nameTab(kit, white, tabLogo), -spec.width / 2 - 0.1, PLATFORM_H, wallZ - WALL_D / 2 - 0.04));
  spec.desks.forEach((dx, i) => group.add(kit.at(desk(kit, white, frame, faceOf(art?.desks?.[i])), dx, PLATFORM_H, 0.48)));
  for (const tx of spec.tables) group.add(kit.at(tableSet(kit, tableTop, shell, wood), tx, PLATFORM_H, 0.12));
  return group;
}
