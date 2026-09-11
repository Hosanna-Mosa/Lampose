import React, { useState, useEffect } from 'react';
import { PlusCircle, Sparkles, Target } from 'lucide-react';
import { SLIDES } from '../../utils/slides';
import { Box, Heading, Image, Inline, PlainButton, Strong, Text } from '../../../common/atoms';


export function HeroSlider({ onOnboardClick }) {
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
    <Box 
      className="hero-slider-wrapper"
      style={{
        marginBottom: '24px'
      }}
    >
      <Box 
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
        <Box style={{
          display: 'flex',
          width: `${SLIDES.length * 100}%`,
          transform: `translateX(-${currentIndex * (100 / SLIDES.length)}%)`,
          transition: 'transform 0.75s cubic-bezier(0.25, 1, 0.5, 1)',
          willChange: 'transform'
        }}>
          {SLIDES.map((slide) => (
            <Box 
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
              <Box style={{ flex: 1, maxWidth: '580px', position: 'relative', zIndex: 2 }}>
                <Box style={{
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
                  <Inline style={{ fontSize: '0.72rem', fontWeight: 700, color: '#181e1b', letterSpacing: '0.04em' }}>
                    {slide.tag}
                  </Inline>
                </Box>

                <Heading level={2} className="hero-slider-title" style={{ fontSize: 'clamp(1.6rem, 4vw, 2.4rem)', fontWeight: 800, color: '#181e1b', lineHeight: '1.2' }}>
                  {slide.title}
                  <Inline style={{ color: '#45855a' }}>{slide.titleHighlight}</Inline>
                </Heading>

                <Text className="hero-slider-sub" style={{ fontSize: '0.92rem', color: '#64748b', marginTop: '8px', marginBottom: '20px', lineHeight: '1.5' }}>
                  {slide.subtitle}
                  <Inline style={{ color: '#45855a', fontWeight: 600 }}>{slide.subtitleHighlight}</Inline>
                </Text>

                {/* Features Row */}
                <Box className="hero-slider-features" style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '12px'
                }}>
                  {slide.features.map((feat, idx) => {
                    const IconComponent = feat.icon;
                    return (
                      <Box key={idx} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '10px 12px',
                        background: '#f8faf8',
                        border: '1px solid #e2e8f0',
                        borderRadius: '14px'
                      }}>
                        <Box style={{
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
                        </Box>
                        <Box>
                          <Strong style={{ display: 'block', color: '#181e1b', fontSize: '0.8rem', fontWeight: 700, lineHeight: '1.2' }}>{feat.title}</Strong>
                          <Inline style={{ fontSize: '0.7rem', color: '#64748b' }}>{feat.sub}</Inline>
                        </Box>
                      </Box>
                    );
                  })}
                </Box>
              </Box>

              {/* Right Column Prominent Hero Image Card */}
              <Box className="hero-slide-image-col" style={{
                width: '440px',
                height: '240px',
                position: 'relative',
                borderRadius: '20px',
                overflow: 'hidden',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.08)',
                border: '1px solid #e2e8f0',
                flexShrink: 0
              }}>
                <Image 
                  src={slide.image} 
                  alt={slide.title} 
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                />

                {/* Floating Image Badge - Instant Listing */}
                <Box style={{
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
                  <Inline>{slide.imageBadge}</Inline>
                </Box>

                {/* Floating Onboard Button */}
                <PlainButton 
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
                  <Inline>Onboard</Inline>
                </PlainButton>
              </Box>

            </Box>
          ))}
        </Box>

      </Box>

      {/* Slide Indicators / Dots below container */}
      <Box style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        marginTop: '14px'
      }}>
        {SLIDES.map((_, idx) => (
          <PlainButton
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
      </Box>
    </Box>
  );
}
