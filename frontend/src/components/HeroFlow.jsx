import { REDUCED } from '../hooks/useSite';

/* ══════════════════════════════════════════════════════════════════════════
   Hero right column — "the walk".

   Replaces the old floating glass cards / radar ring / emoji pin. This draws
   the actual product in one picture: a verified stay, the kitchen a short walk
   from it, and the order arriving at the door — one continuous route between
   three stops.

   Everything is inline SVG so it inherits the theme tokens and the page fonts.
   Motion is a single 9s CSS cycle; each element expresses its own timing as
   percentages of that cycle, so the whole thing stays in sync forever without
   a timer. The travelling token uses SMIL <animateMotion> along the same path
   the ribbon draws, so it follows the real curve rather than a straight lerp.
   ══════════════════════════════════════════════════════════════════════════ */

/* The one path everything is built on: stay → kitchen → door. */
const ROUTE = 'M92,84 C232,58 342,104 408,180 C452,231 372,300 268,312 C214,318 172,326 138,330';

const STOPS = [
  {
    id: 'stay', x: 92, y: 84, side: 'right',
    title: 'Verified stay', meta: 'Room 204 · ₹4,200/mo',
    glyph: (
      <>
        <path d="M-9 1.5 L0 -7 L9 1.5" fill="none" strokeWidth="2.2"
          strokeLinecap="round" strokeLinejoin="round" />
        <path d="M-6 1 V8 H6 V1" fill="none" strokeWidth="2.2"
          strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  {
    id: 'kitchen', x: 408, y: 180, side: 'left',
    title: 'Kitchen next door', meta: '400 m · 6 min walk',
    glyph: (
      <>
        <path d="M-8 -6 a8 8 0 0 0 16 0" fill="none" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M-10 -6 H10" fill="none" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M0 -6 V8" fill="none" strokeWidth="2.2" strokeLinecap="round" />
      </>
    ),
  },
  {
    id: 'door', x: 138, y: 330, side: 'right',
    title: 'At your door', meta: 'Delivered in 18 min',
    glyph: (
      <>
        <rect x="-7" y="-8" width="14" height="16" rx="2" fill="none" strokeWidth="2.2" />
        <circle cx="3.5" cy="0" r="1.4" />
      </>
    ),
  },
];

/* Chip geometry. Placed beside its stop rather than on it, so the route stays
   readable underneath. */
const CHIP_W = 176;
const CHIP_H = 52;
const chipX = s => (s.side === 'right' ? s.x + 34 : s.x - 34 - CHIP_W);

export default function HeroFlow() {
  return (
    <div className="heroflow">
      <svg
        className="heroflow__svg" viewBox="0 0 520 400"
        role="img"
        aria-label="A verified stay, a kitchen a six-minute walk away, and delivery to your door — one route through the Lampose app"
      >
        <defs>
          <pattern id="hf-dots" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1.6" cy="1.6" r="1.5" fill="var(--ink)" opacity=".06" />
          </pattern>
          <linearGradient id="hf-ribbon" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--green)" />
            <stop offset="0.6" stopColor="var(--green-m)" />
            <stop offset="1" stopColor="var(--green)" />
          </linearGradient>
        </defs>

        <rect width="520" height="400" fill="url(#hf-dots)" rx="24" />

        {/* The full route, held faintly so the drawn ribbon has somewhere to go. */}
        <path className="hf-track" d={ROUTE} />
        {/* The ribbon that draws across the cycle. */}
        <path className="hf-ribbon" d={ROUTE} id="hf-route" />

        {/* Distance bracket between stay and kitchen. */}
        <g className="hf-measure">
          <path d="M120,120 L150,150" strokeDasharray="3 5" />
          <text x="152" y="152" className="hf-measure__t">walkable</text>
        </g>

        {STOPS.map((s, i) => (
          <g key={s.id} className={`hf-stop hf-stop--${i + 1}`}>
            <circle className="hf-halo" cx={s.x} cy={s.y} r="30" />
            <circle className="hf-node" cx={s.x} cy={s.y} r="21" />
            <g className="hf-glyph" transform={`translate(${s.x} ${s.y})`}>{s.glyph}</g>

            <g className="hf-chip" transform={`translate(${chipX(s)} ${s.y - CHIP_H / 2})`}>
              <rect width={CHIP_W} height={CHIP_H} rx="15" />
              <text className="hf-chip__t" x="16" y="22">{s.title}</text>
              <text className="hf-chip__m" x="16" y="39">{s.meta}</text>
            </g>
          </g>
        ))}

        {/* The order itself, riding the real curve. Dropped entirely when the
            visitor has asked for reduced motion. */}
        {!REDUCED && (
          <g className="hf-token">
            <circle r="9" />
            <circle r="3.5" className="hf-token__core" />
            <animateMotion dur="9s" repeatCount="indefinite" keyPoints="0;0;1;1"
              keyTimes="0;0.16;0.72;1" calcMode="linear">
              <mpath href="#hf-route" />
            </animateMotion>
          </g>
        )}
      </svg>

      {/* One summary line, in real DOM so it uses the page font at full weight. */}
      <div className="heroflow__foot">
        <span className="heroflow__live"><i />One app</span>
        <span className="heroflow__sep" />
        <span>Room + meals settle on <b>one bill</b></span>
      </div>
    </div>
  );
}
