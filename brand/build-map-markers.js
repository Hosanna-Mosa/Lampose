/**
 * Lampose's 3D map markers — the restaurant, the delivery address and the rider —
 * drawn here as SVG and rendered to transparent @1x/@2x/@3x PNGs.
 *
 *   node brand/build-map-markers.js              (run from the monorepo root)
 *   node brand/build-map-markers.js --preview preview.png
 *
 * Writes into `User App/assets/images/markers/` (all three) and
 * `driver/assets/images/markers/` (the two buildings; the rider app shows its
 * own position as the heading arrow), plus each SVG under `source/`.
 *
 * PNGs, not SVG or a custom view: the maps hand these to `<Marker image={…}>`.
 * A custom-view marker is snapshotted on a software canvas on Android and has
 * clipped there before (see the comments in `MapPanel.tsx`). The densities
 * matter too: 1x, 2x and 3x mean the marker is the same size in dp in a dev
 * build, where Metro serves the file, and in a release build, where it is a
 * drawable resource.
 *
 * Geometry is true 2:1 isometric (`iso()` below), so a wall or window moved
 * here stays square to the building. The artwork is Lampose's own, in the brand
 * green, the logo's yellow "o" and warm cream. It shares nothing with any other
 * product's markers.
 *
 * Rendering borrows the Backend's Playwright (`npm run browsers` there), or
 * the installed Chrome when that browser build is missing.
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require(path.join(__dirname, "..", "Backend", "node_modules", "playwright"));

const ROOT = path.join(__dirname, "..");
const USER_APP = path.join(ROOT, "User App", "assets", "images", "markers");
const RIDER_APP = path.join(ROOT, "driver", "assets", "images", "markers");

// Lampose palette: the brand teal-green, the logo's yellow "o", warm cream.
const C = {
  brand: "#0E6E5C",
  brandLit: "#13836D",
  brandDark: "#0A5748",
  brandDeep: "#073F34",
  mint: "#E4F2EC",
  mintShade: "#C5E0D6",
  yellow: "#F6D23E",
  yellowLit: "#FFE57A",
  yellowDark: "#D4A91C",
  cream: "#FFF8EA",
  creamShade: "#EFE3C9",
  creamDark: "#DCCBA6",
  glassHi: "#FFE9A3",
  glassLo: "#F2BF3A",
  ink: "#123A31",
  graphite: "#25292D",
  graphite2: "#3B4148",
  steel: "#C9D2D8",
  red: "#E5484D",
  white: "#FFFFFF",
};

const r2 = (n) => Math.round(n * 100) / 100;
const pts = (list) => list.map(([x, y]) => `${r2(x)},${r2(y)}`).join(" ");
const poly = (list, fill, extra = "") => `<polygon points="${pts(list)}" fill="${fill}" ${extra}/>`;

/** 2:1 isometric. u runs along the right (lit) face, v along the left (shaded)
 *  face, z is up. (ox, oy) is the ground point under the front corner. */
function iso(ox, oy) {
  const p = (u, v, z) => [ox + u - v, oy - (u + v) / 2 - z];
  return {
    p,
    right: (u0, u1, z0, z1, v = 0) => [p(u0, v, z0), p(u1, v, z0), p(u1, v, z1), p(u0, v, z1)],
    left: (v0, v1, z0, z1, u = 0) => [p(u, v0, z0), p(u, v1, z0), p(u, v1, z1), p(u, v0, z1)],
    top: (u0, u1, v0, v1, z) => [p(u0, v0, z), p(u1, v0, z), p(u1, v1, z), p(u0, v1, z)],
  };
}

/** A solid box: the two visible walls and its top. */
function box(I, [u0, u1], [v0, v1], [z0, z1], { top, right, left }) {
  return [
    poly(I.left(v0, v1, z0, z1, u0), left),
    poly(I.right(u0, u1, z0, z1, v0), right),
    poly(I.top(u0, u1, v0, v1, z1), top),
  ].join("");
}

