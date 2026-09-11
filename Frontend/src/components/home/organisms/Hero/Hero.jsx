import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import logoImg from '../../../../assets/logo.png';
import { FLOW_STOPS } from '../../utils/flowStops';
import { Trust } from '../Trust/Trust';
import { Box, Heading, Image, Inline, Label, Region, Small, Strong, Text } from '../../../common/atoms';


/* ══ User Flow Stages Definition ══════════════════════════════════════════ */

export function Hero() {
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
          <Box className="phone-flow-screen screen-explore">
            <Box className="phone-header-mock">
              <Image src={logoImg} alt="Lampose" className="phone-logo-mock" />
              <Box className="phone-menu-dot" />
            </Box>
            <Box className="phone-body-mock">
              <Heading level={3} className="mock-title">Find your perfect stay</Heading>
              <Box className="mock-search-bar">
                <Inline className="mock-search-ico">🔍</Inline>
                <Inline className="mock-search-text">{cityInput || 'Search stays...'}</Inline>
                <Inline className="mock-search-cursor" />
              </Box>

              <Box className="mock-filter-row">
                <Inline className="mock-filter-tab active">PGs</Inline>
                <Inline className="mock-filter-tab">Hostels</Inline>
                <Inline className="mock-filter-tab">Rooms</Inline>
              </Box>

              <Box className="mock-slider-box">
                <Box className="mock-slider-labels">
                  <Inline>Rent Cap</Inline>
                  <Strong>₹5,500/mo</Strong>
                </Box>
                <Box className="mock-slider-track">
                  <Box className="mock-slider-fill" />
                  <Box className="mock-slider-handle" />
                </Box>
              </Box>

              <Box className="mock-cards-list">
                <Box className="mock-listing-card">
                  <Box className="mock-card-img explore-img-1" />
                  <Box className="mock-card-details">
                    <Strong>Sunrise PG</Strong>
                    <Inline>₹5,800/mo · AC · Wifi</Inline>
                  </Box>
                </Box>
              </Box>
            </Box>
          </Box>
        );
      case 1:
        return (
          <Box className="phone-flow-screen screen-details">
            <Box className="phone-header-mock has-back">
              <Inline className="mock-back-arrow">←</Inline>
              <Strong>Sunrise PG</Strong>
              <Inline className="mock-share">⋮</Inline>
            </Box>
            <Box className="phone-body-mock scrollable">
              <Box className="mock-carousel">
                <Box className="mock-carousel-slides">
                  <Box className="mock-slide carousel-img-1" />
                </Box>
                <Inline className="mock-carousel-indicator">1 / 3</Inline>
              </Box>

              <Box className="mock-details-meta">
                <Box className="mock-price-row">
                  <Heading level={2}>₹5,800<Small>/mo</Small></Heading>
                  <Inline className="mock-verified-badge">Scout Verified ✓</Inline>
                </Box>
                <Text className="mock-details-address">📍 MVP Colony, Visakhapatnam</Text>
              </Box>

              <Box className="mock-amenities-grid">
                <Inline className="mock-amenity">📶 WiFi</Inline>
                <Inline className="mock-amenity">❄️ AC</Inline>
                <Inline className="mock-amenity">🍱 Food</Inline>
              </Box>

              <Box className="mock-owner-box">
                <Box className="mock-owner-avatar">👨</Box>
                <Box>
                  <Strong>Ravi Kumar (Owner)</Strong>
                  <Text>Responds in 5 mins</Text>
                </Box>
              </Box>

              <Box className="mock-bottom-action">
                <Box className="mock-btn-action">Request a visit</Box>
              </Box>
            </Box>
          </Box>
        );
      case 2:
        return (
          <Box className="phone-flow-screen screen-visit">
            <Box className="phone-header-mock has-back">
              <Inline className="mock-back-arrow">←</Inline>
              <Strong>Schedule Visit</Strong>
              <Box className="phone-menu-dot" />
            </Box>
            <Box className="phone-body-mock">
              <Box className="mock-form">
                <Box className="mock-form-group">
                  <Label>Select Date</Label>
                  <Box className="mock-form-input">📅 Aug 18, 2026</Box>
                </Box>
                <Box className="mock-form-group">
                  <Label>Select Time Slot</Label>
                  <Box className="mock-form-input">⏰ 10:00 AM - 12:00 PM</Box>
                </Box>
                <Box className="mock-form-group">
                  <Label>Mobile Number</Label>
                  <Box className="mock-form-input">📞 +91 98765 43210</Box>
                </Box>

                <Box className="mock-btn-submit-visit">
                  Confirm &amp; Request
                  <Box className="mock-submit-shine" />
                </Box>
              </Box>

              <Box className="mock-hand-cursor" />

              <Box className="mock-toast-notification">
                <Box className="mock-toast-icon">💬</Box>
                <Box>
                  <Strong>Request Sent!</Strong>
                  <Text>Owner will call you back shortly.</Text>
                </Box>
              </Box>
            </Box>
          </Box>
        );
      case 3:
        return (
          <Box className="phone-flow-screen screen-approval">
            <Box className="phone-header-mock">
              <Strong>Stay Owner Portal</Strong>
              <Inline className="mock-notif-bell font-notif">🔔</Inline>
            </Box>
            <Box className="phone-body-mock dashboard-style">
              <Box className="dashboard-header">
                <Inline>Pending Approvals</Inline>
                <Strong className="badge-count">1</Strong>
              </Box>

              <Box className="dashboard-request-card">
                <Box className="request-card-user">
                  <Box className="user-icon-mock">👤</Box>
                  <Box>
                    <Strong>Rahul Sharma</Strong>
                    <Text>Requested: Aug 18 · 10 AM</Text>
                  </Box>
                </Box>
                <Box className="request-card-actions">
                  <Inline className="btn-decline">Decline</Inline>
                  <Inline className="btn-approve">
                    Approve
                    <Box className="btn-approve-pulse" />
                  </Inline>
                </Box>
              </Box>

              <Box className="approval-cursor" />

              <Box className="approval-status-banner">
                <Inline className="banner-check">✓</Inline>
                <Inline>Visit Approved &amp; Scheduled</Inline>
              </Box>
            </Box>
          </Box>
        );
      case 4:
        return (
          <Box className="phone-flow-screen screen-checkin">
            <Box className="phone-header-mock">
              <Strong>Digital Booking Pass</Strong>
              <Box className="phone-menu-dot" />
            </Box>
            <Box className="phone-body-mock checkin-style">
              <Box className="qr-pass-card">
                <Inline className="qr-pass-id">PASS #BKG-24810</Inline>

                <Box className="qr-box-container">
                  <Box className="qr-mock-code" />
                  <Box className="qr-scan-line-anim" />
                </Box>

                <Text className="qr-hint">Scan at stay reception to check in</Text>
              </Box>

              <Box className="checkin-success-splash">
                <Box className="success-checkmark-splash">✓</Box>
                <Strong>Checked In Successfully!</Strong>
              </Box>

              <Box className="food-reward-voucher">
                <Inline className="reward-gift-ico">🎁</Inline>
                <Box>
                  <Strong>₹100 Food Voucher</Strong>
                  <Text>Unlocked for Spice Garden</Text>
                </Box>
                <Inline className="reward-glow-effect" />
              </Box>
            </Box>
          </Box>
        );
      default:
        return null;
    }
  };

  return (
    <Region id="hero-new" className="hero-light-section">
      <Box className="hero-bg-shapes" aria-hidden="true">
        <Box className="bg-shape-gradient" />
        <Box className="bg-ambient-orb orb-1" />
        <Box className="bg-ambient-orb orb-2" />
      </Box>

      <Box className="hero-light-container">
        {/* ── Left Column: Copy & Actions ────────────────────────────── */}
        <Box className="hero-col-left">
          <Box className="hero-equation-badge">
            <Inline className="eq-chip">
              <Inline className="eq-icon">🏠</Inline> Your Stay
            </Inline>
            <Inline className="eq-symbol">×</Inline>
            <Inline className="eq-chip">
              <Inline className="eq-icon">🧑‍🍳</Inline> Great Food
            </Inline>
            <Inline className="eq-symbol">=</Inline>
            <Inline className="eq-chip eq-chip--green">
              <Inline className="eq-icon">🌱</Inline> A Better Tomorrow
            </Inline>
          </Box>

          <Heading level={1} className="hero-main-title">
            <Inline className="title-row">Verified stays.</Inline>
            <Inline className="title-row">Local kitchens.</Inline>
            <Inline className="title-row title-accent">One app for both.</Inline>
          </Heading>

          <Text className="hero-lead-desc">
            Find verified PGs, hostels, bachelor rooms and dormitories near you — with great food just a short walk away.
          </Text>

          <Box className="hero-cta-group">
            <Link to="/explore" className="btn-hero-explore">
              <svg className="btn-search-svg" viewBox="0 0 20 20" fill="none" stroke="currentColor">
                <circle cx="8.5" cy="8.5" r="5.5" strokeWidth="2" />
                <path d="M13 13L17.5 17.5" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <Inline>Explore Stays</Inline>
              <Inline className="btn-arrow">→</Inline>
            </Link>
          </Box>

          <Box className="hero-trust-bar">
            <Box className="trust-pill">
              <Inline className="t-icon t-check">✔</Inline>
              <Inline>Verified Listings</Inline>
            </Box>
            <Box className="trust-pill">
              <Inline className="t-icon">🔒</Inline>
              <Inline>Safe &amp; Secure</Inline>
            </Box>

            <Box className="trust-pill">
              <Inline className="t-icon">🎧</Inline>
              <Inline>24/7 Support</Inline>
            </Box>
          </Box>
        </Box>

        {/* ── Right Column: Interactive User Flow Lockup ──────────────── */}
        <Box className="hero-flow-visual-column">
          <Box
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
            <Box
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
              <Box className="stage-city-backdrop" aria-hidden="true">
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
              </Box>

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
              <Box className="stage-phone-wrap">
                <Box className="phone-chassis">
                  <Box className="phone-dynamic-island">
                    <Box className="island-indicator" />
                    <Box className="island-camera" />
                  </Box>

                  <Box className="phone-screen-view">
                    {/* Fixed Status Bar at the top of the screen */}
                    <Box className="phone-statusbar">
                      <Inline className="phone-time">9:41</Inline>
                      <Box className="phone-status-glyphs">
                        <Inline>5G</Inline>
                        <Inline className="glyph-battery">🔋</Inline>
                      </Box>
                    </Box>

                    {/* Base Layer: Renders the active/incoming step */}
                    <Box className="phone-screen-layer base-layer">
                      {renderScreenContent(activeStep)}
                    </Box>

                    {/* Flipping Layer: Renders the previous step flipping out of view with 3D Page Curl */}
                    {isFlipping && flippingStep !== null && (
                      <Box className="phone-screen-layer flipping-layer page-curl-anim">
                        <Box className="page-turn-face page-front">
                          {renderScreenContent(flippingStep)}
                          <Box className="page-front-highlight" />
                        </Box>
                        <Box className="page-turn-face page-back">
                          <Box className="page-back-paper" />
                        </Box>
                      </Box>
                    )}
                  </Box>
                </Box>
              </Box>

              {/* 2. Interactive Flow Timeline Steps (Curved layout) */}
              {FLOW_STOPS.map((stop, idx) => (
                <Box
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
                  <Box className={`flow-badge-circle step-icon-${idx}`}>
                    <Inline className="flow-step-ico">{stop.icon}</Inline>
                    <Inline className="flow-step-index">{idx + 1}</Inline>
                  </Box>
                  <Box className="flow-node-text">
                    <Heading level={4} className="flow-node-title">{stop.title}</Heading>
                    <Text className="flow-node-sub">{stop.sub}</Text>
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>


        </Box>
      </Box>
    </Region>
  );
}

/* ══ Trust ticker ═════════════════════════════════════════════════════════ */


