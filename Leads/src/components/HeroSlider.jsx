import React, { useState, useEffect } from 'react';
import { PlusCircle, MapPin, ShieldCheck, Heart, Sparkles, Clock, Calendar } from 'lucide-react';

const SLIDES = [
  {
    id: 1,
    tag: "INDIA'S ALL-IN-ONE URBAN LIVING PLATFORM",
    title: "More Choices. ",
    titleHighlight: "Better Experiences.",
    subtitle: "Top hostels, verified PGs & bachelor flats — ",
    subtitleHighlight: "all in one place.",
    buttonText: "Onboard Property",
    image: "https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=800&q=80",
    imageBadge: "100% Verified PGs",
    features: [
      { icon: MapPin, title: "Top Locations", sub: "Near You", color: "#D8993E", bg: "rgba(216, 153, 62, 0.12)" },
      { icon: ShieldCheck, title: "Verified Partners", sub: "You Can Trust", color: "#2A593E", bg: "rgba(42, 89, 62, 0.12)" },
      { icon: Heart, title: "Great Reviews", sub: "Happy Customers", color: "#D8993E", bg: "rgba(216, 153, 62, 0.12)" }
    ]
  },
  {
    id: 2,
    tag: "FLEXIBLE DURATION OPTIONS",
    title: "Short Stay or Long Stay? ",
    titleHighlight: "We Have Both.",
    subtitle: "List daily stays (1-7 days) or monthly accommodation — ",
    subtitleHighlight: "direct to tenants.",
    buttonText: "Onboard Short / Long Stay",
    image: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80",
    imageBadge: "Daily & Monthly Rates",
    features: [
      { icon: Clock, title: "1 - 7 Days", sub: "Short Stay Rate", color: "#D8993E", bg: "rgba(216, 153, 62, 0.12)" },
      { icon: Calendar, title: "1 Month+", sub: "Monthly Rent", color: "#2A593E", bg: "rgba(42, 89, 62, 0.12)" },
      { icon: Sparkles, title: "0% Brokerage", sub: "Direct Enquiries", color: "#D8993E", bg: "rgba(216, 153, 62, 0.12)" }
    ]
  },
  {
    id: 3,
    tag: "GROW YOUR ACCOMMODATION BUSINESS",
    title: "Onboard Your Property ",
    titleHighlight: "In 2 Minutes.",
    subtitle: "Join thousands of PG, Hostel, Dormitory & Bachelor Flat owners — ",
    subtitleHighlight: "fill details & go live instantly.",
    buttonText: "Start Onboarding Now",
    image: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80",
    imageBadge: "Instant Listing",
    features: [
      { icon: ShieldCheck, title: "Verified Owners", sub: "Trusted Platform", color: "#2A593E", bg: "rgba(42, 89, 62, 0.12)" },
      { icon: Sparkles, title: "Fast Onboarding", sub: "Live in Minutes", color: "#D8993E", bg: "rgba(216, 153, 62, 0.12)" },
      { icon: MapPin, title: "PAN India", sub: "Major Cities", color: "#2A593E", bg: "rgba(42, 89, 62, 0.12)" }
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
        background: '#2a593e', /* Solid background blocking grid lines behind hero section */
        borderRadius: '24px',
        padding: '2px',
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
          boxShadow: '0 20px 48px rgba(0, 0, 0, 0.28)',
          border: '1px solid rgba(0, 0, 0, 0.08)'
        }}
      >
        {/* Sliding Track - Smooth horizontal slide left */}
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
              style={{
                width: `${100 / SLIDES.length}%`,
                background: '#ffffff',
                color: '#1a1a1a',
                padding: '32px 36px',
                minHeight: '270px',
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
                  background: 'rgba(42, 89, 62, 0.08)',
                  border: '1px solid rgba(42, 89, 62, 0.2)',
                  padding: '4px 12px',
                  borderRadius: '16px',
                  marginBottom: '12px'
                }}>
                  <Sparkles size={12} color="#2A593E" />
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#2A593E', letterSpacing: '0.04em' }}>
                    {slide.tag}
                  </span>
                </div>

                <h2 className="hero-slider-title" style={{ fontSize: 'clamp(1.5rem, 4vw, 2.2rem)', fontWeight: 800, color: '#1a1a1a', lineHeight: '1.2' }}>
                  {slide.title}
                  <span style={{ color: '#D8993E' }}>{slide.titleHighlight}</span>
                </h2>

                <p className="hero-slider-sub" style={{ fontSize: '0.92rem', color: '#555555', marginTop: '6px', marginBottom: '16px' }}>
                  {slide.subtitle}
                  <strong style={{ color: '#D8993E' }}>{slide.subtitleHighlight}</strong>
                </p>

                {/* Features Row */}
                <div className="hero-slider-features" style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '10px',
                  paddingTop: '14px',
                  borderTop: '1px solid #f0f0f0'
                }}>
                  {slide.features.map((feat, idx) => {
                    const IconComponent = feat.icon;
                    return (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{
                          width: '30px',
                          height: '30px',
                          borderRadius: '8px',
                          background: feat.bg,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: feat.color,
                          flexShrink: 0
                        }}>
                          <IconComponent size={15} />
                        </div>
                        <div>
                          <strong style={{ display: 'block', color: '#1a1a1a', fontSize: '0.8rem', lineHeight: '1.2' }}>{feat.title}</strong>
                          <span style={{ fontSize: '0.7rem', color: '#666666' }}>{feat.sub}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Column Prominent Crisp Hero Image Card */}
              <div className="hero-slide-image-col" style={{
                width: '420px',
                height: '220px',
                position: 'relative',
                borderRadius: '20px',
                overflow: 'hidden',
                boxShadow: '0 14px 32px rgba(0, 0, 0, 0.18)',
                border: '1px solid rgba(0, 0, 0, 0.08)',
                flexShrink: 0
              }}>
                <img 
                  src={slide.image} 
                  alt={slide.title} 
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                />
                
                {/* Image Gradient Dark Overlay */}
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 60%)'
                }} />

                {/* Floating Image Badge */}
                <div style={{
                  position: 'absolute',
                  bottom: '12px',
                  left: '12px',
                  background: 'rgba(255, 255, 255, 0.95)',
                  backdropFilter: 'blur(10px)',
                  padding: '4px 12px',
                  borderRadius: '12px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: '#2A593E',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px'
                }}>
                  <Sparkles size={12} color="#D8993E" />
                  <span>{slide.imageBadge}</span>
                </div>

                <button 
                  onClick={onOnboardClick}
                  className="btn btn-primary"
                  style={{
                    position: 'absolute',
                    bottom: '12px',
                    right: '12px',
                    padding: '8px 16px',
                    fontSize: '0.8rem',
                    background: '#D8993E',
                    color: '#ffffff',
                    boxShadow: '0 4px 14px rgba(216, 153, 62, 0.4)'
                  }}
                >
                  <PlusCircle size={14} />
                  <span>Onboard</span>
                </button>
              </div>

            </div>
          ))}
        </div>

        {/* Slide Indicators / Dots */}
        <div style={{
          position: 'absolute',
          bottom: '10px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          {SLIDES.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentIndex(idx)}
              aria-label={`Go to slide ${idx + 1}`}
              style={{
                width: currentIndex === idx ? '24px' : '8px',
                height: '8px',
                borderRadius: '4px',
                background: currentIndex === idx ? '#D8993E' : 'rgba(0, 0, 0, 0.2)',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.3s ease'
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
