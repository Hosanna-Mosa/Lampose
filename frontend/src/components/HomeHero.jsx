import { Link } from 'react-router-dom';
import {
  useBandReveal, useHeroMesh, useMagnetic, useParticles, useTickerLean, useToastRotator,
} from '../hooks/useSite';
import SiteBanner from './Banners';
import HeroFlow from './HeroFlow';
import {
  HERO_BADGE, HERO_LINES, HERO_SUB, TICKER_FWD, TICKER_REV, TOASTS,
} from '../data/home';

/* ══ Banner carousel ══════════════════════════════════════════════════════
   Wider than the content column and drawn in SVG — see components/Banners.jsx.
   ════════════════════════════════════════════════════════════════════════ */
/* Same card as the banner on /services — same .sec-inner column, width, ratio,
   border and shadow.
   Deliberately NOT wrapped in .reveal: this is the first thing on the page, so
   a scroll-triggered reveal buys nothing and makes the site's most prominent
   element depend on an observer firing. It animates in from CSS instead, which
   cannot fail. */
export const Banner = () => (
  <div className="banner-bleed">
    <div className="sec-inner">
      <SiteBanner set="home" />
    </div>
  </div>
);

/* ══ Hero ═════════════════════════════════════════════════════════════════
   Forest ground with a moving grid, drifting particles and a mesh gradient
   that follows the pointer. The headline rises line by line out of overflow
   masks; the stat cards float in on their own offsets.
   ════════════════════════════════════════════════════════════════════════ */
export default function Hero() {
  const { hero, mesh } = useHeroMesh();
  const particles = useParticles(32);
  const primary = useMagnetic();
  const { msg, show } = useToastRotator(TOASTS);

  return (
    <section id="hero" ref={hero}>
      <div className="hero-mesh" ref={mesh} />
      <div className="hero-grid" />
      <div className="ptf" ref={particles} />

      <div className="hero-inner">
        <div>
          <div className="hero-badge">
            <span className="bdot" />
            {HERO_BADGE}
          </div>

          <h1 className="hero-h1">
            {HERO_LINES.map((line, i) => (
              <span className="ln" key={line}>
                <span className="lni">
                  {i === HERO_LINES.length - 1 ? <em>{line}</em> : line}
                </span>
              </span>
            ))}
          </h1>

          <p className="hero-sub">{HERO_SUB}</p>

          <div className="hero-btns">
            <Link to="/download" className="btn-hero-p" ref={primary}>
              <span>Get the app →</span>
            </Link>
            <Link to="/partners" className="btn-hero-s">List your property</Link>
          </div>
        </div>

        <HeroFlow />
      </div>

      <div id="hero-toast" className={show ? 'show' : ''}>
        <div className="tdot" />
        <div className="ttxt">
          <strong>{msg}</strong>
          <span>Just now · Live Activity</span>
        </div>
      </div>

    </section>
  );
}

/* ══ Trust ticker ═════════════════════════════════════════════════════════
   Two rows running opposite ways. Each list is duplicated so the CSS
   translate wraps at exactly -50% with no visible seam.
   ════════════════════════════════════════════════════════════════════════ */
/* --i is the item's position in the row. Every per-tag effect — entrance
   stagger, bob phase, dot-pulse phase — derives its delay from it, so one
   number keeps the whole wave coherent. */
const Row = ({ items, dir }) => (
  <div className="mq-row">
    <div className={`mq-track ${dir}`}>
      {[...items, ...items].map((t, i) => (
        <span className="ti" key={`${t}-${i}`} style={{ '--i': i }}>
          <span className="td" />
          <span className="ti__t">{t}</span>
        </span>
      ))}
    </div>
  </div>
);

/* The two rows say different things, so they are placed either side of the
   numbers rather than stacked together: the promises lead into the figures,
   and the cities and operational facts follow them. Each band is its own
   element with its own scroll-lean, which is why this is a class not an id. */
const ROWS = {
  claims: { items: TICKER_FWD, dir: 'fwd' },
  places: { items: TICKER_REV, dir: 'rev' },
};

export const Trust = ({ row = 'claims' }) => {
  const lean = useTickerLean();
  const { items, dir } = ROWS[row] || ROWS.claims;

  // The band manages its own entrance rather than joining the shared .reveal
  // pool — it has to guarantee its tags become visible.
  useBandReveal(lean);

  return (
    <div
      className={`trustband trustband--${row}`}
      ref={lean} aria-hidden="true"
    >
      <Row items={items} dir={dir} />
    </div>
  );
};
