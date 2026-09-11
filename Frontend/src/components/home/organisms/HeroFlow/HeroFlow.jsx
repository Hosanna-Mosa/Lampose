import { REDUCED } from '../../../../hooks/useSite';
import { ROUTE, STOPS, CHIP_W, CHIP_H } from '../../utils/heroFlow';
import { Bold, Box, Inline, Italic } from '../../../common/atoms';

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


/* Chip geometry. Placed beside its stop rather than on it, so the route stays
   readable underneath. */
const chipX = s => (s.side === 'right' ? s.x + 34 : s.x - 34 - CHIP_W);

export function HeroFlow() {
  return (
    <Box className="heroflow">
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
      <Box className="heroflow__foot">
        <Inline className="heroflow__live"><Italic />One app</Inline>
        <Inline className="heroflow__sep" />
        <Inline>Room + meals settle on <Bold>one bill</Bold></Inline>
      </Box>
    </Box>
  );
}
