/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   Generates the site's raster-replacement artwork as SVG.

   Nothing here is traced, sampled or downloaded â€” every shape is composed from
   the brand palette below. Output is deterministic: each city seeds its own
   PRNG from its name, so re-running produces byte-identical files.

     node scripts/generate-art.mjs
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.join(process.cwd(), 'public', 'images');

const C = {
  ink: '#101312',
  ink2: '#2b3138',
  ink3: '#454d55',
  grey: '#f1f2f4',
  greyD: '#d7dce2',
  white: '#ffffff',
  green: '#17803d',
  greenM: '#22a355',
  greenD: '#0f5c2b',
  greenT: '#e9f5ed',
  amber: '#ffc93c',
  amberD: '#b8860b',
  amberT: '#fff8e6',
};

/* Deterministic PRNG so the art never changes between runs. */
const seedOf = str => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};
const rngFrom = seed => {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/* Four schemes, cycled across the city set so the grid reads as a family
   without nine identical pictures. */
const SCHEMES = [
  { sky: [C.greenT, '#cfe8d9'], far: '#9ec7ae', mid: C.green, near: C.greenD, sun: C.amber, accent: C.amber },
  { sky: ['#eef0f3', C.greyD], far: '#aab3bd', mid: C.ink2, near: C.ink, sun: C.amber, accent: C.greenM },
  { sky: [C.amberT, '#ffe6ae'], far: '#d9b877', mid: C.amberD, near: C.ink, sun: C.white, accent: C.green },
  { sky: ['#e6f2ec', '#bfdccd'], far: '#8fb9a1', mid: C.greenD, near: C.ink, sun: C.amber, accent: C.greenM },
];

const W = 800;
const H = 420;

/** One skyline layer: a run of towers with a flat baseline. */
function towers(rnd, { y, minH, maxH, fill, widthRange, windows, opacity = 1 }) {
  let x = -20;
  const parts = [];
  while (x < W + 20) {
    const w = widthRange[0] + rnd() * (widthRange[1] - widthRange[0]);
    const h = minH + rnd() * (maxH - minH);
    const top = y - h;
    const roof = rnd();

    parts.push(`<rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${w.toFixed(1)}" height="${(h + 40).toFixed(1)}" rx="3"/>`);

    // An occasional mast or stepped crown breaks up the silhouette.
    if (roof > 0.82) {
      parts.push(`<rect x="${(x + w / 2 - 2).toFixed(1)}" y="${(top - 18).toFixed(1)}" width="4" height="20"/>`);
    } else if (roof > 0.66) {
      parts.push(`<rect x="${(x + w * 0.2).toFixed(1)}" y="${(top - 12).toFixed(1)}" width="${(w * 0.6).toFixed(1)}" height="14" rx="2"/>`);
    }

    if (windows) {
      const cols = Math.max(1, Math.floor(w / 16));
      const rows = Math.max(1, Math.floor(h / 22));
      for (let cI = 0; cI < cols; cI++) {
        for (let r = 0; r < rows; r++) {
          if (rnd() < 0.42) continue;
          const wx = x + 6 + cI * 16;
          const wy = top + 12 + r * 22;
          if (wx + 6 > x + w - 3) continue;
          parts.push(`<rect class="win" x="${wx.toFixed(1)}" y="${wy.toFixed(1)}" width="6" height="9" rx="1.5"/>`);
        }
      }
    }
    x += w + 4 + rnd() * 10;
  }
  return `<g fill="${fill}" opacity="${opacity}">${parts.join('')}</g>`;
}

function cityArt(name) {
  const rnd = rngFrom(seedOf(name));
  const s = SCHEMES[seedOf(name) % SCHEMES.length];
  const sunX = 120 + rnd() * 560;
  const sunY = 70 + rnd() * 60;
  const hasWater = rnd() > 0.45;

  const stars = Array.from({ length: 22 }, () => {
    const x = rnd() * W;
    const y = 10 + rnd() * 150;
    const r = 1 + rnd() * 1.6;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}"/>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${name} skyline illustration">
  <title>${name}</title>
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${s.sky[0]}"/><stop offset="1" stop-color="${s.sky[1]}"/>
    </linearGradient>
    <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${s.near}" stop-opacity=".55"/>
      <stop offset="1" stop-color="${s.near}" stop-opacity=".85"/>
    </linearGradient>
    <clipPath id="frame"><rect width="${W}" height="${H}"/></clipPath>
  </defs>
  <g clip-path="url(#frame)">
    <rect width="${W}" height="${H}" fill="url(#sky)"/>
    <g fill="${s.accent}" opacity=".22">${stars}</g>
    <circle cx="${sunX.toFixed(1)}" cy="${sunY.toFixed(1)}" r="34" fill="${s.sun}" opacity=".9"/>
    <circle cx="${sunX.toFixed(1)}" cy="${sunY.toFixed(1)}" r="58" fill="${s.sun}" opacity=".18"/>
    ${towers(rnd, { y: 300, minH: 40, maxH: 120, fill: s.far, widthRange: [26, 60], windows: false, opacity: 0.7 })}
    ${towers(rnd, { y: 340, minH: 70, maxH: 190, fill: s.mid, widthRange: [34, 74], windows: true })}
    ${towers(rnd, { y: 392, minH: 50, maxH: 130, fill: s.near, widthRange: [44, 92], windows: true })}
    ${hasWater
      ? `<rect y="392" width="${W}" height="${H - 392}" fill="url(#water)"/>
         <g fill="${s.sun}" opacity=".35">
           <rect x="${(sunX - 30).toFixed(1)}" y="400" width="60" height="3" rx="1.5"/>
           <rect x="${(sunX - 20).toFixed(1)}" y="409" width="40" height="3" rx="1.5"/>
         </g>`
      : `<rect y="392" width="${W}" height="${H - 392}" fill="${s.near}"/>`}
    <style>.win{fill:${s.sun};opacity:.75}</style>
  </g>
</svg>`;
}

/* â”€â”€ QR / check-in illustration for the How It Works page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function qrArt() {
  const rnd = rngFrom(seedOf('lampose-qr'));
  // A QR-like block field â€” decorative, not a scannable code.
  const cells = [];
  for (let y = 0; y < 9; y++) {
    for (let x = 0; x < 9; x++) {
      const corner = (x < 3 && y < 3) || (x > 5 && y < 3) || (x < 3 && y > 5);
      if (corner) continue;
      if (rnd() < 0.45) continue;
      cells.push(`<rect x="${x * 16}" y="${y * 16}" width="12" height="12" rx="2"/>`);
    }
  }
  const eye = (x, y) => `
    <rect x="${x}" y="${y}" width="44" height="44" rx="10" fill="none" stroke="${C.ink}" stroke-width="7"/>
    <rect x="${x + 15}" y="${y + 15}" width="14" height="14" rx="4" fill="${C.ink}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 480" width="720" height="480" role="img" aria-label="QR check-in illustration">
  <title>QR check-in</title>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${C.greenT}"/><stop offset="1" stop-color="#d8ecdf"/>
    </linearGradient>
  </defs>
  <rect width="720" height="480" fill="url(#bg)"/>
  <g opacity=".5" fill="${C.green}">
    ${Array.from({ length: 40 }, (_, i) => {
      const x = 20 + (i % 10) * 72;
      const y = 24 + Math.floor(i / 10) * 116;
      return `<circle cx="${x}" cy="${y}" r="2.5"/>`;
    }).join('')}
  </g>

  <!-- phone -->
  <rect x="238" y="60" width="244" height="376" rx="34" fill="${C.ink}"/>
  <rect x="250" y="72" width="220" height="352" rx="26" fill="${C.white}"/>
  <rect x="326" y="84" width="68" height="12" rx="6" fill="${C.ink}" opacity=".85"/>

  <!-- QR card on screen -->
  <rect x="272" y="118" width="176" height="176" rx="18" fill="${C.white}" stroke="${C.greyD}"/>
  <g transform="translate(292 138)" fill="${C.ink}">
    ${eye(0, 0)} ${eye(96, 0)} ${eye(0, 96)}
    <g transform="translate(0 0)">${cells.join('')}</g>
  </g>

  <!-- verified row -->
  <g transform="translate(272 312)">
    <rect width="176" height="34" rx="12" fill="${C.greenT}"/>
    <circle cx="24" cy="17" r="9" fill="${C.green}"/>
    <path d="M20 17.5l3 3 5.5-6" fill="none" stroke="${C.white}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="44" y="11" width="86" height="6" rx="3" fill="${C.green}" opacity=".55"/>
    <rect x="44" y="21" width="56" height="5" rx="2.5" fill="${C.green}" opacity=".3"/>
  </g>
  <rect x="272" y="358" width="176" height="42" rx="14" fill="${C.ink}"/>
  <rect x="304" y="374" width="112" height="9" rx="4.5" fill="${C.white}" opacity=".9"/>

  <!-- floating coupon -->
  <g transform="translate(66 150)">
    <rect width="188" height="92" rx="18" fill="${C.white}" stroke="${C.greyD}"/>
    <circle cx="0" cy="46" r="10" fill="url(#bg)"/>
    <circle cx="188" cy="46" r="10" fill="url(#bg)"/>
    <rect x="24" y="24" width="60" height="14" rx="7" fill="${C.amber}"/>
    <rect x="24" y="50" width="120" height="9" rx="4.5" fill="${C.ink}" opacity=".75"/>
    <rect x="24" y="66" width="80" height="7" rx="3.5" fill="${C.ink}" opacity=".35"/>
  </g>

  <!-- floating rider chip -->
  <g transform="translate(474 268)">
    <rect width="180" height="80" rx="18" fill="${C.white}" stroke="${C.greyD}"/>
    <circle cx="38" cy="40" r="20" fill="${C.greenT}"/>
    <circle cx="31" cy="45" r="6" fill="none" stroke="${C.green}" stroke-width="3"/>
    <circle cx="47" cy="45" r="6" fill="none" stroke="${C.green}" stroke-width="3"/>
    <path d="M31 45h8l4-10h6" fill="none" stroke="${C.green}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="70" y="28" width="86" height="9" rx="4.5" fill="${C.ink}" opacity=".75"/>
    <rect x="70" y="45" width="58" height="7" rx="3.5" fill="${C.ink}" opacity=".35"/>
  </g>
</svg>`;
}

/* â”€â”€ Write â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const CITIES = [
  'Visakhapatnam', 'Hyderabad', 'Vijayawada', 'Amaravati', 'Guntur',
  'Tirupati', 'Kakinada', 'Nellore', 'Kurnool',
];

fs.mkdirSync(OUT, { recursive: true });

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
let n = 0;
for (const city of CITIES) {
  const file = path.join(OUT, `city-${slug(city)}.svg`);
  fs.writeFileSync(file, cityArt(city));
  n++;
}
fs.writeFileSync(path.join(OUT, 'qr-checkin.svg'), qrArt());
n++;

console.log(`Generated ${n} SVG files into public/images`);
