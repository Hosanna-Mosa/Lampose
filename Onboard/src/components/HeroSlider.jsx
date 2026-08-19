import React, { useState, useEffect } from 'react';
import { PlusCircle, MapPin, ShieldCheck, Heart, Sparkles, Clock, Calendar, Target } from 'lucide-react';

const SLIDES = [
  {
    id: 1,
    tag: "GROW YOUR ACCOMMODATION BUSINESS",
    title: "Onboard Your Property ",
    titleHighlight: "In 2 Minutes.",
    subtitle: "Join thousands of PG, hostel, hotel, bachelor and co-live owners — ",
    subtitleHighlight: "fill details & go live instantly.",
    image: "https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=800&q=80",
    imageBadge: "Instant Listing",
    features: [
      { icon: ShieldCheck, title: "Verified Owners", sub: "Trusted Platform", color: "#45855a", bg: "#f0f7f2" },
      { icon: Sparkles, title: "Fast Onboarding", sub: "Live in Minutes", color: "#45855a", bg: "#f0f7f2" },
      { icon: MapPin, title: "PAN India", sub: "Major Cities", color: "#45855a", bg: "#f0f7f2" }
    ]
  },
  {
    id: 2,
    tag: "INDIA'S ALL-IN-ONE URBAN LIVING PLATFORM",
    title: "More Choices. ",
    titleHighlight: "Better Experiences.",
    subtitle: "Top hostels, verified PGs & bachelor flats — ",
    subtitleHighlight: "all in one place.",
    image: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80",
    imageBadge: "100% Verified PGs",
    features: [
      { icon: MapPin, title: "Top Locations", sub: "Near You", color: "#45855a", bg: "#f0f7f2" },
      { icon: ShieldCheck, title: "Verified Partners", sub: "You Can Trust", color: "#45855a", bg: "#f0f7f2" },
      { icon: Heart, title: "Great Reviews", sub: "Happy Customers", color: "#45855a", bg: "#f0f7f2" }
    ]
  },
  {
    id: 3,
    tag: "FLEXIBLE DURATION OPTIONS",
    title: "Short Stay or Long Stay? ",
    titleHighlight: "We Have Both.",
    subtitle: "List daily stays (1-7 days) or monthly accommodation — ",
    subtitleHighlight: "direct to tenants.",
    image: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80",
    imageBadge: "Daily & Monthly Rates",
    features: [
      { icon: Clock, title: "1 - 7 Days", sub: "Short Stay Rate", color: "#45855a", bg: "#f0f7f2" },
      { icon: Calendar, title: "1 Month+", sub: "Monthly Rent", color: "#45855a", bg: "#f0f7f2" },
      { icon: Sparkles, title: "0% Brokerage", sub: "Direct Enquiries", color: "#45855a", bg: "#f0f7f2" }
    ]
  }
];

export default function HeroSlider({ onOnboardClick }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Auto rotate slides smoothly every 5 seconds
  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % SLIDES.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [isPaused]);

  return (
    <div 
      className="hero-slider-wrapper"
      style={{
        marginBottom: '24px'
      }}
    >
      <div 
        className="hero-slider-container"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        style={{
          position: 'relative',
          borderRadius: '24px',
          overflow: 'hidden',
          background: '#ffffff',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.03)',
          border: '1px solid #e5e9e5'
        }}
      >
        {/* Sliding Track */}
        <div style={{
          display: 'flex',
          width: `${SLIDES.length * 100}%`,
          transform: `translateX(-${currentIndex * (100 / SLIDES.length)}%)`,
          transition: 'transform 0.75s cubic-bezier(0.25, 1, 0.5, 1)',
          willChange: 'transform'
        }}>
          {SLIDES.map((slide) => (
            <div 
              key={slide.id}
              className="hero-slide-item"
              style={{
                width: `${100 / SLIDES.length}%`,
                background: '#ffffff',
                color: '#181e1b',
                minHeight: '260px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '24px',
                position: 'relative',
                flexShrink: 0
              }}
            >
              {/* Left Column Text Content */}
              <div style={{ flex: 1, maxWidth: '580px', position: 'relative', zIndex: 2 }}>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  padding: '6px 14px',
                  borderRadius: '20px',
                  marginBottom: '16px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                }}>
                  <Sparkles size={13} color="#45855a" />
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#181e1b', letterSpacing: '0.04em' }}>
                    {slide.tag}
                  </span>
                </div>

                <h2 className="hero-slider-title" style={{ fontSize: 'clamp(1.6rem, 4vw, 2.4rem)', fontWeight: 800, color: '#181e1b', lineHeight: '1.2' }}>
                  {slide.title}
                  <span style={{ color: '#45855a' }}>{slide.titleHighlight}</span>
                </h2>

                <p className="hero-slider-sub" style={{ fontSize: '0.92rem', color: '#64748b', marginTop: '8px', marginBottom: '20px', lineHeight: '1.5' }}>
                  {slide.subtitle}
                  <span style={{ color: '#45855a', fontWeight: 600 }}>{slide.subtitleHighlight}</span>
                </p>

                {/* Features Row */}
                <div className="hero-slider-features" style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '12px'
                }}>
                  {slide.features.map((feat, idx) => {
                    const IconComponent = feat.icon;
                    return (
                      <div key={idx} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '10px 12px',
                        background: '#f8faf8',
                        border: '1px solid #e2e8f0',
                        borderRadius: '14px'
                      }}>
                        <div style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '10px',
                          background: feat.bg,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: feat.color,
                          flexShrink: 0
                        }}>
                          <IconComponent size={16} />
                        </div>
                        <div>
                          <strong style={{ display: 'block', color: '#181e1b', fontSize: '0.8rem', fontWeight: 700, lineHeight: '1.2' }}>{feat.title}</strong>
                          <span style={{ fontSize: '0.7rem', color: '#64748b' }}>{feat.sub}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Column Prominent Hero Image Card */}
              <div className="hero-slide-image-col" style={{
                width: '440px',
                height: '240px',
                position: 'relative',
                borderRadius: '20px',
                overflow: 'hidden',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.08)',
                border: '1px solid #e2e8f0',
                flexShrink: 0
              }}>
                <img 
                  src={slide.image} 
                  alt={slide.title} 
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                />

                {/* Floating Image Badge - Instant Listing */}
                <div style={{
                  position: 'absolute',
                  bottom: '14px',
                  left: '14px',
                  background: '#ffffff',
                  padding: '8px 16px',
                  borderRadius: '20px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: '#181e1b',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <Sparkles size={14} color="#45855a" />
                  <span>{slide.imageBadge}</span>
                </div>

                {/* Floating Onboard Button */}
                <button 
                  onClick={onOnboardClick}
                  className="btn"
                  style={{
                    position: 'absolute',
                    bottom: '14px',
                    right: '14px',
                    padding: '8px 18px',
                    fontSize: '0.82rem',
                    background: '#45855a',
                    color: '#ffffff',
                    borderRadius: '20px',
                    fontWeight: 600,
                    boxShadow: '0 4px 14px rgba(69, 133, 90, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Target size={14} />
                  <span>Onboard</span>
                </button>
              </div>

            </div>
          ))}
        </div>

      </div>

      {/* Slide Indicators / Dots below container */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        marginTop: '14px'
      }}>
        {SLIDES.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setCurrentIndex(idx)}
            aria-label={`Go to slide ${idx + 1}`}
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: currentIndex === idx ? '#45855a' : '#cbd5e1',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.3s ease'
            }}
          />
        ))}
      </div>
    </div>
  );
}
