import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useStatCard, useStatDots, FINE } from '../hooks/useSite';
import { SecHead } from './Chrome';
import Icon from './Icon';
import { SERVICES, STATS } from '../data/home';

/* ══ Stats ════════════════════════════════════════════════════════════════
   Six cards, each with a ring that sweeps to its percentage and a number that
   counts up — both fired once, when the card first reaches half visibility.
   ════════════════════════════════════════════════════════════════════════ */
function StatCard({ stat, delay, index }) {
  const { card, num, ringPath } = useStatCard(stat.target, stat.pct, stat.suffix);

  /* Where the progress arc ends, so a marker can sit on it. The <svg> is
     rotated -90deg, so angle 0 in this space already points at the top —
     the same place the arc starts. */
  const angle = (stat.pct / 100) * Math.PI * 2;
  const capX = 40 + 35 * Math.cos(angle);
  const capY = 40 + 35 * Math.sin(angle);

  return (
    <div
      className="stat-card reveal" ref={card}
      style={{ transitionDelay: `${delay}ms`, '--i': String(index) }}
    >
      <div className="stat-ring-wrap">
        <svg className="sring" viewBox="0 0 80 80">
          <circle className="sr-bg" cx="40" cy="40" r="35" />
          <circle className="sr-fg" cx="40" cy="40" r="35" ref={ringPath} />
          {/* Marker on the end of the arc — the one thing that keeps moving
              once the count has finished, so the card never looks frozen. */}
          <circle className="sr-halo" cx={capX} cy={capY} r="7" />
          <circle className="sr-cap" cx={capX} cy={capY} r="3.6" />
        </svg>
        <div className="sr-lbl">{stat.ring}</div>
      </div>
      <span className="stat-num" ref={num}>0</span>
      <div className="stat-lbl">{stat.label}</div>
    </div>
  );
}

export function Stats() {
  const dots = useStatDots(8);

  return (
    <section id="stats" ref={dots}>
      <div className="sec-inner">
        <SecHead
          tag="By the numbers" title="Growing," em="city by city."
          sub="Where Lampose is today — counted, not estimated."
          mb="1rem"
        />
        <div className="stats-grid">
          {STATS.map((s, i) => <StatCard key={s.label} stat={s} delay={i * 80} index={i} />)}
        </div>
      </div>
    </section>
  );
}

export function Explore() {
  const [spread, setSpread] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const io = new IntersectionObserver(([entry]) => {
      // Unfold when scrolling into view, fold when scrolling away
      setSpread(entry.isIntersecting);
    }, {
      threshold: 0.4
    });

    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section id="explore" style={{ padding: '2rem 0', '--pcard-w': '290px', '--pcard-h': '360px', '--pcard-gap': '20px' }}>
      <div className="sec-inner">
        <SecHead
          tag="Explore Lampose" title="Everything, one" em="click away."
          sub="Whether you want a room, a meal, or to know if we're in your city yet."
          mb="1rem"
        />
        
        <div 
          ref={containerRef}
          className={`partner-deck-container ${spread ? 'is-spread' : ''}`}
          style={{ marginTop: '1rem' }}
        >
          <div className="partner-deck">
            {SERVICES.map((s, i) => (
              <Link 
                to={s.to} 
                className={`svc-card deck-card card-${i}`} 
                key={s.title} 
                style={{ 
                  '--i': String(i), 
                  '--card-clr': s.color,
                  textDecoration: 'none', 
                  color: 'inherit', 
                  display: 'block' 
                }}
              >
                <div
                  className="svc-icon-wrap"
                  style={{ '--icon-bg': s.iconBg, '--icon-hover': s.iconHover }}
                >
                  <Icon name={s.icon} />
                </div>
                <h3 className="svc-h3">{s.title}</h3>
                <p className="svc-p">{s.body}</p>
                <div className="svc-tag">{s.cta} <span className="svc-arrow">→</span></div>
                <span className="svc-num">{s.no}</span>
              </Link>
            ))}
          </div>
        </div>
        
        <div className="deck-hint">
          <span className="hint-dot" />
          {spread ? 'Tap or hover to stack cards' : 'Tap or hover the cards to spread them out'}
        </div>
      </div>
    </section>
  );
}
