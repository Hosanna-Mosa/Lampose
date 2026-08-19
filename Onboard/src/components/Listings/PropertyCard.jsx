import React, { useState, useEffect } from 'react';
import { MapPin, Phone, ArrowRight, Clock, Calendar, Wifi, ShieldCheck, Utensils, Zap, Sparkles, Lock, ChevronLeft, ChevronRight, UserCheck } from 'lucide-react';
import { labelForCategory } from '../../data/categories';

export default function PropertyCard({ property, onViewDetails }) {
  const {
    name,
    place,
    ownerName,
    ownerMobile,
    category,
    stayType,
    dailyPrice,
    monthlyPrice,
    rent,
    imageUrl,
    images = [],
    amenities = [],
    verificationStatus,
    isVerified,
    employeeEmail,
    empEmail
  } = property;

  const activeEmpEmail = employeeEmail || empEmail;

  const allImages = Array.isArray(images) && images.length > 0 ? images : (imageUrl ? [imageUrl] : []);
  const [currentImgIndex, setCurrentImgIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  const displayedImage = allImages[currentImgIndex] || allImages[0] || '/lampose-logo-splash.png';
  const displayPrice = rent || monthlyPrice || dailyPrice || 0;
  const isDaily = stayType === 'Short Stay' || (category === 'HOTEL' && !monthlyPrice);

  // Take top 3 amenities to feature on card
  const topAmenities = amenities.slice(0, 3);

  // Auto-scroll through images every 3.5 seconds (pauses on hover)
  useEffect(() => {
    if (allImages.length <= 1 || isHovered) return;

    const interval = setInterval(() => {
      setCurrentImgIndex((prev) => (prev < allImages.length - 1 ? prev + 1 : 0));
    }, 3500);

    return () => clearInterval(interval);
  }, [allImages.length, isHovered]);

  const handlePrevImage = (e) => {
    e.stopPropagation();
    setCurrentImgIndex((prev) => (prev > 0 ? prev - 1 : allImages.length - 1));
  };

  const handleNextImage = (e) => {
    e.stopPropagation();
    setCurrentImgIndex((prev) => (prev < allImages.length - 1 ? prev + 1 : 0));
  };

  const handleDotClick = (e, idx) => {
    e.stopPropagation();
    setCurrentImgIndex(idx);
  };

  return (
    <div 
      className="property-card-wrapper animate-fade-in" 
      onClick={onViewDetails}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '20px',
        overflow: 'hidden',
        position: 'relative',
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        boxShadow: '0 6px 20px rgba(0, 0, 0, 0.03)',
        transition: 'all 0.3s ease',
        cursor: 'pointer'
      }}
    >
      {/* Image Banner Box with Interactive Auto-Scroll Carousel */}
      <div className="card-image-box" style={{ position: 'relative', height: '205px', overflow: 'hidden', background: '#f6f8f6' }}>
        <img
          key={currentImgIndex}
          className="card-image animate-fade-in"
          src={displayedImage}
          alt={`${name} - Photo ${currentImgIndex + 1}`}
          style={{ 
            width: '100%', 
            height: '100%', 
            objectFit: displayedImage.includes('splash') || displayedImage.includes('logo') ? 'contain' : 'cover',
            padding: displayedImage.includes('splash') || displayedImage.includes('logo') ? '16px' : '0',
            transition: 'all 0.4s ease'
          }}
          onError={(e) => { e.target.src = '/lampose-logo-splash.png'; }}
        />

        {/* Soft Vignette Overlay */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(to top, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.05) 50%, transparent 100%)',
          pointerEvents: 'none'
        }} />

        {/* Carousel Next & Prev Arrows (When multiple photos exist) */}
        {allImages.length > 1 && (
          <>
            <button
              type="button"
              onClick={handlePrevImage}
              style={{
                position: 'absolute',
                left: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 3,
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.92)',
                border: 'none',
                color: '#181e1b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
                transition: 'all 0.2s ease'
              }}
              title="Previous photo"
            >
              <ChevronLeft size={16} />
            </button>

            <button
              type="button"
              onClick={handleNextImage}
              style={{
                position: 'absolute',
                right: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 3,
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.92)',
                border: 'none',
                color: '#181e1b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
                transition: 'all 0.2s ease'
              }}
              title="Next photo"
            >
              <ChevronRight size={16} />
            </button>

            {/* Pagination Dots */}
            <div style={{
              position: 'absolute',
              bottom: '10px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 3,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: 'rgba(0, 0, 0, 0.35)',
              padding: '3px 8px',
              borderRadius: '12px',
              backdropFilter: 'blur(4px)'
            }}>
              {allImages.map((_, dotIdx) => {
                const isActive = dotIdx === currentImgIndex;
                return (
                  <span
                    key={dotIdx}
                    onClick={(e) => handleDotClick(e, dotIdx)}
                    style={{
                      width: isActive ? '14px' : '5px',
                      height: '5px',
                      borderRadius: '4px',
                      background: isActive ? '#ffffff' : 'rgba(255, 255, 255, 0.5)',
                      cursor: 'pointer',
                      transition: 'all 0.25s ease'
                    }}
                  />
                );
              })}
            </div>
          </>
        )}

        {/* Category Floating Pill Badge (Top-left) */}
        <div style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 2 }}>
          <span style={{
            background: '#ffffff',
            color: '#181e1b',
            padding: '4px 10px',
            borderRadius: '10px',
            fontSize: '0.72rem',
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            <Sparkles size={11} color="#45855a" />
            {labelForCategory(category)}
          </span>
        </div>

        {/* Stay Type or Pending Status Badge (Top-right) */}
        {verificationStatus === 'pending' ? (
          <div style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 2 }}>
            <span style={{
              fontSize: '0.72rem',
              fontWeight: 800,
              padding: '4px 10px',
              borderRadius: '10px',
              background: '#d97706',
              color: '#ffffff',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              textTransform: 'uppercase'
            }}>
              <Clock size={11} className="animate-pulse" />
              Pending
            </span>
          </div>
        ) : (
          stayType && category !== 'BACHELOR' && category !== 'COLIVE' && (
            <div style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 2 }}>
              <span style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '4px 10px',
                borderRadius: '10px',
                background: '#181e1b',
                color: '#ffffff',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                {stayType.includes('Short') ? <Clock size={11} /> : <Lock size={11} />}
                {stayType}
              </span>
            </div>
          )
        )}

        {/* Multi-Photo Index Badge (Bottom-left) */}
        {allImages.length > 1 && (
          <div style={{
            position: 'absolute',
            bottom: '10px',
            left: '10px',
            zIndex: 2,
            background: 'rgba(0, 0, 0, 0.65)',
            color: '#ffffff',
            padding: '3px 8px',
            borderRadius: '8px',
            fontSize: '0.68rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '3px',
            backdropFilter: 'blur(4px)'
          }}>
            <span>📷 {currentImgIndex + 1}/{allImages.length}</span>
          </div>
        )}

        {/* Floating Rent Tag (Bottom-right) */}
        <div style={{
          position: 'absolute',
          bottom: '10px',
          right: '10px',
          zIndex: 2,
          background: '#ffffff',
          padding: '5px 12px',
          borderRadius: '12px',
          boxShadow: '0 6px 16px rgba(0, 0, 0, 0.15)',
          display: 'flex',
          alignItems: 'baseline',
          gap: '2px'
        }}>
          <span style={{ fontSize: '0.8rem', color: '#181e1b', fontWeight: 800 }}>₹</span>
          <span style={{ fontSize: '1.15rem', fontWeight: 800, color: '#181e1b', letterSpacing: '-0.02em' }}>{displayPrice}</span>
          <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>
            {isDaily ? '/day' : '/mo'}
          </span>
        </div>
      </div>

      {/* Card Content Body */}
      <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        
        {/* Title */}
        <h3 style={{
          fontSize: '1.15rem',
          fontWeight: 800,
          color: '#181e1b',
          marginBottom: '6px',
          lineHeight: '1.35'
        }}>
          {name}
        </h3>

        {/* Location Tag */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b', fontSize: '0.85rem', marginBottom: '8px' }}>
          <MapPin size={14} color="#45855a" style={{ flexShrink: 0 }} />
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{place}</span>
        </div>

        {/* Employee Onboarder Tag */}
        {activeEmpEmail && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', color: '#45855a', fontWeight: 600, marginBottom: '10px' }}>
            <UserCheck size={13} color="#45855a" />
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Added by: {activeEmpEmail}
            </span>
          </div>
        )}

        {/* Featured Mini Amenities Chips */}
        {topAmenities.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '14px' }}>
            {topAmenities.map((amenity, idx) => (
              <span
                key={idx}
                style={{
                  fontSize: '0.74rem',
                  padding: '3px 10px',
                  borderRadius: '12px',
                  background: '#f0f7f2',
                  border: '1px solid #c2e2cc',
                  color: '#45855a',
                  fontWeight: 600
                }}
              >
                {amenity}
              </span>
            ))}
            {amenities.length > 3 && (
              <span style={{ fontSize: '0.72rem', color: '#64748b', alignSelf: 'center' }}>
                +{amenities.length - 3} more
              </span>
            )}
          </div>
        )}

        {/* Footer: Owner Info & CTA */}
        <div style={{
          marginTop: 'auto',
          paddingTop: '12px',
          borderTop: '1px solid #f1f5f2',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Owner / Contact</span>
            <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#181e1b' }}>
              {ownerName}
            </span>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onViewDetails();
            }}
            className="btn btn-secondary"
            style={{
              padding: '6px 14px',
              fontSize: '0.8rem',
              borderRadius: '10px',
              border: '1px solid #cbd5e1',
              color: '#181e1b',
              fontWeight: 600,
              gap: '4px'
            }}
          >
            <span>Details</span>
            <ArrowRight size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
