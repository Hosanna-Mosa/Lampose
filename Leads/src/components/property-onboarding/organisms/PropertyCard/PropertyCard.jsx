import React from 'react';
import { MapPin, Phone, ArrowRight, Clock, Calendar, Sparkles } from 'lucide-react';
import { AmenityIcon } from '../../atoms/AmenityIcon';
import { Box, Heading, Image, Inline, Link, PlainButton } from '../../../common/atoms';

export function PropertyCard({ property, onViewDetails }) {
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
    amenities = []
  } = property;

  const badgeClass =
    category === 'PG' ? 'badge-pg' :
    category === 'Hostel' ? 'badge-hostel' :
    category === 'Dormitory' ? 'badge-dormitory' : 'badge-bachelor';

  const displayPrice = rent || monthlyPrice || dailyPrice || 0;
  const isDaily = stayType === 'Short Stay' || (category === 'Dormitory' && !monthlyPrice);

  // Take top 3 amenities to feature on card
  const topAmenities = amenities.slice(0, 3);

  return (
    <Box className="property-card-wrapper animate-fade-in" style={{
      display: 'flex',
      flexDirection: 'column',
      borderRadius: '20px',
      overflow: 'hidden',
      position: 'relative',
      background: 'rgba(255, 255, 255, 0.07)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      border: '1px solid rgba(255, 255, 255, 0.14)',
      boxShadow: '0 12px 30px rgba(0, 0, 0, 0.25)',
      transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
    }}>
      {/* Image Banner Box */}
      <Box className="card-image-box" style={{ position: 'relative', height: '195px', overflow: 'hidden' }}>
        <Image
          className="card-image"
          src={imageUrl || 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80'}
          alt={name}
          style={{ 
            width: '100%', 
            height: '100%', 
            objectFit: 'cover',
            transition: 'transform 0.6s cubic-bezier(0.25, 1, 0.5, 1)'
          }}
        />

        {/* Gradient Dark Overlay */}
        <Box style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(to top, rgba(30, 65, 46, 0.95) 0%, rgba(30, 65, 46, 0.2) 60%, transparent 100%)'
        }} />

        {/* Category Floating Pill Badge */}
        <Box style={{ position: 'absolute', top: '12px', left: '12px', zIndex: 2 }}>
          <Inline className={`badge ${badgeClass}`} style={{
            backdropFilter: 'blur(12px)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.3)'
          }}>
            <Sparkles size={11} />
            {category}
          </Inline>
        </Box>

        {/* Stay Type Floating Pill Badge */}
        {stayType && (
          <Box style={{ position: 'absolute', top: '12px', right: '12px', zIndex: 2 }}>
            <Inline style={{
              fontSize: '0.72rem',
              fontWeight: 700,
              padding: '4px 10px',
              borderRadius: '20px',
              background: stayType.includes('Short') ? 'rgba(216, 153, 62, 0.92)' : 'rgba(42, 89, 62, 0.92)',
              color: '#ffffff',
              backdropFilter: 'blur(12px)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.3)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              {stayType.includes('Short') ? <Clock size={12} /> : <Calendar size={12} />}
              {stayType}
            </Inline>
          </Box>
        )}

        {/* Floating Rent Tag */}
        <Box style={{
          position: 'absolute',
          bottom: '12px',
          right: '12px',
          zIndex: 2,
          background: 'linear-gradient(135deg, rgba(216, 153, 62, 0.95) 0%, rgba(180, 115, 30, 0.95) 100%)',
          backdropFilter: 'blur(10px)',
          padding: '6px 14px',
          borderRadius: '14px',
          boxShadow: '0 8px 20px rgba(216, 153, 62, 0.4)',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          display: 'flex',
          alignItems: 'baseline',
          gap: '2px'
        }}>
          <Inline style={{ fontSize: '0.8rem', color: '#ffffff', fontWeight: 600 }}>₹</Inline>
          <Inline style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em' }}>{displayPrice}</Inline>
          <Inline style={{ fontSize: '0.72rem', color: '#f7e7cf', fontWeight: 600 }}>
            {isDaily ? '/day' : '/mo'}
          </Inline>
        </Box>
      </Box>

      {/* Card Content Body */}
      <Box style={{ padding: '18px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        
        {/* Title */}
        <Heading level={3} style={{
          fontSize: '1.15rem',
          fontWeight: 800,
          color: '#ffffff',
          marginBottom: '6px',
          lineHeight: '1.35',
          fontFamily: "'Outfit', 'Inter', sans-serif"
        }}>
          {name}
        </Heading>

        {/* Location Tag */}
        <Box style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-sub)', fontSize: '0.85rem', marginBottom: '12px' }}>
          <MapPin size={14} color="#D8993E" style={{ flexShrink: 0 }} />
          <Inline style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{place}</Inline>
        </Box>

        {/* Featured Mini Amenities Chips */}
        {topAmenities.length > 0 && (
          <Box style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '14px' }}>
            {topAmenities.map((amenity, idx) => (
              <Inline
                key={idx}
                style={{
                  fontSize: '0.72rem',
                  padding: '3px 9px',
                  borderRadius: '12px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: 'var(--text-muted)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <AmenityIcon name={amenity} />
                <Inline>{amenity}</Inline>
              </Inline>
            ))}
          </Box>
        )}

        {/* Owner Info & Direct Contact */}
        <Box style={{
          marginTop: 'auto',
          paddingTop: '12px',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '14px'
        }}>
          <Box>
            <Inline style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>Owner / Manager</Inline>
            <Box style={{ fontSize: '0.85rem', fontWeight: 700, color: '#ffffff' }}>
              {ownerName}
            </Box>
          </Box>

          <Link
            href={`tel:${ownerMobile}`}
            className="card-phone-link"
            style={{
              padding: '6px 12px',
              borderRadius: '20px',
              background: 'rgba(216, 153, 62, 0.18)',
              border: '1px solid rgba(216, 153, 62, 0.4)',
              color: '#D8993E',
              fontSize: '0.8rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              textDecoration: 'none',
              transition: 'all 0.25s ease'
            }}
          >
            <Phone size={13} />
            <Inline>Call Owner</Inline>
          </Link>
        </Box>

        {/* Clean Glass Secondary Action Button */}
        <PlainButton
          onClick={() => onViewDetails(property)}
          className="btn card-action-btn-secondary"
          style={{
            width: '100%',
            padding: '10px',
            fontSize: '0.88rem',
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.18)',
            color: '#ffffff',
            borderRadius: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.3s ease'
          }}
        >
          <Inline>View Full Specifications</Inline>
          <ArrowRight size={16} className="btn-arrow" style={{ transition: 'transform 0.3s ease' }} />
        </PlainButton>
      </Box>
    </Box>
  );
}

