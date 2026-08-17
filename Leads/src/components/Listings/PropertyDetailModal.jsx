import React from 'react';
import { X, MapPin, User, Phone, ShieldCheck, Trash2, CheckCircle2, Clock, Calendar } from 'lucide-react';

export default function PropertyDetailModal({ property, onClose, onDelete }) {
  if (!property) return null;

  const {
    _id,
    name,
    place,
    ownerName,
    ownerMobile,
    category,
    stayType = 'Long Stay',
    shortStayDuration = '1-7 Days',
    dailyPrice = 0,
    longStayDuration = '1 Month+',
    monthlyPrice = 0,
    deposit,
    address,
    imageUrl,
    amenities = [],
    categoryDetails = {}
  } = property;

  const badgeClass =
    category === 'PG' ? 'badge-pg' :
    category === 'Hostel' ? 'badge-hostel' :
    category === 'Dormitory' ? 'badge-dormitory' : 'badge-bachelor';

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 200,
      background: 'rgba(18, 42, 29, 0.88)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '12px'
    }} className="animate-fade-in">
      <div className="glass-card modal-content" style={{
        maxWidth: '720px',
        width: '100%',
        maxHeight: '92vh',
        overflowY: 'auto',
        position: 'relative',
        padding: '0',
        borderRadius: 'var(--radius-lg)',
        background: '#2A593E',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
      }}>
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '14px',
            right: '14px',
            zIndex: 10,
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            background: 'rgba(0, 0, 0, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            touchAction: 'manipulation'
          }}
        >
          <X size={20} />
        </button>

        {/* Hero Image */}
        <div style={{ position: 'relative', height: '220px' }}>
          <img
            src={imageUrl || 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80'}
            alt={name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(to top, #2A593E 0%, transparent 60%)'
          }} />

          <div style={{ position: 'absolute', bottom: '16px', left: '20px', right: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span className={`badge ${badgeClass}`}>
                {category}
              </span>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '3px 10px', borderRadius: '12px', background: '#D8993E', color: '#ffffff' }}>
                {stayType}
              </span>
            </div>
            <h2 style={{ fontSize: 'clamp(1.3rem, 4vw, 1.8rem)', fontWeight: 800, color: '#ffffff', lineHeight: '1.2' }}>
              {name}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-sub)', fontSize: '0.85rem', marginTop: '4px' }}>
              <MapPin size={15} color="#D8993E" />
              <span>{place}</span>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div style={{ padding: '20px' }}>
          {/* Stay Type & Pricing Structure */}
          <div style={{
            padding: '16px 20px',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(216, 153, 62, 0.3)',
            marginBottom: '20px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '14px'
          }}>
            {dailyPrice > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#f7c784', fontSize: '0.78rem', fontWeight: 600 }}>
                  <Clock size={14} />
                  <span>Short Stay (1-7 Days)</span>
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#ffffff', marginTop: '2px' }}>
                  ₹{dailyPrice} <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>/ day</span>
                </div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Option: {shortStayDuration}</span>
              </div>
            )}

            {monthlyPrice > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#ffffff', fontSize: '0.78rem', fontWeight: 600 }}>
                  <Calendar size={14} color="#D8993E" />
                  <span>Long Stay (1+ Month)</span>
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#D8993E', marginTop: '2px' }}>
                  ₹{monthlyPrice} <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>/ month</span>
                </div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Option: {longStayDuration}</span>
              </div>
            )}

            <div>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Security Deposit</span>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ffffff', marginTop: '4px' }}>
                ₹{deposit || 0}
              </div>
            </div>

            <a
              href={`tel:${ownerMobile}`}
              className="btn btn-primary"
              style={{ padding: '10px 18px', width: '100%', gridColumn: '1 / -1', background: '#D8993E' }}
            >
              <Phone size={18} />
              <span>Call Owner ({ownerMobile})</span>
            </a>
          </div>

          {/* Owner Details Card */}
          <div style={{
            padding: '14px 16px',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid var(--border-glass)',
            marginBottom: '20px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px'
          }}>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Owner Name:</span>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <User size={16} color="#D8993E" />
                <span>{ownerName}</span>
              </div>
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Contact:</span>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#D8993E' }}>
                {ownerMobile}
              </div>
            </div>
            {address && (
              <div style={{ width: '100%', paddingTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Street Address:</span>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-sub)', marginTop: '2px' }}>{address}</p>
              </div>
            )}
          </div>

          {/* Category Specific Detailed Breakdown */}
          <div style={{ marginBottom: '20px' }}>
            <h4 style={{ fontSize: '1.05rem', color: '#ffffff', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldCheck size={18} color="#D8993E" />
              <span>{category} Category Parameters</span>
            </h4>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '10px'
            }}>
              {/* PG Specs */}
              {category === 'PG' && (
                <>
                  <SpecItem label="Food Status" value={categoryDetails.foodIncluded ? `Provided (${categoryDetails.foodType || 'Veg/Non-Veg'})` : 'No Food'} />
                  <SpecItem label="AC Available" value={categoryDetails.acAvailable ? 'Yes (AC Rooms)' : 'Non-AC Only'} />
                  <SpecItem label="Sharing Types" value={Array.isArray(categoryDetails.sharingTypes) ? categoryDetails.sharingTypes.join(', ') : 'Single, 2 Sharing'} />
                  <SpecItem label="Curfew Timing" value={categoryDetails.curfewTime || 'No Curfew'} />
                  <SpecItem label="Housekeeping" value={categoryDetails.housekeeping ? 'Daily Included' : 'Standard'} />
                </>
              )}

              {/* Hostel Specs */}
              {category === 'Hostel' && (
                <>
                  <SpecItem label="Hostel Category" value={categoryDetails.hostelType || 'Boys Hostel'} />
                  <SpecItem label="Mess / Canteen" value={categoryDetails.canteenFacility ? 'In-house Mess Available' : 'No Mess'} />
                  <SpecItem label="Warden Contact" value={categoryDetails.wardenContact || ownerMobile} />
                  <SpecItem label="Security & CCTV" value={categoryDetails.securityCCTV ? '24/7 Security & CCTV' : 'Standard'} />
                  <SpecItem label="Study Room" value={categoryDetails.studyRoom ? 'Available' : 'N/A'} />
                </>
              )}

              {/* Dormitory Specs */}
              {category === 'Dormitory' && (
                <>
                  <SpecItem label="Total Beds" value={`${categoryDetails.totalBeds || 12} Beds`} />
                  <SpecItem label="Pricing Rate" value={categoryDetails.rateType || 'Daily Rate'} />
                  <SpecItem label="Bed Format" value={categoryDetails.bedType || 'Bunk Bed Pod'} />
                  <SpecItem label="Shared Washrooms" value={`${categoryDetails.washroomsCount || 4} Washrooms`} />
                  <SpecItem label="Personal Lockers" value={categoryDetails.lockersAvailable ? 'Included with Key' : 'N/A'} />
                </>
              )}

              {/* Bachelor Room Specs */}
              {category === 'Bachelor Room' && (
                <>
                  <SpecItem label="Room Layout" value={categoryDetails.roomType || '1 BHK'} />
                  <SpecItem label="Furnishing" value={categoryDetails.furnishing || 'Semi-Furnished'} />
                  <SpecItem label="Allowed Tenants" value={categoryDetails.allowedTenants || 'Bachelors'} />
                  <SpecItem label="Kitchen Facility" value={categoryDetails.kitchenAvailable ? 'Kitchen & Gas Allowed' : 'No Kitchen'} />
                  <SpecItem label="Water Supply" value={categoryDetails.waterSupply || '24/7 Water'} />
                </>
              )}
            </div>
          </div>

          {/* Amenities Grid */}
          {amenities.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <h4 style={{ fontSize: '1.05rem', color: '#ffffff', marginBottom: '10px' }}>
                Included Amenities
              </h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {amenities.map((item, idx) => (
                  <span
                    key={idx}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '20px',
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid var(--border-glass)',
                      color: 'var(--text-main)',
                      fontSize: '0.8rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}
                  >
                    <CheckCircle2 size={13} color="#D8993E" />
                    <span>{item}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: '16px',
            borderTop: '1px solid var(--border-glass)'
          }}>
            <button
              onClick={() => {
                if (window.confirm(`Are you sure you want to delete "${name}" listing?`)) {
                  onDelete(_id);
                  onClose();
                }
              }}
              className="btn btn-secondary"
              style={{ color: '#f43f5e', borderColor: 'rgba(244, 63, 94, 0.3)', padding: '10px 16px' }}
            >
              <Trash2 size={16} />
              <span>Delete Listing</span>
            </button>

            <button onClick={onClose} className="btn btn-primary" style={{ padding: '10px 24px', background: '#D8993E' }}>
              Close Window
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SpecItem({ label, value }) {
  return (
    <div style={{
      padding: '10px 12px',
      borderRadius: 'var(--radius-sm)',
      background: 'rgba(255, 255, 255, 0.05)',
      border: '1px solid var(--border-glass)'
    }}>
      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>{label}</span>
      <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#ffffff' }}>{value}</span>
    </div>
  );
}
