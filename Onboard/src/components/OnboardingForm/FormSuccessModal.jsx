import React from 'react';
import { Clock, ArrowRight, PlusCircle, MapPin } from 'lucide-react';

export default function FormSuccessModal({ property, onViewListings, onResetForm }) {
  if (!property) return null;

  const { name, place, ownerName, ownerMobile, category, rent, dailyPrice, monthlyPrice, stayType } = property;
  const displayPrice = rent || monthlyPrice || dailyPrice || 0;

  return (
    <div 
      onClick={(e) => { if (e.target === e.currentTarget) onViewListings(); }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        overflowY: 'auto'
      }} 
      className="animate-fade-in"
    >
      <div style={{
        maxWidth: '520px',
        width: '100%',
        padding: '32px 24px',
        textAlign: 'center',
        background: '#ffffff',
        borderRadius: '24px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
      }}>
        {/* Pending Clock Badge */}
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          background: '#fef3c7',
          border: '2px solid #d97706',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px',
          color: '#d97706'
        }}>
          <Clock size={36} className="animate-pulse" />
        </div>

        <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#181e1b', marginBottom: '6px' }}>
          Onboarding Request Submitted!
        </h2>
        <p style={{ fontSize: '0.88rem', color: '#64748b', marginBottom: '20px', lineHeight: '1.4' }}>
          A verification WhatsApp message has been sent to the owner <strong style={{ color: '#181e1b' }}>{ownerName}</strong> at <strong style={{ color: '#181e1b' }}>{ownerMobile}</strong>. 
          <br />
          <span style={{ color: '#d97706', fontWeight: 700 }}>Waiting for Owner approval...</span> The property will be listed live on Lampose only after they reply with <strong style={{ color: '#181e1b' }}>YES</strong>.
        </p>

        {/* Property Brief Summary Box */}
        <div style={{
          padding: '16px',
          borderRadius: '16px',
          background: '#fafaf9',
          border: '1px solid #e2e8f0',
          textAlign: 'left',
          marginBottom: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '3px 10px', borderRadius: '10px', background: '#d97706', color: '#ffffff' }}>
              {category} {stayType ? `• ${stayType}` : ''}
            </span>
            <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#d97706' }}>
              Pending Approval
            </span>
          </div>

          <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#181e1b' }}>{name}</h4>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', color: '#64748b' }}>
            <MapPin size={14} color="#d97706" />
            <span>{place}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.8rem', color: '#64748b', paddingTop: '8px', borderTop: '1px solid #e2e8f0' }}>
            <span><strong style={{ color: '#181e1b' }}>Price:</strong> ₹{displayPrice} {stayType === 'Short Stay' ? '/day' : '/mo'}</span>
            <span><strong style={{ color: '#181e1b' }}>Contact:</strong> {ownerMobile}</span>
          </div>
        </div>

        {/* Modal Buttons */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'center' }}>
          <button
            onClick={onViewListings}
            className="btn btn-primary"
            style={{ padding: '12px 24px', background: '#45855a' }}
          >
            <span>Go to Listings</span>
            <ArrowRight size={16} />
          </button>

          <button
            onClick={onResetForm}
            className="btn btn-secondary"
            style={{ padding: '12px 20px' }}
          >
            <PlusCircle size={16} />
            <span>Onboard Another</span>
          </button>
        </div>
      </div>
    </div>
  );
}
