/* ══════════════════════════════════════════════════════════════════════════
   Banner artwork — drawn inline rather than loaded.

   Inline SVG (not <img src="…svg">) because an <img> is an isolated document:
   it cannot see the page's webfonts or CSS custom properties. Drawn here, the
   banners use the real Plus Jakarta Sans and follow the theme tokens, so they
   restyle with the rest of the site instead of being baked pictures.
   ══════════════════════════════════════════════════════════════════════════ */

const VB = { w: 1560, h: 300 };

/* ── Art primitives ─────────────────────────────────────────────────────── */

const Phone = () => (
  <g transform="translate(1120 32)">
    <rect x="70" y="0" width="150" height="236" rx="26" fill="var(--ink)" />
    <rect x="78" y="8" width="134" height="220" rx="20" fill="#fff" />
    <rect x="126" y="16" width="38" height="7" rx="3.5" fill="var(--ink)" opacity=".8" />
    {[
      { y: 34, c: 'var(--green-t)', d: 'var(--green)' },
      { y: 92, c: 'var(--amber-t)', d: 'var(--amber-d, #b8860b)' },
      { y: 150, c: '#eef0f3', d: 'var(--ink)' },
    ].map((r, i) => (
      <g key={i} transform={`translate(90 ${r.y + 8})`}>
        <rect width="110" height="48" rx="12" fill={r.c} />
        <circle cx="26" cy="24" r="12" fill={r.d} opacity=".9" />
        <rect x="48" y="15" width="48" height="7" rx="3.5" fill="var(--ink)" opacity=".7" />
        <rect x="48" y="28" width="30" height="5" rx="2.5" fill="var(--ink)" opacity=".35" />
      </g>
    ))}
    <rect x="122" y="214" width="46" height="5" rx="2.5" fill="var(--ink)" opacity=".3" />
  </g>
);

const Towers = () => (
  <g transform="translate(1090 40)">
    <rect x="0" y="96" width="86" height="128" rx="8" fill="var(--green)" opacity=".9" />
    <rect x="98" y="40" width="96" height="184" rx="8" fill="var(--ink)" />
    <rect x="206" y="120" width="78" height="104" rx="8" fill="var(--green-m, #22a355)" opacity=".85" />
    {[0, 1, 2, 3].map(r =>
      [0, 1, 2].map(c => (
        <rect
          key={`${r}-${c}`} x={112 + c * 26} y={58 + r * 32}
          width="14" height="16" rx="3" fill="var(--amber)" opacity={r === 1 && c === 1 ? '.95' : '.5'}
        />
      ))
    )}
    <g transform="translate(232 46)">
      <circle cx="26" cy="26" r="26" fill="var(--amber)" />
      <path d="M17 27l6 6 12-13" fill="none" stroke="var(--ink)" strokeWidth="4"
        strokeLinecap="round" strokeLinejoin="round" />
    </g>
    <rect x="-20" y="224" width="330" height="10" rx="5" fill="var(--ink)" opacity=".12" />
  </g>
);

const Scooter = () => (
  <g transform="translate(1080 56)">
    <path d="M6 168 C70 118 150 196 230 132 C270 100 300 104 330 118" fill="none"
      stroke="var(--green)" strokeWidth="4" strokeDasharray="12 12" strokeLinecap="round" opacity=".55" />
    <g transform="translate(20 108)">
      <circle cx="30" cy="72" r="26" fill="none" stroke="var(--ink)" strokeWidth="9" />
      <circle cx="148" cy="72" r="26" fill="none" stroke="var(--ink)" strokeWidth="9" />
      <path d="M30 72h34l30-44h34" fill="none" stroke="var(--ink)" strokeWidth="9"
        strokeLinecap="round" strokeLinejoin="round" />
      <path d="M64 72h84l-14-34" fill="none" stroke="var(--ink)" strokeWidth="9"
        strokeLinecap="round" strokeLinejoin="round" />
      <rect x="96" y="-4" width="56" height="46" rx="10" fill="var(--green)" />
      <rect x="112" y="14" width="24" height="6" rx="3" fill="#fff" opacity=".9" />
    </g>
    <g transform="translate(268 20)">
      <path d="M26 0C11.6 0 0 11.6 0 26c0 18 26 44 26 44s26-26 26-44C52 11.6 40.4 0 26 0z" fill="var(--amber)" />
      <circle cx="26" cy="25" r="10" fill="var(--ink)" />
    </g>
  </g>
);

