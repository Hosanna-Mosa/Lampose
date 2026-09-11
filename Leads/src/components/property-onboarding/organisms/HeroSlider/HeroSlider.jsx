import React, { useState, useEffect } from 'react';
import { PlusCircle, Sparkles } from 'lucide-react';
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
        background: '#2a593e', /* Solid background blocking grid lines behind hero section */
        borderRadius: '24px',
        padding: '2px',
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
          boxShadow: '0 20px 48px rgba(0, 0, 0, 0.28)',
          border: '1px solid rgba(0, 0, 0, 0.08)'
        }}
      >
        {/* Sliding Track - Smooth horizontal slide left */}
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
              <Box style={{ flex: 1, maxWidth: '580px', position: 'relative', zIndex: 2 }}>
                <Box style={{
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
                  <Inline style={{ fontSize: '0.68rem', fontWeight: 700, color: '#2A593E', letterSpacing: '0.04em' }}>
                    {slide.tag}
                  </Inline>
                </Box>

                <Heading level={2} className="hero-slider-title" style={{ fontSize: 'clamp(1.5rem, 4vw, 2.2rem)', fontWeight: 800, color: '#1a1a1a', lineHeight: '1.2' }}>
                  {slide.title}
                  <Inline style={{ color: '#D8993E' }}>{slide.titleHighlight}</Inline>
                </Heading>

                <Text className="hero-slider-sub" style={{ fontSize: '0.92rem', color: '#555555', marginTop: '6px', marginBottom: '16px' }}>
                  {slide.subtitle}
                  <Strong style={{ color: '#D8993E' }}>{slide.subtitleHighlight}</Strong>
                </Text>

                {/* Features Row */}
                <Box className="hero-slider-features" style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '10px',
                  paddingTop: '14px',
                  borderTop: '1px solid #f0f0f0'
                }}>
                  {slide.features.map((feat, idx) => {
                    const IconComponent = feat.icon;
                    return (
                      <Box key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Box style={{
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
                        </Box>
                        <Box>
                          <Strong style={{ display: 'block', color: '#1a1a1a', fontSize: '0.8rem', lineHeight: '1.2' }}>{feat.title}</Strong>
                          <Inline style={{ fontSize: '0.7rem', color: '#666666' }}>{feat.sub}</Inline>
                        </Box>
                      </Box>
                    );
                  })}
                </Box>
              </Box>

              {/* Right Column Prominent Crisp Hero Image Card */}
              <Box className="hero-slide-image-col" style={{
                width: '420px',
                height: '220px',
                position: 'relative',
                borderRadius: '20px',
                overflow: 'hidden',
                boxShadow: '0 14px 32px rgba(0, 0, 0, 0.18)',
                border: '1px solid rgba(0, 0, 0, 0.08)',
                flexShrink: 0
              }}>
                <Image 
                  src={slide.image} 
                  alt={slide.title} 
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                />
                
                {/* Image Gradient Dark Overlay */}
                <Box style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 60%)'
                }} />

                {/* Floating Image Badge */}
                <Box style={{
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
                  <Inline>{slide.imageBadge}</Inline>
                </Box>

                <PlainButton 
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
                  <Inline>Onboard</Inline>
                </PlainButton>
              </Box>

            </Box>
          ))}
        </Box>

        {/* Slide Indicators / Dots */}
        <Box style={{
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
            <PlainButton
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
        </Box>
      </Box>
    </Box>
  );
}
