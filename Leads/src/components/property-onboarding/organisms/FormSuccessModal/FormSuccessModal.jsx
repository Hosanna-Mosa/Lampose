import React from 'react';
import { CheckCircle2, ArrowRight, PlusCircle, Building2, MapPin, User, Phone } from 'lucide-react';
import { Box, Heading, Inline, PlainButton, Strong, Text } from '../../../common/atoms';

export function FormSuccessModal({ property, onViewListings, onResetForm }) {
  if (!property) return null;

  const { name, place, ownerName, ownerMobile, category, rent, dailyPrice, monthlyPrice, stayType } = property;
  const displayPrice = rent || monthlyPrice || dailyPrice || 0;

  return (
    <Box style={{
      position: 'fixed',
      inset: 0,
      zIndex: 300,
      background: 'rgba(18, 42, 29, 0.88)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px'
    }} className="animate-fade-in">
      <Box className="glass-card" style={{
        maxWidth: '520px',
        width: '100%',
        padding: '32px 24px',
        textAlign: 'center',
        background: '#2A593E',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid rgba(216, 153, 62, 0.4)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
      }}>
        {/* Success Animated Badge */}
        <Box style={{
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          background: 'rgba(216, 153, 62, 0.18)',
          border: '2px solid #D8993E',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px',
          color: '#D8993E'
        }}>
          <CheckCircle2 size={36} />
        </Box>

        <Heading level={2} style={{ fontSize: '1.6rem', fontWeight: 800, color: '#ffffff', marginBottom: '6px' }}>
          Property Onboarded Successfully!
        </Heading>
        <Text style={{ fontSize: '0.88rem', color: 'var(--text-sub)', marginBottom: '20px' }}>
          Your accommodation listing has been saved directly to MongoDB Atlas and is now live!
        </Text>

        {/* Property Brief Summary Box */}
        <Box style={{
          padding: '16px',
          borderRadius: 'var(--radius-md)',
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid var(--border-glass)',
          textAlign: 'left',
          marginBottom: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <Box style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Inline style={{ fontSize: '0.75rem', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', background: '#D8993E', color: '#ffffff' }}>
              {category} • {stayType || 'Onboarded'}
            </Inline>
            <Inline style={{ fontSize: '1rem', fontWeight: 800, color: '#D8993E' }}>
              ₹{displayPrice} {stayType === 'Short Stay' ? '/day' : '/mo'}
            </Inline>
          </Box>

          <Heading level={4} style={{ fontSize: '1.05rem', fontWeight: 700, color: '#ffffff' }}>{name}</Heading>

          <Box style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', color: 'var(--text-sub)' }}>
            <MapPin size={14} color="#D8993E" />
            <Inline>{place}</Inline>
          </Box>

          <Box style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.8rem', color: 'var(--text-muted)', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <Inline><Strong style={{ color: '#ffffff' }}>Owner:</Strong> {ownerName}</Inline>
            <Inline><Strong style={{ color: '#ffffff' }}>Contact:</Strong> {ownerMobile}</Inline>
          </Box>
        </Box>

        {/* Modal Buttons */}
        <Box style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'center' }}>
          <PlainButton
            onClick={onViewListings}
            className="btn btn-primary"
            style={{ padding: '12px 24px', background: '#D8993E' }}
          >
            <Inline>View Live Listings</Inline>
            <ArrowRight size={16} />
          </PlainButton>

          <PlainButton
            onClick={onResetForm}
            className="btn btn-secondary"
            style={{ padding: '12px 20px' }}
          >
            <PlusCircle size={16} />
            <Inline>Onboard Another</Inline>
          </PlainButton>
        </Box>
      </Box>
    </Box>
  );
}
