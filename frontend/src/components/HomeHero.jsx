import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useBandReveal, useTickerLean } from '../hooks/useSite';
import logoImg from '../assets/logo.png';
import { TICKER_FWD, TICKER_REV } from '../data/home';

/* ══ Categories for Phone Mockup ══════════════════════════════════════════ */
const PHONE_CATEGORIES = [
  { name: 'PGs', icon: '🏠', count: '120+' },
  { name: 'Hostels', icon: '🏢', count: '85+' },
  { name: 'Bachelor Rooms', icon: '🛋', count: '64+' },
  { name: 'Dormitories', icon: '🛏', count: '42+' },
];

/* ══ Hero Component ═══════════════════════════════════════════════════════ */
export default function Hero() {
  const [activeCategory, setActiveCategory] = useState('PGs');
  const [cityInput, setCityInput] = useState('Rajahmundry');

  // Auto-cycle categories gently inside the phone mockup if user is not interacting
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveCategory(prev => {
        const idx = PHONE_CATEGORIES.findIndex(c => c.name === prev);
        return PHONE_CATEGORIES[(idx + 1) % PHONE_CATEGORIES.length].name;
      });
    }, 2800);
    return () => clearInterval(timer);
  }, []);

  return (
    <section id="hero-new" className="hero-light-section">
      {/* Soft Background Art & Depth */}
      <div className="hero-bg-shapes" aria-hidden="true">
        <div className="bg-shape-gradient" />
        <div className="bg-ambient-orb orb-1" />
        <div className="bg-ambient-orb orb-2" />
      </div>

      <div className="hero-light-container">
        {/* ── Left Column: Copy & Actions ────────────────────────────── */}
        <div className="hero-col-left">
          {/* Equation Badge */}
          <div className="hero-equation-badge">
            <span className="eq-chip">
              <span className="eq-icon">🏠</span> Your Stay
            </span>
            <span className="eq-symbol">×</span>
            <span className="eq-chip">
              <span className="eq-icon">🧑‍🍳</span> Great Food
            </span>
            <span className="eq-symbol">=</span>
            <span className="eq-chip eq-chip--green">
              <span className="eq-icon">🌱</span> A Better Tomorrow
            </span>
          </div>

          {/* Headline */}
          <h1 className="hero-main-title">
            <span className="title-row">Verified stays.</span>
            <span className="title-row">Local kitchens.</span>
            <span className="title-row title-accent">One app for both.</span>
          </h1>

          {/* Subtitle */}
          <p className="hero-lead-desc">
            Find verified PGs, hostels, bachelor rooms and dormitories near you — with great food just a short walk away.
          </p>

          {/* Action CTAs */}
          <div className="hero-cta-group">
            <Link to="/services" className="btn-hero-explore">
              <svg className="btn-search-svg" viewBox="0 0 20 20" fill="none" stroke="currentColor">
                <circle cx="8.5" cy="8.5" r="5.5" strokeWidth="2" />
                <path d="M13 13L17.5 17.5" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span>Explore Stays</span>
              <span className="btn-arrow">→</span>
            </Link>
          </div>

          {/* Trust Highlights Checklist */}
          <div className="hero-trust-bar">
            <div className="trust-pill">
              <span className="t-icon t-check">✔</span>
              <span>Verified Listings</span>
            </div>
            <div className="trust-pill">
              <span className="t-icon">🔒</span>
              <span>Safe &amp; Secure</span>
            </div>
            <div className="trust-pill">
              <span className="t-icon">🍲</span>
              <span>Local Food</span>
            </div>
            <div className="trust-pill">
              <span className="t-icon">🎧</span>
              <span>24/7 Support</span>
            </div>
          </div>
        </div>

        {/* ── Center & Right Combined Visual Lockup (Exact to design) ── */}
        <div className="hero-exact-stage">
          {/* Mint Skyline & Trees Vector Background Illustration */}
          <div className="stage-city-backdrop" aria-hidden="true">
            <svg viewBox="0 0 540 420" fill="none" className="city-svg-art">
              {/* Soft Radial Ambient Glow */}
              <ellipse cx="260" cy="210" rx="220" ry="160" fill="rgba(167, 243, 208, 0.35)" filter="blur(35px)" />
              
              {/* Distant Skyline Buildings */}
              <rect x="180" y="160" width="48" height="200" rx="3" fill="rgba(34, 120, 68, 0.08)" />
              <rect x="190" y="180" width="8" height="14" rx="1" fill="rgba(34, 120, 68, 0.12)" />
              <rect x="206" y="180" width="8" height="14" rx="1" fill="rgba(34, 120, 68, 0.12)" />
              <rect x="190" y="210" width="8" height="14" rx="1" fill="rgba(34, 120, 68, 0.12)" />
              <rect x="206" y="210" width="8" height="14" rx="1" fill="rgba(34, 120, 68, 0.12)" />

              <rect x="240" y="120" width="60" height="240" rx="4" fill="rgba(34, 120, 68, 0.11)" />
              <rect x="252" y="145" width="10" height="16" rx="1" fill="rgba(34, 120, 68, 0.15)" />
              <rect x="274" y="145" width="10" height="16" rx="1" fill="rgba(34, 120, 68, 0.15)" />
              <rect x="252" y="180" width="10" height="16" rx="1" fill="rgba(34, 120, 68, 0.15)" />
              <rect x="274" y="180" width="10" height="16" rx="1" fill="rgba(34, 120, 68, 0.15)" />
              <rect x="252" y="215" width="10" height="16" rx="1" fill="rgba(34, 120, 68, 0.15)" />
              <rect x="274" y="215" width="10" height="16" rx="1" fill="rgba(34, 120, 68, 0.15)" />

              <rect x="312" y="170" width="44" height="190" rx="3" fill="rgba(34, 120, 68, 0.08)" />

              {/* Houses & Pitched Roof */}
              <polygon points="135,260 155,230 175,260" fill="rgba(34, 120, 68, 0.14)" />
              <rect x="140" y="260" width="30" height="70" fill="rgba(34, 120, 68, 0.1)" />

              {/* Trees */}
              <circle cx="120" cy="300" r="34" fill="rgba(52, 168, 83, 0.22)" />
              <rect x="117" y="300" width="6" height="45" fill="rgba(34, 120, 68, 0.3)" />

              <circle cx="180" cy="315" r="26" fill="rgba(52, 168, 83, 0.2)" />
              <circle cx="360" cy="310" r="30" fill="rgba(52, 168, 83, 0.18)" />
            </svg>
          </div>

          {/* Continuous Connected SVG Route Path */}
          <svg className="stage-svg-route" viewBox="0 0 860 480" fill="none">
            {/* Solid Stem leading from Node 1 into the curve */}
            <path
              d="M 335 48 L 372 72"
              stroke="#15803d"
              strokeWidth="3.2"
              strokeLinecap="round"
            />
            {/* Dashed Journey Track */}
            <path
              className="journey-animated-path"
              d="M 372 72 C 415 100, 437 145, 437 215 L 437 360 C 437 415, 340 435, 40 435"
              stroke="#15803d"
              strokeWidth="2.8"
              strokeDasharray="6 6"
            />
          </svg>

          {/* 1. Phone Mockup */}
          <div className="stage-phone-wrap">
            <div className="phone-chassis">
              {/* Dynamic Island */}
              <div className="phone-dynamic-island">
                <div className="island-indicator" />
                <div className="island-camera" />
              </div>

              {/* In-App Screen Content */}
              <div className="phone-screen-view">
                {/* Status Bar */}
                <div className="phone-statusbar">
                  <span className="phone-time">9:41</span>
                  <div className="phone-status-glyphs">
                    <span>5G</span>
                    <span className="glyph-battery">🔋</span>
                  </div>
                </div>

                {/* Header */}
                <div className="phone-header">
                  <img src={logoImg} alt="Lampose" className="phone-logo" />
                  <div className="phone-menu-toggle">
                    <span /><span /><span />
                  </div>
                </div>

                {/* Main Body */}
                <div className="phone-inner-content">
                  <h2 className="phone-tagline">Find your perfect stay</h2>

                  {/* Search Input */}
                  <div className="phone-search-input">
                    <svg className="phone-search-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor">
                      <circle cx="8.5" cy="8.5" r="5.5" strokeWidth="2" />
                      <path d="M13 13L17.5 17.5" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    <input
                      type="text"
                      value={cityInput}
                      onChange={e => setCityInput(e.target.value)}
                      placeholder="Rajahmundry"
                    />
                  </div>

                  {/* Property Type Dropdown */}
                  <div className="phone-dropdown-selector">
                    <span>PG / Hostel / Room / Dormitory</span>
                    <span className="phone-chevron">▾</span>
                  </div>

                  {/* Search Button */}
                  <Link to="/services" className="phone-submit-btn">
                    Search
                  </Link>

                  {/* Category Filter Circles */}
                  <div className="phone-categories-grid">
                    {PHONE_CATEGORIES.map(cat => (
                      <button
                        key={cat.name}
                        type="button"
                        className={`phone-cat-tile ${activeCategory === cat.name ? 'active' : ''}`}
                        onClick={() => setActiveCategory(cat.name)}
                      >
                        <div className={`cat-icon-circle cat-bg-${cat.name.toLowerCase().replace(/\s+/g, '')}`}>
                          {cat.icon}
                        </div>
                        <span className="cat-label">{cat.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 2. Milestone 1: Your Stay */}
          <div className="stage-node node-stay">
            <div className="stage-badge-circle badge-stay-green">
              <svg className="step-house-svg" viewBox="0 0 24 24" fill="currentColor">
                <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
              </svg>
            </div>
            <div className="stage-text-meta">
              <h4 className="stage-title">Your Stay</h4>
              <p className="stage-sub">PG / Hostel / Room</p>
            </div>
          </div>

          {/* 3. Distance Marker: 450 m */}
          <div className="stage-distance-pill">
            <span className="walk-icon">🚶</span>
            <span className="dist-text">450 m</span>
          </div>

          {/* 4. Organic Handwritten Script Tagline */}
          <div className="stage-script-tagline">
            <span>Stay</span>
            <span>Eat</span>
            <span>Live Better</span>
            <svg className="script-swoosh" viewBox="0 0 110 16" fill="none">
              <path d="M 4 10 Q 55 2 105 13" stroke="#1b4d3e" strokeWidth="2.8" strokeLinecap="round" />
            </svg>
          </div>

          {/* 5. Milestone 2: Local Kitchen */}
          <div className="stage-node node-kitchen">
            <div className="stage-badge-circle badge-kitchen-orange">
              <span className="badge-emoji">🍲</span>
            </div>
            <div className="stage-text-meta">
              <h4 className="stage-title">Local Kitchen</h4>
              <p className="stage-sub">Fresh &amp; Tasty</p>
            </div>
          </div>

          {/* 6. Milestone 3: Food Delivered */}
          <div className="stage-node node-delivery">
            <div className="stage-badge-circle badge-delivery-emerald">
              <span className="badge-emoji">🛵</span>
            </div>
            <div className="stage-text-meta">
              <h4 className="stage-title">Food Delivered</h4>
              <p className="stage-sub">To Your Door</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ══ Trust ticker ═════════════════════════════════════════════════════════ */
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

const ROWS = {
  claims: { items: TICKER_FWD, dir: 'fwd' },
  places: { items: TICKER_REV, dir: 'rev' },
};

export const Trust = ({ row = 'claims' }) => {
  const lean = useTickerLean();
  const { items, dir } = ROWS[row] || ROWS.claims;
  useBandReveal(lean);

  return (
    <div className={`trustband trustband--${row}`} ref={lean} aria-hidden="true">
      <Row items={items} dir={dir} />
    </div>
  );
};

