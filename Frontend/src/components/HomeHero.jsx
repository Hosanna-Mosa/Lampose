import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import logoImg from '../assets/logo.png';
import { TICKER_FWD, TICKER_REV } from '../data/home';
import { useBandReveal, useTickerLean } from '../hooks/useSite';


/* ══ User Flow Stages Definition ══════════════════════════════════════════ */
const FLOW_STOPS = [
  {
    id: 'explore',
    x: 286,
    y: 36,
    title: '1. Explore Stays',
    sub: 'Search & filter real-time',
    icon: '🔍',
    caption: 'Explore verified stays matching your budget & location in real-time.',
  },
  {
    id: 'listing',
    x: 376,
    y: 126,
    title: '2. Stay Details',
    sub: 'Inspect rooms & amenities',
    icon: '🏢',
    caption: 'Check complete pricing, verified amenities, and transparent stay details.',
  },
  {
    id: 'visit',
    x: 466,
    y: 216,
    title: '3. Schedule Visit',
    sub: 'Zero brokerage booking',
    icon: '📅',
    caption: 'Schedule a physical visit directly with zero brokerage or middleman fees.',
  },
  {
    id: 'approval',
    x: 376,
    y: 306,
    title: '4. Owner Approval',
    sub: 'Direct instant verification',
    icon: '🤝',
    caption: 'Direct owner approval ensures instant confirmation and seamless scheduling.',
  },
  {
    id: 'checkin',
    x: 286,
    y: 396,
    title: '5. Confirmation',
    sub: 'Unlock food credits',
    icon: '🎁',
    caption: 'One scan checks you in instantly & unlocks rewards for nearby meals!',
  },
];