const Cards = () => (
  <g transform="translate(1096 44)">
    <rect x="18" y="26" width="300" height="80" rx="18" fill="#fff" stroke="var(--border)" opacity=".7" />
    <g transform="translate(0 62)">
      <rect width="300" height="96" rx="18" fill="#fff" stroke="var(--border)" />
      <circle cx="48" cy="48" r="24" fill="var(--green-t)" />
      <path d="M38 48l7 8 15-17" fill="none" stroke="var(--green)" strokeWidth="5"
        strokeLinecap="round" strokeLinejoin="round" />
      <rect x="86" y="32" width="150" height="11" rx="5.5" fill="var(--ink)" opacity=".78" />
      <rect x="86" y="53" width="96" height="9" rx="4.5" fill="var(--ink)" opacity=".32" />
    </g>
    <g transform="translate(150 170)">
      <rect width="168" height="56" rx="16" fill="var(--ink)" />
      <rect x="26" y="24" width="80" height="9" rx="4.5" fill="#fff" opacity=".92" />
      <circle cx="132" cy="28" r="12" fill="var(--amber)" />
    </g>
  </g>
);

const ThreeApps = () => (
  <g transform="translate(1064 46)">
    {[
      { x: 0, y: 26, h: 168, fill: 'var(--green)' },
      { x: 116, y: 0, h: 208, fill: 'var(--ink)' },
      { x: 232, y: 26, h: 168, fill: 'var(--amber-d, #b8860b)' },
    ].map((p, i) => (
      <g key={i} transform={`translate(${p.x} ${p.y})`}>
        <rect width="104" height={p.h} rx="20" fill={p.fill} />
        <rect x="7" y="7" width="90" height={p.h - 14} rx="15" fill="#fff" />
        {[0, 1, 2].map(r => (
          <g key={r} transform={`translate(17 ${24 + r * 34})`}>
            <rect width="70" height="24" rx="7" fill="#eef0f3" />
            <circle cx="13" cy="12" r="6" fill={p.fill} opacity=".85" />
            <rect x="26" y="8" width="34" height="6" rx="3" fill="var(--ink)" opacity=".3" />
          </g>
        ))}
      </g>
    ))}
  </g>
);

const MapPins = () => (
  <g transform="translate(1090 40)">
    <circle cx="160" cy="112" r="104" fill="none" stroke="var(--green)" strokeWidth="2" opacity=".25" />
    <circle cx="160" cy="112" r="70" fill="none" stroke="var(--green)" strokeWidth="2" opacity=".35" />
    <circle cx="160" cy="112" r="36" fill="var(--green-t)" />
    <path d="M40 190 C90 150 130 176 176 128 C214 88 250 96 286 70" fill="none"
      stroke="var(--ink)" strokeWidth="3" strokeDasharray="9 10" opacity=".4" />
    {[
      { x: 132, y: 62, fill: 'var(--ink)' },
      { x: 246, y: 30, fill: 'var(--green)' },
      { x: 34, y: 148, fill: 'var(--amber)' },
    ].map((p, i) => (
      <g key={i} transform={`translate(${p.x} ${p.y})`}>
        <path d="M22 0C9.8 0 0 9.8 0 22c0 15 22 38 22 38s22-23 22-38C44 9.8 34.2 0 22 0z" fill={p.fill} />
        <circle cx="22" cy="21" r="8.5" fill="#fff" />
      </g>
    ))}
  </g>
);

const ART = {
  phone: Phone, towers: Towers, scooter: Scooter,
  cards: Cards, apps: ThreeApps, map: MapPins,
};