const defs = `
  <defs>
    <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.3"/></filter>
    <filter id="softer" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="0.8"/></filter>
    <!-- White sticker halo round the silhouette, so the model reads on any map tile. -->
    <filter id="halo" x="-20%" y="-20%" width="140%" height="140%">
      <feMorphology in="SourceAlpha" operator="dilate" radius="1.1" result="grown"/>
      <feFlood flood-color="#FFFFFF"/>
      <feComposite in2="grown" operator="in" result="ring"/>
      <feMerge><feMergeNode in="ring"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <linearGradient id="glass" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${C.glassHi}"/><stop offset="1" stop-color="${C.glassLo}"/>
    </linearGradient>
    <radialGradient id="pinFill" cx="0.38" cy="0.32" r="0.8">
      <stop offset="0" stop-color="${C.brandLit}"/><stop offset="1" stop-color="${C.brandDeep}"/>
    </radialGradient>
    <radialGradient id="helmet" cx="0.36" cy="0.32" r="0.75">
      <stop offset="0" stop-color="#FFFFFF"/><stop offset="0.7" stop-color="#EEF1F2"/><stop offset="1" stop-color="#C7CED2"/>
    </radialGradient>
    <linearGradient id="boxTop" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${C.yellowLit}"/><stop offset="1" stop-color="${C.yellow}"/>
    </linearGradient>
    <linearGradient id="jacket" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${C.brandDark}"/><stop offset="0.45" stop-color="${C.brandLit}"/><stop offset="1" stop-color="${C.brandDark}"/>
    </linearGradient>
    <linearGradient id="tank" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${C.graphite}"/><stop offset="0.5" stop-color="${C.graphite2}"/><stop offset="1" stop-color="${C.graphite}"/>
    </linearGradient>
  </defs>`;

/** Lampose map pin hovering over a roof: a teardrop with the logo's yellow "o"
 *  ring and a white glyph, plus its own small shadow on the roof below. */
function pinBadge(cx, tipY, glyph) {
  const r = 8.6;
  const cy = tipY - r * 1.55;
  const shoulder = r * 0.62;
  const d = [
    `M ${r2(cx)} ${r2(tipY)}`,
    `C ${r2(cx - shoulder)} ${r2(tipY - r * 0.55)} ${r2(cx - r)} ${r2(cy + r * 0.55)} ${r2(cx - r)} ${r2(cy)}`,
    `A ${r} ${r} 0 1 1 ${r2(cx + r)} ${r2(cy)}`,
    `C ${r2(cx + r)} ${r2(cy + r * 0.55)} ${r2(cx + shoulder)} ${r2(tipY - r * 0.55)} ${r2(cx)} ${r2(tipY)}`,
    "Z",
  ].join(" ");
  return `
    <ellipse cx="${r2(cx)}" cy="${r2(tipY + 3.2)}" rx="4.2" ry="1.6" fill="#0B2A23" opacity="0.28" filter="url(#softer)"/>
    <path d="${d}" fill="url(#pinFill)" stroke="#FFFFFF" stroke-width="1.3" stroke-linejoin="round"/>
    <circle cx="${r2(cx)}" cy="${r2(cy)}" r="5.7" fill="none" stroke="${C.yellow}" stroke-width="1.7"/>
    <path d="M ${r2(cx - r * 0.55)} ${r2(cy - r * 0.62)} A ${r} ${r} 0 0 1 ${r2(cx + r * 0.2)} ${r2(cy - r * 0.86)}" fill="none" stroke="#FFFFFF" stroke-opacity="0.35" stroke-width="1" stroke-linecap="round"/>
    ${glyph(cx, cy)}`;
}

/** Serving cloche: the restaurant's glyph. */
const clocheGlyph = (cx, cy) => `
    <g fill="#FFFFFF">
      <path d="M ${r2(cx - 3.3)} ${r2(cy + 1.2)} A 3.3 3.3 0 0 1 ${r2(cx + 3.3)} ${r2(cy + 1.2)} Z"/>
      <rect x="${r2(cx - 3.9)}" y="${r2(cy + 1.5)}" width="7.8" height="1.1" rx="0.55"/>
      <circle cx="${r2(cx)}" cy="${r2(cy - 2.6)}" r="0.75"/>
    </g>`;