export default function Hero() {
  const [activeStep, setActiveStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [cityInput, setCityInput] = useState('');
  const [typewriterIndex, setTypewriterIndex] = useState(0);
  const [stageScale, setStageScale] = useState(1);

  // 3D Page Turn State
  const [isFlipping, setIsFlipping] = useState(false);
  const [flippingStep, setFlippingStep] = useState(null);

  // Typewriter effect for Scene 1 Search Bar
  useEffect(() => {
    if (activeStep !== 0) {
      setCityInput('');
      setTypewriterIndex(0);
      return;
    }
    const fullText = 'Vizag';
    const timer = setInterval(() => {
      if (typewriterIndex < fullText.length) {
        setCityInput(prev => prev + fullText[typewriterIndex]);
        setTypewriterIndex(prev => prev + 1);
      } else {
        // Pause briefly at the end, then clear and repeat
        setTimeout(() => {
          setCityInput('');
          setTypewriterIndex(0);
        }, 1200);
      }
    }, 250);

    return () => clearInterval(timer);
  }, [activeStep, typewriterIndex]);

  // Page flip transition handler
  const triggerPageFlip = (nextStepIdx) => {
    if (nextStepIdx === activeStep || isFlipping) return;
    setFlippingStep(activeStep);
    setIsFlipping(true);
    setActiveStep(nextStepIdx);

    // Clear flipping state after transition completes (2500ms)
    setTimeout(() => {
      setIsFlipping(false);
      setFlippingStep(null);
    }, 2500);
  };

  // Auto-play interval
  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      triggerPageFlip((activeStep + 1) % FLOW_STOPS.length);
    }, 7000);
    return () => clearInterval(timer);
  }, [isPlaying, activeStep, isFlipping]);

  // Handle stage scale on window resize
  useEffect(() => {
    const updateScale = () => {
      const ww = window.innerWidth;
      let availableWidth;

      if (ww > 1100) {
        const containerWidth = Math.min(ww, 1360) - 32;
        availableWidth = containerWidth - 520 - 48;
      } else {
        availableWidth = ww - 24;
      }

      const scale = Math.min(availableWidth / 820, 1);
      setStageScale(scale);
    };
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);

  const handleStepClick = (idx) => {
    setIsPlaying(false); // Pause auto-play
    triggerPageFlip(idx);
  };

  /* ══ Helper to render individual screen view content ══ */
  const renderScreenContent = (stepIndex) => {
    switch (stepIndex) {
      case 0:
        return (
          <div className="phone-flow-screen screen-explore">
            <div className="phone-header-mock">
              <img src={logoImg} alt="Lampose" className="phone-logo-mock" />
              <div className="phone-menu-dot" />
            </div>
            <div className="phone-body-mock">
              <h3 className="mock-title">Find your perfect stay</h3>
              <div className="mock-search-bar">
                <span className="mock-search-ico">🔍</span>
                <span className="mock-search-text">{cityInput || 'Search stays...'}</span>
                <span className="mock-search-cursor" />
              </div>

              <div className="mock-filter-row">
                <span className="mock-filter-tab active">PGs</span>
                <span className="mock-filter-tab">Hostels</span>
                <span className="mock-filter-tab">Rooms</span>
              </div>

              <div className="mock-slider-box">
                <div className="mock-slider-labels">
                  <span>Rent Cap</span>
                  <strong>₹5,500/mo</strong>
                </div>
                <div className="mock-slider-track">
                  <div className="mock-slider-fill" />
                  <div className="mock-slider-handle" />
                </div>
              </div>

              <div className="mock-cards-list">
                <div className="mock-listing-card">
                  <div className="mock-card-img explore-img-1" />
                  <div className="mock-card-details">
                    <strong>Sunrise PG</strong>
                    <span>₹5,800/mo · AC · Wifi</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      case 1:
        return (
          <div className="phone-flow-screen screen-details">
            <div className="phone-header-mock has-back">
              <span className="mock-back-arrow">←</span>
              <strong>Sunrise PG</strong>
              <span className="mock-share">⋮</span>
            </div>
            <div className="phone-body-mock scrollable">
              <div className="mock-carousel">
                <div className="mock-carousel-slides">
                  <div className="mock-slide carousel-img-1" />
                </div>
                <span className="mock-carousel-indicator">1 / 3</span>
              </div>

              <div className="mock-details-meta">
                <div className="mock-price-row">
                  <h2>₹5,800<small>/mo</small></h2>
                  <span className="mock-verified-badge">Scout Verified ✓</span>
                </div>
                <p className="mock-details-address">📍 MVP Colony, Visakhapatnam</p>
              </div>

              <div className="mock-amenities-grid">
                <span className="mock-amenity">📶 WiFi</span>
                <span className="mock-amenity">❄️ AC</span>
                <span className="mock-amenity">🍱 Food</span>
              </div>

              <div className="mock-owner-box">
                <div className="mock-owner-avatar">👨</div>
                <div>
                  <strong>Ravi Kumar (Owner)</strong>
                  <p>Responds in 5 mins</p>
                </div>
              </div>

              <div className="mock-bottom-action">
                <div className="mock-btn-action">Request a visit</div>
              </div>
            </div>
          </div>
        );
      case 2:
        return (
          <div className="phone-flow-screen screen-visit">
            <div className="phone-header-mock has-back">
              <span className="mock-back-arrow">←</span>
              <strong>Schedule Visit</strong>
              <div className="phone-menu-dot" />
            </div>
            <div className="phone-body-mock">
              <div className="mock-form">
                <div className="mock-form-group">
                  <label>Select Date</label>
                  <div className="mock-form-input">📅 Aug 18, 2026</div>
                </div>
                <div className="mock-form-group">
                  <label>Select Time Slot</label>
                  <div className="mock-form-input">⏰ 10:00 AM - 12:00 PM</div>
                </div>
                <div className="mock-form-group">
                  <label>Mobile Number</label>
                  <div className="mock-form-input">📞 +91 98765 43210</div>
                </div>

                <div className="mock-btn-submit-visit">
                  Confirm &amp; Request
                  <div className="mock-submit-shine" />
                </div>
              </div>

              <div className="mock-hand-cursor" />

              <div className="mock-toast-notification">
                <div className="mock-toast-icon">💬</div>
                <div>
                  <strong>Request Sent!</strong>
                  <p>Owner will call you back shortly.</p>
                </div>
              </div>
            </div>
          </div>
        );
      case 3:
        return (
          <div className="phone-flow-screen screen-approval">
            <div className="phone-header-mock">
              <strong>Stay Owner Portal</strong>
              <span className="mock-notif-bell font-notif">🔔</span>
            </div>
            <div className="phone-body-mock dashboard-style">
              <div className="dashboard-header">
                <span>Pending Approvals</span>
                <strong className="badge-count">1</strong>
              </div>

              <div className="dashboard-request-card">
                <div className="request-card-user">
                  <div className="user-icon-mock">👤</div>
                  <div>
                    <strong>Rahul Sharma</strong>
                    <p>Requested: Aug 18 · 10 AM</p>
                  </div>
                </div>
                <div className="request-card-actions">
                  <span className="btn-decline">Decline</span>
                  <span className="btn-approve">
                    Approve
                    <div className="btn-approve-pulse" />
                  </span>
                </div>
              </div>

              <div className="approval-cursor" />

              <div className="approval-status-banner">
                <span className="banner-check">✓</span>
                <span>Visit Approved &amp; Scheduled</span>
              </div>
            </div>
          </div>
        );
      case 4:
        return (
          <div className="phone-flow-screen screen-checkin">
            <div className="phone-header-mock">
              <strong>Digital Booking Pass</strong>
              <div className="phone-menu-dot" />
            </div>
            <div className="phone-body-mock checkin-style">
              <div className="qr-pass-card">
                <span className="qr-pass-id">PASS #BKG-24810</span>

                <div className="qr-box-container">
                  <div className="qr-mock-code" />
                  <div className="qr-scan-line-anim" />
                </div>

                <p className="qr-hint">Scan at stay reception to check in</p>
              </div>

              <div className="checkin-success-splash">
                <div className="success-checkmark-splash">✓</div>
                <strong>Checked In Successfully!</strong>
              </div>

              <div className="food-reward-voucher">
                <span className="reward-gift-ico">🎁</span>
                <div>
                  <strong>₹100 Food Voucher</strong>
                  <p>Unlocked for Spice Garden</p>
                </div>
                <span className="reward-glow-effect" />
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <section id="hero-new" className="hero-light-section">
      <div className="hero-bg-shapes" aria-hidden="true">
        <div className="bg-shape-gradient" />
        <div className="bg-ambient-orb orb-1" />
        <div className="bg-ambient-orb orb-2" />
      </div>

      <div className="hero-light-container">
        {/* ── Left Column: Copy & Actions ────────────────────────────── */}
        <div className="hero-col-left">
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

          <h1 className="hero-main-title">
            <span className="title-row">Verified stays.</span>
            <span className="title-row">Local kitchens.</span>
            <span className="title-row title-accent">One app for both.</span>
          </h1>

          <p className="hero-lead-desc">
            Find verified PGs, hostels, bachelor rooms and dormitories near you — with great food just a short walk away.
          </p>

          <div className="hero-cta-group">
            <Link to="/explore" className="btn-hero-explore">
              <svg className="btn-search-svg" viewBox="0 0 20 20" fill="none" stroke="currentColor">
                <circle cx="8.5" cy="8.5" r="5.5" strokeWidth="2" />
                <path d="M13 13L17.5 17.5" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span>Explore Stays</span>
              <span className="btn-arrow">→</span>
            </Link>
          </div>

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
              <span className="t-icon">🎧</span>
              <span>24/7 Support</span>
            </div>
          </div>
        </div>

        {/* ── Right Column: Interactive User Flow Lockup ──────────────── */}
        <div className="hero-flow-visual-column">
          <div
            className="hero-exact-stage-wrapper"
            style={{
              width: `${820 * stageScale}px`,
              height: `${480 * stageScale}px`,
              position: 'relative',
              display: 'block',
              margin: '0 auto',
              overflow: 'visible'
            }}
          >
            <div
              className="hero-exact-stage"
              style={{
                transform: `scale(${stageScale})`,
                transformOrigin: 'top left',
                position: 'absolute',
                top: 0,
                left: 0,
                margin: 0
              }}
            >
              {/* Mint Skyline & Trees Vector Background Illustration */}
              <div className="stage-city-backdrop" aria-hidden="true">
                <svg viewBox="0 0 540 420" fill="none" className="city-svg-art">
                  <ellipse cx="260" cy="210" rx="220" ry="160" fill="rgba(167, 243, 208, 0.3)" filter="blur(35px)" />

                  {/* Skyline */}
                  <rect x="180" y="160" width="48" height="200" rx="3" fill="rgba(34, 120, 68, 0.06)" />
                  <rect x="240" y="120" width="60" height="240" rx="4" fill="rgba(34, 120, 68, 0.08)" />
                  <rect x="312" y="170" width="44" height="190" rx="3" fill="rgba(34, 120, 68, 0.06)" />

                  {/* Houses */}
                  <polygon points="135,260 155,230 175,260" fill="rgba(34, 120, 68, 0.1)" />
                  <rect x="140" y="260" width="30" height="70" fill="rgba(34, 120, 68, 0.07)" />

                  {/* Trees */}
                  <circle cx="120" cy="300" r="34" fill="rgba(52, 168, 83, 0.15)" />
                  <circle cx="180" cy="315" r="26" fill="rgba(52, 168, 83, 0.12)" />
                  <circle cx="360" cy="310" r="30" fill="rgba(52, 168, 83, 0.12)" />
                </svg>
              </div>

              {/* Connected Route Path Curved elegantly through the 5 steps */}
              <svg className="stage-svg-route" viewBox="0 0 820 480" fill="none">
                <defs>
                  <linearGradient id="flow-gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--amber)" />
                    <stop offset="50%" stopColor="var(--green)" />
                    <stop offset="100%" stopColor="var(--amber)" />
                  </linearGradient>
                  <filter id="flow-glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>
                <path
                  className="journey-animated-path"
                  d="M 310 60 C 310 150, 490 150, 490 240 C 490 330, 310 330, 310 420"
                  stroke="url(#flow-gradient)"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray="1 16"
                  filter="url(#flow-glow)"
                />
              </svg>

              {/* 1. Phone Mockup */}
              <div className="stage-phone-wrap">
                <div className="phone-chassis">
                  <div className="phone-dynamic-island">
                    <div className="island-indicator" />
                    <div className="island-camera" />
                  </div>

                  <div className="phone-screen-view">
                    {/* Fixed Status Bar at the top of the screen */}
                    <div className="phone-statusbar">
                      <span className="phone-time">9:41</span>
                      <div className="phone-status-glyphs">
                        <span>5G</span>
                        <span className="glyph-battery">🔋</span>
                      </div>
                    </div>

                    {/* Base Layer: Renders the active/incoming step */}
                    <div className="phone-screen-layer base-layer">
                      {renderScreenContent(activeStep)}
                    </div>

                    {/* Flipping Layer: Renders the previous step flipping out of view with 3D Page Curl */}
                    {isFlipping && flippingStep !== null && (
                      <div className="phone-screen-layer flipping-layer page-curl-anim">
                        <div className="page-turn-face page-front">
                          {renderScreenContent(flippingStep)}
                          <div className="page-front-highlight" />
                        </div>
                        <div className="page-turn-face page-back">
                          <div className="page-back-paper" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 2. Interactive Flow Timeline Steps (Curved layout) */}
              {FLOW_STOPS.map((stop, idx) => (
                <div
                  key={stop.id}
                  className={`stage-flow-node node-${stop.id} ${activeStep === idx ? 'active' : ''}`}
                  style={{
                    position: 'absolute',
                    left: `${stop.x}px`,
                    top: `${stop.y}px`,
                    cursor: 'pointer'
                  }}
                  onClick={() => handleStepClick(idx)}
                >
                  <div className={`flow-badge-circle step-icon-${idx}`}>
                    <span className="flow-step-ico">{stop.icon}</span>
                    <span className="flow-step-index">{idx + 1}</span>
                  </div>
                  <div className="flow-node-text">
                    <h4 className="flow-node-title">{stop.title}</h4>
                    <p className="flow-node-sub">{stop.sub}</p>
                  </div>
                </div>
              ))}
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