/* ── Slide ──────────────────────────────────────────────────────────────── */
function Slide({ eyebrow, lines, accentFrom = 1, points, art, tint = 'green' }) {
  const Art = ART[art] || Phone;
  const wash = {
    green: ['#ffffff', 'var(--green-t)'],
    amber: ['#ffffff', 'var(--amber-t)'],
    grey: ['#ffffff', '#eef0f3'],
  }[tint];

  const gid = `bw-${art}-${tint}`;

  return (
    <svg
      className="sec-banner-slide" viewBox={`0 0 ${VB.w} ${VB.h}`}
      preserveAspectRatio="xMinYMid slice" role="img"
      aria-label={lines.join(' ')}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={wash[0]} />
          <stop offset="1" stopColor={wash[1]} />
        </linearGradient>
        <pattern id={`${gid}-dots`} width="26" height="26" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.6" fill="var(--ink)" opacity=".07" />
        </pattern>
      </defs>

      <rect width={VB.w} height={VB.h} fill={`url(#${gid})`} />
      <rect width={VB.w} height={VB.h} fill={`url(#${gid}-dots)`} />

      {/* eyebrow pill */}
      <g transform="translate(70 44)">
        <rect width={eyebrow.length * 8.6 + 44} height="34" rx="17" fill="#fff" stroke="var(--border)" />
        <circle cx="22" cy="17" r="5" fill="var(--green)" />
        <text
          x="36" y="22" fill="var(--ink-light)"
          style={{ font: '600 12px var(--font-body)', letterSpacing: '.12em' }}
        >
          {eyebrow.toUpperCase()}
        </text>
      </g>

      {/* headline */}
      {lines.map((line, i) => (
        <text
          key={line} x="70" y={132 + i * 56}
          fill={i >= accentFrom ? 'var(--green)' : 'var(--ink)'}
          style={{ font: '800 46px var(--font-head)', letterSpacing: '-.03em' }}
        >
          {line}
        </text>
      ))}

      {/* feature points */}
      <g transform="translate(70 224)">
        {points.map((p, i) => (
          <g key={p} transform={`translate(${i * 224} 0)`}>
            <circle cx="14" cy="14" r="14" fill="#fff" stroke="var(--border)" />
            <circle cx="14" cy="14" r="5" fill="var(--green)" />
            <text
              x="38" y="19" fill="var(--ink-mid)"
              style={{ font: '600 15px var(--font-body)' }}
            >
              {p}
            </text>
          </g>
        ))}
      </g>

      <Art />
    </svg>
  );
}

/* ── Slide sets, one per page ───────────────────────────────────────────── */
export const BANNER_SETS = {
  home: [
    {
      eyebrow: 'One app, every city', art: 'phone', tint: 'green',
      lines: ['Stay. Eat. Deliver.', 'All in one place.'],
      points: ['Verified stays', 'Local kitchens', 'Live tracking'],
    },
    {
      eyebrow: 'Zero brokerage', art: 'towers', tint: 'grey',
      lines: ['Verified rooms,', 'ready to move in.'],
      points: ['Manually checked', 'Real photos', 'No middlemen'],
    },
    {
      eyebrow: 'Fast by design', art: 'scooter', tint: 'amber',
      lines: ['Hot food, brought', 'to your door.'],
      points: ['20-minute average', 'Smart routing', 'Verified riders'],
    },
  ],
  services: [
    {
      eyebrow: 'Stay booking', art: 'towers', tint: 'green',
      lines: ['A room someone', 'actually checked.'],
      points: ['Walked in person', 'Zero brokerage', 'QR check-in'],
    },
    {
      eyebrow: 'Food ordering', art: 'phone', tint: 'amber',
      lines: ['Mess, home kitchens', 'and restaurants.'],
      points: ['Monthly plans', 'Single meals', 'Dine-in offers'],
    },
    {
      eyebrow: 'Delivery', art: 'scooter', tint: 'grey',
      lines: ['Every order,', 'tracked live.'],
      points: ['GPS tracking', 'Scan at the door', 'Vetted riders'],
    },
  ],
  partners: [
    {
      eyebrow: 'For property owners', art: 'towers', tint: 'green',
      lines: ['List your property', 'in minutes.'],
      points: ['Zero listing fee', 'Verified tenants', '24-hour payouts'],
    },
    {
      eyebrow: 'For kitchens', art: 'cards', tint: 'amber',
      lines: ['Reach thousands', 'of nearby residents.'],
      points: ['Order dashboard', 'Meal plans', 'Daily settlements'],
    },
    {
      eyebrow: 'For riders', art: 'scooter', tint: 'grey',
      lines: ['Earn daily,', 'on your own hours.'],
      points: ['No waiting', 'Weekly bonuses', 'Smart routes'],
    },
  ],
  download: [
    {
      eyebrow: 'Download the app', art: 'apps', tint: 'green',
      lines: ['Three apps.', 'One ecosystem.'],
      points: ['User', 'Partner', 'Delivery'],
    },
    {
      eyebrow: 'Available now', art: 'phone', tint: 'grey',
      lines: ['Android and iOS,', 'free to download.'],
      points: ['Android 8.0+', 'iOS 14+', 'Direct APK'],
    },
    {
      eyebrow: 'Built for your city', art: 'map', tint: 'amber',
      lines: ['Live in Vizag,', 'growing fast.'],
      points: ['Andhra Pradesh', 'South India', 'More soon'],
    },
  ],
};

/* ── Carousel ───────────────────────────────────────────────────────────── */
export default function Banner({ set = 'home' }) {
  const slides = BANNER_SETS[set] || BANNER_SETS.home;
  return (
    <div className="sec-banner">
      <div className="sec-banner-track">
        {slides.map(s => <Slide key={s.lines[0]} {...s} />)}
      </div>
    </div>
  );
}