/** A little house: the delivery address's glyph. */
const homeGlyph = (cx, cy) => `
    <g fill="#FFFFFF">
      <path d="M ${r2(cx)} ${r2(cy - 3.6)} L ${r2(cx + 3.7)} ${r2(cy - 0.4)} L ${r2(cx + 2.6)} ${r2(cy - 0.4)} L ${r2(cx + 2.6)} ${r2(cy + 3)} L ${r2(cx - 2.6)} ${r2(cy + 3)} L ${r2(cx - 2.6)} ${r2(cy - 0.4)} L ${r2(cx - 3.7)} ${r2(cy - 0.4)} Z"/>
      <rect x="${r2(cx - 0.8)}" y="${r2(cy + 0.9)}" width="1.6" height="2.1" fill="${C.brandDeep}"/>
    </g>`;

/* ── Restaurant: a flat-roofed green café with a striped awning ─────────── */
function restaurantSvg() {
  const W = 56, H = 68, GX = 26, GY = 60;
  const I = iso(GX, GY);
  const U = 22, V = 14, Z = 19; // storefront width, side depth, wall height
  const out = [];

  // Ground shadow, cast back-left.
  const fp = I.top(-2.5, U + 3, -3.5, V + 1.5, 0).map(([x, y]) => [x - 1.5, y + 0.6]);
  out.push(`<polygon points="${pts(fp)}" fill="#0B2A23" opacity="0.26" filter="url(#soft)"/>`);

  const b = [];
  // Walls and roof (roof is a parapet: light rim, slightly darker inset deck).
  b.push(poly(I.left(0, V, 0, Z), C.brandDark));
  b.push(poly(I.right(0, U, 0, Z), C.brand));
  b.push(poly(I.top(0, U, 0, V, Z), C.mint));
  b.push(poly(I.top(1.6, U - 1.6, 1.6, V - 1.6, Z), C.mintShade));
  // Inner faces of the far parapet walls, peeking over the deck.
  b.push(poly([I.p(1.6, V - 1.6, Z), I.p(U - 1.6, V - 1.6, Z), I.p(U - 1.6, V - 1.6, Z + 0.01), I.p(1.6, V - 1.6, Z + 0.01)], C.mintShade));
  // Kitchen exhaust on the roof, back-left.
  const ex = I.p(4.5, V - 4.5, Z);
  b.push(`<rect x="${r2(ex[0] - 1.6)}" y="${r2(ex[1] - 5)}" width="3.2" height="5" fill="${C.graphite2}"/>`);
  b.push(`<ellipse cx="${r2(ex[0])}" cy="${r2(ex[1])}" rx="1.6" ry="0.8" fill="${C.graphite2}"/>`);
  b.push(`<ellipse cx="${r2(ex[0])}" cy="${r2(ex[1] - 5)}" rx="1.6" ry="0.8" fill="${C.graphite}"/>`);
  b.push(`<rect x="${r2(ex[0] - 2.3)}" y="${r2(ex[1] - 6.6)}" width="4.6" height="1" rx="0.5" fill="${C.graphite2}"/>`);

  // Plinth along both walls.
  b.push(poly(I.left(0, V, 0, 1.6), C.brandDeep));
  b.push(poly(I.right(0, U, 0, 1.6), C.brandDark));
  // Cream fascia band carrying the sign, top of the storefront.
  b.push(poly(I.right(0, U, Z - 3, Z - 0.6), C.cream));
  b.push(poly(I.left(0, V, Z - 3, Z - 0.6), C.creamShade));
  // The yellow "o" on the fascia, flattened onto the wall plane.
  const sc = I.p(U / 2, 0, Z - 1.8);
  b.push(`<ellipse cx="${r2(sc[0])}" cy="${r2(sc[1])}" rx="1.25" ry="0.95" transform="rotate(-26.57 ${r2(sc[0])} ${r2(sc[1])})" fill="none" stroke="${C.yellowDark}" stroke-width="0.8"/>`);
  [-6.5, -4.5, 4.5, 6.5].forEach((du) => {
    const q = I.p(U / 2 + du, 0, Z - 1.8);
    b.push(`<circle cx="${r2(q[0])}" cy="${r2(q[1])}" r="0.45" fill="${C.brand}"/>`);
  });

  // Side window (shaded wall).
  b.push(poly(I.left(3, V - 3, 5.5, 12.5), C.cream));
  b.push(poly(I.left(3.7, V - 3.7, 6.2, 11.8), "url(#glass)"));
  b.push(poly(I.left(V / 2 - 0.3, V / 2 + 0.3, 6.2, 11.8), C.cream));

  // Storefront: big lit window and a cream door with a glass panel.
  b.push(poly(I.right(1.8, 13.2, 3, 10.8), C.cream));
  b.push(poly(I.right(2.5, 12.5, 3.7, 10.1), "url(#glass)"));
  b.push(poly(I.right(7.2, 7.8, 3.7, 10.1), C.cream));
  b.push(poly(I.right(15, 20.2, 1.6, 11.2), C.cream));
  b.push(poly(I.right(15.8, 19.4, 5.5, 10.4), "url(#glass)"));
  b.push(poly(I.right(15.8, 19.4, 2.3, 4.9), C.creamShade));
  const knob = I.p(16.6, 0, 5);
  b.push(`<circle cx="${r2(knob[0])}" cy="${r2(knob[1])}" r="0.45" fill="${C.brandDark}"/>`);

  // Awning shade on the wall below it.
  b.push(poly(I.right(0.6, U - 0.6, 11.4, 15.2), "#000000", 'opacity="0.16"'));

  // Striped awning: leaves the wall at z=15.2 and slopes out 4.2 and down 2.8.
  const zt = 15.2, out_ = -4.2, drop = 2.8, val = 1.6;
  const stripes = 8;
  const us = 0.6, ue = U - 0.6, sw = (ue - us) / stripes;
  // Left end cap of the awning (the side you can see).
  b.push(poly([I.p(us, 0, zt), I.p(us, out_, zt - drop), I.p(us, out_, zt - drop - val), I.p(us, 0, zt - drop - val + 0.4)], C.yellowDark));
  for (let i = 0; i < stripes; i++) {
    const a = us + i * sw, c = a + sw;
    const fill = i % 2 === 0 ? C.yellow : C.cream;
    b.push(poly([I.p(a, 0, zt), I.p(c, 0, zt), I.p(c, out_, zt - drop), I.p(a, out_, zt - drop)], fill));
    // Scalloped valance.
    const p1 = I.p(a, out_, zt - drop), p2 = I.p(c, out_, zt - drop);
    const p3 = I.p(c, out_, zt - drop - val), p4 = I.p(a, out_, zt - drop - val);
    const mid = I.p((a + c) / 2, out_, zt - drop - val - 1.1);
    const vfill = i % 2 === 0 ? C.yellowDark : C.creamShade;
    b.push(`<path d="M ${r2(p1[0])} ${r2(p1[1])} L ${r2(p2[0])} ${r2(p2[1])} L ${r2(p3[0])} ${r2(p3[1])} Q ${r2(mid[0])} ${r2(mid[1])} ${r2(p4[0])} ${r2(p4[1])} Z" fill="${vfill}"/>`);
  }
  // Fine ink lines on the main edges.
  const edge = (a, c) => `<line x1="${r2(a[0])}" y1="${r2(a[1])}" x2="${r2(c[0])}" y2="${r2(c[1])}" stroke="${C.ink}" stroke-width="0.5" stroke-linecap="round" opacity="0.55"/>`;
  b.push(edge(I.p(0, 0, 0), I.p(0, 0, Z)));

  out.push(`<g filter="url(#halo)">${b.join("")}</g>`);
  out.push(pinBadge(I.p(U / 2, V / 2, Z)[0] + 2, I.p(U / 2, V / 2, Z)[1] - 6, clocheGlyph));

  return {
    name: "marker_restaurant",
    width: W,
    height: H,
    anchor: { x: GX, y: GY },
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${defs}${out.join("")}</svg>`,
  };
}

/* ── Home: a cream two-storey residence with a rooftop water tank ──────── */
function homeSvg() {
  const W = 56, H = 68, GX = 28, GY = 60;
  const I = iso(GX, GY);
  const U = 18, V = 15, Z = 22;
  const out = [];

  const fp = I.top(-2.5, U + 2.5, -2.5, V + 1.5, 0).map(([x, y]) => [x - 1.5, y + 0.6]);
  out.push(`<polygon points="${pts(fp)}" fill="#0B2A23" opacity="0.26" filter="url(#soft)"/>`);

  const b = [];
  b.push(poly(I.left(0, V, 0, Z), C.creamShade));
  b.push(poly(I.right(0, U, 0, Z), C.cream));
  // Parapet roof, green.
  b.push(poly(I.top(0, U, 0, V, Z), C.brand));
  b.push(poly(I.top(1.5, U - 1.5, 1.5, V - 1.5, Z), C.brandDark));
  // Green coping band just under the roof line.
  b.push(poly(I.right(0, U, Z - 1.4, Z), C.brandLit));
  b.push(poly(I.left(0, V, Z - 1.4, Z), C.brandDark));
  // Floor band between the storeys, and the plinth.
  b.push(poly(I.right(0, U, 10.6, 11.6), C.creamDark));
  b.push(poly(I.left(0, V, 10.6, 11.6), C.creamDark));
  b.push(poly(I.right(0, U, 0, 1.6), C.brandDark));
  b.push(poly(I.left(0, V, 0, 1.6), C.brandDeep));

  // Rooftop water tank on a little stand (the black cylinder on every Indian roof).
  const tk = I.p(U - 3.6, 3.4, Z);
  b.push(poly([[tk[0] - 3, tk[1]], [tk[0] + 3, tk[1]], [tk[0] + 3, tk[1] - 1.2], [tk[0] - 3, tk[1] - 1.2]], C.graphite2));
  b.push(`<rect x="${r2(tk[0] - 2.6)}" y="${r2(tk[1] - 6.6)}" width="5.2" height="5.4" fill="${C.graphite}"/>`);
  b.push(`<ellipse cx="${r2(tk[0])}" cy="${r2(tk[1] - 1.2)}" rx="2.6" ry="1.1" fill="${C.graphite}"/>`);
  b.push(`<ellipse cx="${r2(tk[0])}" cy="${r2(tk[1] - 6.6)}" rx="2.6" ry="1.1" fill="${C.graphite2}"/>`);
  b.push(`<rect x="${r2(tk[0] - 1.9)}" y="${r2(tk[1] - 5.6)}" width="0.7" height="4" fill="#FFFFFF" opacity="0.18"/>`);

  // Windows: lit glass in green frames. Two up, one down beside the door.
  const winR = (u0, u1, z0, z1) => {
    b.push(poly(I.right(u0 - 0.6, u1 + 0.6, z0 - 0.6, z1 + 0.6), C.brand));
    b.push(poly(I.right(u0, u1, z0, z1), "url(#glass)"));
    b.push(poly(I.right((u0 + u1) / 2 - 0.25, (u0 + u1) / 2 + 0.25, z0, z1), C.brand));
    b.push(poly(I.right(u0 - 0.9, u1 + 0.9, z0 - 1.3, z0 - 0.6), C.creamDark));
  };
  const winL = (v0, v1, z0, z1) => {
    b.push(poly(I.left(v0 - 0.6, v1 + 0.6, z0 - 0.6, z1 + 0.6), C.brandDark));
    b.push(poly(I.left(v0, v1, z0, z1), "url(#glass)"));
    b.push(poly(I.left((v0 + v1) / 2 - 0.25, (v0 + v1) / 2 + 0.25, z0, z1), C.brandDark));
  };
  winR(2.6, 7.4, 14, 19);
  winR(10.6, 15.4, 14, 19);
  winR(2.6, 7.4, 4, 8.6);
  winL(4, 11, 14, 19);
  winL(4, 11, 4, 8.6);

  // Small balcony on the upper floor of the side wall: slab plus green rail.
  // Door with a little canopy.
  b.push(poly(I.right(10.4, 15.6, 1.6, 9.4), C.brand));
  b.push(poly(I.right(11.1, 14.9, 1.6, 8.8), C.brandLit));
  const kb = I.p(14.1, 0, 5);
  b.push(`<circle cx="${r2(kb[0])}" cy="${r2(kb[1])}" r="0.45" fill="${C.yellow}"/>`);
  b.push(poly(I.right(10.4, 15.6, 7.6, 9.4), "#000000", 'opacity="0.12"'));
  b.push(poly([I.p(9.8, 0, 10.2), I.p(16.2, 0, 10.2), I.p(16.2, -2.6, 9.4), I.p(9.8, -2.6, 9.4)], C.yellow));
  b.push(poly([I.p(9.8, -2.6, 9.4), I.p(16.2, -2.6, 9.4), I.p(16.2, -2.6, 8.6), I.p(9.8, -2.6, 8.6)], C.yellowDark));
  b.push(poly([I.p(9.8, 0, 10.2), I.p(9.8, -2.6, 9.4), I.p(9.8, -2.6, 8.6), I.p(9.8, 0, 9.4)], C.yellowDark));

  b.push(`<line x1="${r2(I.p(0, 0, 0)[0])}" y1="${r2(I.p(0, 0, 0)[1])}" x2="${r2(I.p(0, 0, Z)[0])}" y2="${r2(I.p(0, 0, Z)[1])}" stroke="${C.creamDark}" stroke-width="0.6"/>`);

  out.push(`<g filter="url(#halo)">${b.join("")}</g>`);
  const rc = I.p(U / 2 - 2, V / 2 - 1, Z);
  out.push(pinBadge(rc[0], rc[1] - 3.5, homeGlyph));

  return {
    name: "marker_home",
    width: W,
    height: H,
    anchor: { x: GX, y: GY },
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${defs}${out.join("")}</svg>`,
  };
}

/* ── Rider: a delivery motorbike from above, nose up (north) ───────────── */
function riderSvg() {
  const W = 40, H = 56, cx = 20;
  const s = [];
  // Drop shadow under the whole bike, nudged down-right so it lifts off the road.
  s.push(`<g transform="translate(1.6 2)" opacity="0.32" filter="url(#soft)" fill="#0B2A23">
      <rect x="${cx - 2.6}" y="4" width="5.2" height="12" rx="2.6"/>
      <rect x="${cx - 11}" y="34" width="22" height="19" rx="3.5"/>
      <ellipse cx="${cx}" cy="27" rx="10.5" ry="8"/>
      <rect x="${cx - 13}" y="14.5" width="26" height="3" rx="1.5"/>
    </g>`);

  const b = [];
  // Front tyre, running out ahead of the headlamp.
  b.push(`<rect x="${cx - 2.3}" y="1.6" width="4.6" height="11" rx="2.3" fill="${C.graphite}"/>`);
  for (let y = 3; y < 9; y += 1.6) b.push(`<rect x="${cx - 1.7}" y="${r2(y)}" width="3.4" height="0.5" rx="0.25" fill="${C.graphite2}"/>`);
  // Headlamp nacelle in brand green, the lamp itself on its nose.
  b.push(`<path d="M ${cx - 4} 16 L ${cx - 3.9} 11.2 C ${cx - 3.7} 8.6 ${cx + 3.7} 8.6 ${cx + 3.9} 11.2 L ${cx + 4} 16 Z" fill="${C.brand}" stroke="${C.brandDeep}" stroke-width="0.5"/>`);
  b.push(`<path d="M ${cx - 1.6} 15.4 L ${cx - 1.6} 11.6 C ${cx - 1.4} 10.6 ${cx + 1.4} 10.6 ${cx + 1.6} 11.6 L ${cx + 1.6} 15.4 Z" fill="${C.brandLit}"/>`);
  b.push(`<path d="M ${cx - 2.6} 10.4 Q ${cx} 8.4 ${cx + 2.6} 10.4 Q ${cx} 9.7 ${cx - 2.6} 10.4 Z" fill="${C.yellowLit}" stroke="${C.yellowDark}" stroke-width="0.4"/>`);
  // Handlebar across, grips at the ends, small round mirrors just ahead of them.
  b.push(`<path d="M ${cx - 9.6} 16.6 L ${cx - 11.8} 13.6 M ${cx + 9.6} 16.6 L ${cx + 11.8} 13.6" stroke="${C.graphite}" stroke-width="0.8" stroke-linecap="round"/>`);
  b.push(`<circle cx="${cx - 12.2}" cy="12.8" r="1.6" fill="${C.graphite}"/><circle cx="${cx - 12.2}" cy="12.8" r="0.9" fill="${C.steel}"/>`);
  b.push(`<circle cx="${cx + 12.2}" cy="12.8" r="1.6" fill="${C.graphite}"/><circle cx="${cx + 12.2}" cy="12.8" r="0.9" fill="${C.steel}"/>`);
  b.push(`<path d="M ${cx - 12.4} 17.4 Q ${cx} 15 ${cx + 12.4} 17.4" fill="none" stroke="${C.graphite2}" stroke-width="2" stroke-linecap="round"/>`);
  b.push(`<path d="M ${cx - 13.2} 17.8 L ${cx - 10.8} 17.1 M ${cx + 13.2} 17.8 L ${cx + 10.8} 17.1" stroke="${C.graphite}" stroke-width="2.6" stroke-linecap="round"/>`);
  // Fuel tank, graphite with a yellow racing stripe.
  b.push(`<path d="M ${cx} 16.4 C ${cx + 5.2} 16.6 ${cx + 5.8} 20.6 ${cx + 4.8} 25.6 L ${cx - 4.8} 25.6 C ${cx - 5.8} 20.6 ${cx - 5.2} 16.6 ${cx} 16.4 Z" fill="url(#tank)"/>`);
  b.push(`<path d="M ${cx - 0.75} 17.2 L ${cx + 0.75} 17.2 L ${cx + 0.75} 24.6 L ${cx - 0.75} 24.6 Z" fill="${C.yellow}"/>`);

  // Rider's arms, elbows out, down to the grips (under the torso so the
  // shoulders cover the joins).
  const arm = (k) => {
    const d = `M ${cx + k * 7.6} 27 Q ${cx + k * 12.6} 23.4 ${cx + k * 11.6} 18.4`;
    return `<path d="${d}" fill="none" stroke="${C.brandDeep}" stroke-width="3.6" stroke-linecap="round"/>
      <path d="${d}" fill="none" stroke="${C.brand}" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="${cx + k * 11.7}" cy="17.8" r="1.5" fill="${C.graphite}"/>`;
  };
  b.push(arm(-1), arm(1));
  // Jacket: broad shoulders tapering to the seat, a yellow reflective yoke.
  b.push(`<path d="M ${cx - 9.4} 28.6 C ${cx - 9.8} 24.6 ${cx - 6} 23 ${cx} 23 C ${cx + 6} 23 ${cx + 9.8} 24.6 ${cx + 9.4} 28.6 C ${cx + 9} 32.6 ${cx + 6.2} 35.6 ${cx} 35.6 C ${cx - 6.2} 35.6 ${cx - 9} 32.6 ${cx - 9.4} 28.6 Z" fill="url(#jacket)" stroke="${C.brandDeep}" stroke-width="0.6"/>`);
  b.push(`<path d="M ${cx - 9.3} 30.2 C ${cx - 4} 31.8 ${cx + 4} 31.8 ${cx + 9.3} 30.2" fill="none" stroke="${C.yellow}" stroke-width="1.3"/>`);
  // Helmet: white shell, green centre stripe, dark visor across the front.
  b.push(`<circle cx="${cx}" cy="27" r="4.7" fill="url(#helmet)" stroke="#9AA5AB" stroke-width="0.5"/>`);
  b.push(`<g clip-path="url(#helmetClip)">
      <rect x="${cx - 1}" y="22" width="2" height="10" fill="${C.brand}"/>
      <path d="M ${cx - 5} 23.6 Q ${cx} 21 ${cx + 5} 23.6 L ${cx + 5} 22 L ${cx - 5} 22 Z" fill="${C.graphite}"/>
      <path d="M ${cx - 4.4} 24.6 Q ${cx} 22.4 ${cx + 4.4} 24.6 Q ${cx} 23.5 ${cx - 4.4} 24.6 Z" fill="${C.graphite}"/>
    </g>`);
  b.push(`<ellipse cx="${cx - 1.8}" cy="26" rx="1.1" ry="0.7" fill="#FFFFFF" opacity="0.9"/>`);

  // Delivery box on the rear rack: yellow, with the Lampose "o".
  b.push(`<rect x="${cx - 11}" y="35.6" width="22" height="18" rx="3.2" fill="${C.yellowDark}"/>`);
  b.push(`<rect x="${cx - 11}" y="35" width="21" height="17" rx="3" fill="url(#boxTop)"/>`);
  b.push(`<rect x="${cx - 9.8}" y="36.2" width="18.6" height="14.6" rx="2.2" fill="none" stroke="#FFFFFF" stroke-opacity="0.45" stroke-width="0.6"/>`);
  b.push(`<circle cx="${cx - 0.5}" cy="43.5" r="4.4" fill="none" stroke="${C.brand}" stroke-width="2.1"/>`);
  // Tail light peeking out behind the box.
  b.push(`<rect x="${cx - 2.6}" y="53.4" width="5.2" height="1.5" rx="0.75" fill="${C.red}"/>`);

  const clip = `<clipPath id="helmetClip"><circle cx="${cx}" cy="27" r="4.7"/></clipPath>`;
  return {
    name: "marker_rider_top",
    width: W,
    height: H,
    anchor: { x: W / 2, y: H / 2 },
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${defs.replace("</defs>", clip + "</defs>")}${s.join("")}<g filter="url(#halo)">${b.join("")}</g></svg>`,
  };
}

async function launch() {
  try {
    return await chromium.launch();
  } catch {
    return chromium.launch({ channel: "chrome" });
  }
}

async function main() {
  const restaurant = restaurantSvg();
  const home = homeSvg();
  const rider = riderSvg();
  const targets = [
    [USER_APP, [restaurant, home, rider]],
    [RIDER_APP, [restaurant, home]],
  ];

  const browser = await launch();
  const render = async (m, scale) => {
    const ctx = await browser.newContext({ viewport: { width: m.width, height: m.height }, deviceScaleFactor: scale });
    const page = await ctx.newPage();
    await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${m.svg}</body></html>`);
    const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: m.width, height: m.height } });
    await ctx.close();
    return png;
  };

  for (const m of [restaurant, home, rider]) {
    const pngs = { 1: await render(m, 1), 2: await render(m, 2), 3: await render(m, 3) };
    for (const [dir, list] of targets) {
      if (!list.includes(m)) continue;
      fs.mkdirSync(path.join(dir, "source"), { recursive: true });
      fs.writeFileSync(path.join(dir, "source", `${m.name}.svg`), m.svg + "\n");
      for (const scale of [1, 2, 3]) {
        fs.writeFileSync(path.join(dir, `${m.name}${scale === 1 ? "" : `@${scale}x`}.png`), pngs[scale]);
      }
    }
    console.log(`${m.name}: ${m.width}x${m.height} dp, anchor {x: ${m.anchor.x} / ${m.width}, y: ${m.anchor.y} / ${m.height}}`);
  }

  const previewAt = process.argv.indexOf("--preview");
  if (previewAt !== -1) {
    // All three at 4x on a map-coloured ground, then at 1x and 2x.
    const all = [restaurant, home, rider];
    const tile = (m, s) => `<div style="display:inline-block;margin:10px;vertical-align:bottom;width:${m.width * s}px;height:${m.height * s}px">${m.svg.replace(`width="${m.width}" height="${m.height}"`, `width="${m.width * s}" height="${m.height * s}"`)}</div>`;
    const html = `<!doctype html><html><body style="margin:0;padding:16px;background:#ECE9E1">
      <div style="background:linear-gradient(90deg,#fff 0 6px,transparent 6px) 0 0/60px 100%, #E9E6DE">${all.map((m) => tile(m, 4)).join("")}</div>
      <div style="margin-top:12px;background:#DDE6D5;padding:8px">${all.map((m) => tile(m, 1)).join("")}${all.map((m) => tile(m, 2)).join("")}</div>
    </body></html>`;
    const ctx = await browser.newContext({ viewport: { width: 760, height: 560 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.setContent(html);
    await page.screenshot({ path: process.argv[previewAt + 1] || "map-markers-preview.png", fullPage: true });
    await ctx.close();
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
