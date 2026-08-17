import React, { useState, useEffect } from 'react';
import {
  X, MapPin, User, Phone, ShieldCheck, Trash2, CheckCircle2, Clock, Calendar,
  ChevronLeft, ChevronRight, Pencil, Lock, KeyRound, Loader2, Hourglass, ShieldX, Save
} from 'lucide-react';
import { fetchPropertyAccess, requestPermission, activeEmployeeEmail } from '../../services/permissions.js';
import { updateProperty } from '../../services/api.js';

/** How a permission state reads to the employee holding the locked button. */
const PERMISSION_NOTES = {
  none: { icon: Lock, color: '#64748b', text: 'Locked — ask an administrator for access' },
  pending: { icon: Hourglass, color: '#b45309', text: 'Requested — awaiting administrator approval' },
  granted: { icon: CheckCircle2, color: '#45855a', text: 'Approved by administrator' },
  denied: { icon: ShieldX, color: '#dc2626', text: 'Administrator denied this request' },
  revoked: { icon: ShieldX, color: '#dc2626', text: 'Access was revoked by an administrator' },
  used: { icon: Lock, color: '#64748b', text: 'Approval already used — ask again if you need it' },
};

export default function PropertyDetailModal({ property, onClose, onDelete, onUpdated }) {
  if (!property) return null;

  const {
    _id,
    name,
    place,
    ownerName,
    ownerMobile,
    ownerAltMobile = '',
    category,
    stayType = 'Long Stay',
    shortStayDuration = '1-7 Days',
    dailyPrice = 0,
    longStayDuration = '1 Month+',
    monthlyPrice = 0,
    deposit,
    address,
    imageUrl,
    images = [],
    employeeEmail,
    amenities = [],
    categoryDetails = {}
  } = property;

  const allImages = Array.isArray(images) && images.length > 0
    ? images
    : (imageUrl && imageUrl.trim() ? [imageUrl] : ['/lampose-logo-splash.png']);

  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [touchStartX, setTouchStartX] = useState(null);
  const [isBannerHovered, setIsBannerHovered] = useState(false);

  // Edit and delete are administrator-granted, never assumed. `access` holds the
  // decision on record for this employee and this listing.
  const [access, setAccess] = useState(null);
  const [accessLoading, setAccessLoading] = useState(true);
  const [askAction, setAskAction] = useState(null); // 'edit' | 'delete' while the ask panel is open
  const [askReason, setAskReason] = useState('');
  const [asking, setAsking] = useState(false);
  const [notice, setNotice] = useState(null); // { tone: 'good' | 'bad', text }
  const [isEditing, setIsEditing] = useState(false);
  const [busyAction, setBusyAction] = useState(null); // 'edit' | 'delete' while a write is in flight

  // The signed-in field agent, as distinct from `employeeEmail` above, which
  // records whoever originally onboarded the listing.
  const currentEmployeeEmail = activeEmployeeEmail();

  const loadAccess = async () => {
    const res = await fetchPropertyAccess(_id);
    setAccess(res && res.success ? res.data.permissions : null);
    setAccessLoading(false);
  };

  useEffect(() => {
    setAccessLoading(true);
    loadAccess();
  }, [_id]);

  const permissionFor = (action) => access?.[action] || { allowed: false, status: 'none' };

  const handleAskPermission = async (e) => {
    e.preventDefault();
    setAsking(true);
    const res = await requestPermission({ property, action: askAction, reason: askReason });
    setAsking(false);

    if (res && res.success) {
      setNotice({
        tone: 'good',
        text: res.message || 'Permission request sent to the administrator.'
      });
      setAskAction(null);
      setAskReason('');
      loadAccess();
    } else {
      setNotice({ tone: 'bad', text: res?.error || res?.message || 'Could not send the request.' });
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    if (!window.confirm(`Delete "${name}"? This uses your approved permission and cannot be undone.`)) return;

    setBusyAction('delete');
    const res = await onDelete(_id);
    setBusyAction(null);

    if (res && res.success) {
      onClose();
    } else {
      const errorMsg = res?.error || res?.message || 'Delete failed.';
      setNotice({ tone: 'bad', text: errorMsg });
      if (!errorMsg.toLowerCase().includes('not found')) {
        loadAccess();
      }
    }
  };

  const handleSaveEdit = async (changes) => {
    setBusyAction('edit');
    const res = await updateProperty(_id, changes);
    setBusyAction(null);

    if (res && res.success) {
      setIsEditing(false);
      setNotice({ tone: 'good', text: 'Listing updated successfully!' });
      if (onUpdated && res.data) onUpdated(res.data);
      loadAccess();
    } else {
      const errorMsg = res?.error || res?.message || 'Update failed.';
      setNotice({ tone: 'bad', text: errorMsg });
      if (!errorMsg.toLowerCase().includes('not found')) {
        loadAccess();
      }
    }
  };

  const currentImage = allImages[activeImageIndex] || allImages[0] || '/lampose-logo-splash.png';
  const isSplashImage = currentImage?.includes('splash') || currentImage?.includes('logo');

  // AC is recorded per sharing option now; listings onboarded before that carry
  // a single property-wide flag, so both shapes have to read sensibly.
  const acSharingTypes = Object.entries(categoryDetails.sharingAC || {})
    .filter(([, enabled]) => enabled)
    .map(([type]) => type);
  const acSummary = acSharingTypes.length > 0
    ? `Yes — ${acSharingTypes.join(', ')}`
    : categoryDetails.sharingAC
      ? 'Non-AC Only'
      : (categoryDetails.acAvailable ? 'Yes (AC Rooms)' : 'Non-AC Only');

  const badgeClass =
    category === 'PG' ? 'badge-pg' :
    category === 'Hostel' ? 'badge-hostel' :
    category === 'Dormitory' ? 'badge-dormitory' : 'badge-bachelor';

  // Auto-scroll through photos every 4 seconds (pauses on hover)
  useEffect(() => {
    if (allImages.length <= 1 || isBannerHovered) return;

    const interval = setInterval(() => {
      setActiveImageIndex((prev) => (prev < allImages.length - 1 ? prev + 1 : 0));
    }, 4000);

    return () => clearInterval(interval);
  }, [allImages.length, isBannerHovered]);

  const handlePrev = (e) => {
    if (e) e.stopPropagation();
    setActiveImageIndex((prev) => (prev > 0 ? prev - 1 : allImages.length - 1));
  };

  const handleNext = (e) => {
    if (e) e.stopPropagation();
    setActiveImageIndex((prev) => (prev < allImages.length - 1 ? prev + 1 : 0));
  };

  // Keyboard navigation for image carousel
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      } else if (e.key === 'Escape') {
        // Escape backs out of the edit form or the permission request first,
        // so a half-typed request is never lost with the whole window.
        if (isEditing) {
          if (busyAction !== 'edit') setIsEditing(false);
        } else if (askAction) {
          setAskAction(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [allImages.length, isEditing, askAction, busyAction]);

  // Touch swipe handling for mobile devices
  const handleTouchStart = (e) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchEnd = (e) => {
    if (!touchStartX) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diffX = touchStartX - touchEndX;
    if (diffX > 50) {
      handleNext();
    } else if (diffX < -50) {
      handlePrev();
    }
    setTouchStartX(null);
  };

  return (
    <div 
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
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
        padding: '20px 14px',
        overflowY: 'auto'
      }} 
      className="animate-fade-in"
    >
      <div className="modal-content" style={{
        maxWidth: '720px',
        width: '100%',
        maxHeight: 'calc(100vh - 40px)',
        overflowY: 'auto',
        position: 'relative',
        padding: '0',
        borderRadius: '24px',
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
        margin: 'auto'
      }}>
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '14px',
            right: '14px',
            zIndex: 20,
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            color: '#181e1b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            touchAction: 'manipulation',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
          }}
        >
          <X size={20} />
        </button>

        {/* Interactive Hero Image Banner Carousel */}
        <div 
          style={{ position: 'relative', height: '280px', background: isSplashImage ? '#f6f8f6' : '#181e1b', overflow: 'hidden' }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onMouseEnter={() => setIsBannerHovered(true)}
          onMouseLeave={() => setIsBannerHovered(false)}
        >
          <img
            key={activeImageIndex}
            src={currentImage}
            alt={`${name} - Photo ${activeImageIndex + 1}`}
            style={{
              width: '100%',
              height: '100%',
              objectFit: isSplashImage ? 'contain' : 'cover',
              padding: isSplashImage ? '24px' : '0',
              transition: 'opacity 0.3s ease'
            }}
          />
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.2) 60%, transparent 100%)',
            pointerEvents: 'none'
          }} />

          {/* Carousel Next & Prev Controls (if > 1 image) */}
          {allImages.length > 1 && (
            <>
              <button
                type="button"
                onClick={handlePrev}
                style={{
                  position: 'absolute',
                  left: '14px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  zIndex: 10,
                  width: '38px',
                  height: '38px',
                  borderRadius: '50%',
                  background: 'rgba(255, 255, 255, 0.92)',
                  border: 'none',
                  color: '#181e1b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                  transition: 'all 0.2s ease'
                }}
                title="Previous photo (or Left Arrow key)"
              >
                <ChevronLeft size={22} />
              </button>

              <button
                type="button"
                onClick={handleNext}
                style={{
                  position: 'absolute',
                  right: '14px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  zIndex: 10,
                  width: '38px',
                  height: '38px',
                  borderRadius: '50%',
                  background: 'rgba(255, 255, 255, 0.92)',
                  border: 'none',
                  color: '#181e1b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                  transition: 'all 0.2s ease'
                }}
                title="Next photo (or Right Arrow key)"
              >
                <ChevronRight size={22} />
              </button>

              {/* Photo Index Counter Badge */}
              <div style={{
                position: 'absolute',
                top: '14px',
                left: '16px',
                zIndex: 10,
                background: 'rgba(0, 0, 0, 0.65)',
                color: '#ffffff',
                padding: '5px 12px',
                borderRadius: '12px',
                fontSize: '0.75rem',
                fontWeight: 700,
                backdropFilter: 'blur(4px)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <span>📷 {activeImageIndex + 1} / {allImages.length} Photos</span>
              </div>

              {/* Pagination Dots on Banner */}
              <div style={{
                position: 'absolute',
                bottom: '12px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 10,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                background: 'rgba(0, 0, 0, 0.4)',
                padding: '4px 10px',
                borderRadius: '14px',
                backdropFilter: 'blur(4px)'
              }}>
                {allImages.map((_, dotIdx) => {
                  const isActive = dotIdx === activeImageIndex;
                  return (
                    <span
                      key={dotIdx}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveImageIndex(dotIdx);
                      }}
                      style={{
                        width: isActive ? '14px' : '6px',
                        height: '6px',
                        borderRadius: '4px',
                        background: isActive ? '#ffffff' : 'rgba(255, 255, 255, 0.5)',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                    />
                  );
                })}
              </div>
            </>
          )}

          {/* Banner Title & Place Details */}
          <div style={{ position: 'absolute', bottom: allImages.length > 1 ? '32px' : '16px', left: '20px', right: '20px', zIndex: 5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span className={`badge ${badgeClass}`} style={{ background: '#ffffff', color: '#181e1b', border: 'none', fontWeight: 700 }}>
                {category}
              </span>
              {category !== 'Bachelor Room' && stayType && (
                <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '3px 10px', borderRadius: '12px', background: '#181e1b', color: '#ffffff' }}>
                  {stayType}
                </span>
              )}
            </div>
            <h2 style={{ fontSize: 'clamp(1.3rem, 4vw, 1.8rem)', fontWeight: 800, color: '#ffffff', lineHeight: '1.2', textShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>
              {name}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ffffff', fontSize: '0.86rem', marginTop: '4px', textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
              <MapPin size={15} color="#fadf5d" />
              <span>{place}</span>
            </div>
          </div>
        </div>

        {/* Thumbnail Gallery Strip (if > 1 image) */}
        {allImages.length > 1 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 16px',
            background: '#f8faf8',
            borderBottom: '1px solid #e2e8f0',
            overflowX: 'auto'
          }}>
            {allImages.map((thumbUrl, idx) => {
              const isSelected = idx === activeImageIndex;
              return (
                <div
                  key={idx}
                  onClick={() => setActiveImageIndex(idx)}
                  style={{
                    width: '74px',
                    height: '50px',
                    borderRadius: '10px',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    border: isSelected ? '2px solid #45855a' : '1px solid #cbd5e1',
                    opacity: isSelected ? 1 : 0.65,
                    transform: isSelected ? 'scale(1.04)' : 'scale(1)',
                    transition: 'all 0.2s ease',
                    flexShrink: 0
                  }}
                >
                  <img
                    src={thumbUrl}
                    alt={`Thumbnail ${idx + 1}`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* Content Body */}
        <div style={{ padding: '24px 20px' }}>
          {/* Stay Type & Pricing Structure */}
          <div style={{
            padding: '16px 20px',
            borderRadius: '16px',
            background: '#f8faf8',
            border: '1px solid #e2e8f0',
            marginBottom: '20px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '14px'
          }}>
            {dailyPrice > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#45855a', fontSize: '0.78rem', fontWeight: 600 }}>
                  <Clock size={14} />
                  <span>Short Stay (1-7 Days)</span>
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#181e1b', marginTop: '2px' }}>
                  ₹{dailyPrice} <span style={{ fontSize: '0.8rem', color: '#64748b' }}>/ day</span>
                </div>
                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Option: {shortStayDuration}</span>
              </div>
            )}

            {monthlyPrice > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#45855a', fontSize: '0.78rem', fontWeight: 600 }}>
                  <Calendar size={14} color="#45855a" />
                  <span>{category === 'Bachelor Room' ? 'Monthly Rent' : 'Long Stay (1+ Month)'}</span>
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#45855a', marginTop: '2px' }}>
                  ₹{monthlyPrice} <span style={{ fontSize: '0.8rem', color: '#64748b' }}>/ month</span>
                </div>
                {category !== 'Bachelor Room' && longStayDuration && (
                  <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Option: {longStayDuration}</span>
                )}
              </div>
            )}

            <div>
              <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 500 }}>Security Deposit</span>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#181e1b', marginTop: '2px' }}>
                ₹{deposit || 0}
              </div>
            </div>

            <a
              href={`tel:${ownerMobile}`}
              className="btn btn-primary"
              style={{ padding: '12px 18px', width: '100%', gridColumn: '1 / -1', background: '#45855a', borderRadius: '12px', fontSize: '0.95rem' }}
            >
              <Phone size={18} />
              <span>Call Owner ({ownerMobile})</span>
            </a>
          </div>

          {/* Owner Details Card */}
          <div style={{
            padding: '16px',
            borderRadius: '16px',
            background: '#f8faf8',
            border: '1px solid #e2e8f0',
            marginBottom: '20px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px'
          }}>
            <div>
              <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>Owner Name:</span>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#181e1b', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                <User size={16} color="#45855a" />
                <span>{ownerName}</span>
              </div>
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>WhatsApp:</span>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#45855a', marginTop: '2px' }}>
                {ownerMobile}
              </div>
            </div>
            {/* Only when one was recorded — it is optional, and a blank row
                would read as a number we failed to capture. */}
            {ownerAltMobile && (
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>Mobile:</span>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#181e1b', marginTop: '2px' }}>
                  {ownerAltMobile}
                </div>
              </div>
            )}
            {address && (
              <div style={{ width: '100%', paddingTop: '10px', borderTop: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>Street Address:</span>
                <p style={{ fontSize: '0.85rem', color: '#181e1b', marginTop: '2px', lineHeight: '1.4' }}>{address}</p>
              </div>
            )}
            {employeeEmail && (
              <div style={{ width: '100%', paddingTop: '10px', borderTop: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>Onboarded By Employee:</span>
                <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#45855a' }}>{employeeEmail}</span>
              </div>
            )}
          </div>

          {/* Category Specific Detailed Breakdown */}
          <div style={{ marginBottom: '20px' }}>
            <h4 style={{ fontSize: '1.05rem', color: '#181e1b', fontWeight: 700, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldCheck size={18} color="#45855a" />
              <span>{category} Category Parameters</span>
            </h4>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: '10px'
            }}>
              {/* PG Specs */}
              {category === 'PG' && (
                <>
                  <SpecItem label="Food Status" value={categoryDetails.foodIncluded ? `Provided (${categoryDetails.foodType || 'Veg/Non-Veg'})` : 'No Food'} />

                  {categoryDetails.foodIncluded && (
                    <SpecItem
                      label="Meals & Serving Timings"
                      value={
                        Array.isArray(categoryDetails.mealsProvided) && categoryDetails.mealsProvided.length > 0
                          ? categoryDetails.mealsProvided.map((meal) => (
                              <span key={meal} style={{ display: 'block' }}>
                                {meal}
                                <span style={{ fontWeight: 500, color: '#64748b' }}>
                                  {' — '}{(categoryDetails.mealTimings || {})[meal] || 'Timing not stated'}
                                </span>
                              </span>
                            ))
                          : 'Meals not specified'
                      }
                    />
                  )}

                  <SpecItem label="AC Available" value={acSummary} />
                  <SpecItem
                    label="Sharing Types & Prices"
                    value={
                      Array.isArray(categoryDetails.sharingTypes) && categoryDetails.sharingTypes.length > 0
                        ? categoryDetails.sharingTypes.map((type) => {
                            const price = categoryDetails.sharingPrices ? categoryDetails.sharingPrices[type] : null;
                            const hasAC = !!(categoryDetails.sharingAC && categoryDetails.sharingAC[type]);
                            const acPrice = categoryDetails.sharingAcPrices ? categoryDetails.sharingAcPrices[type] : null;
                            return (
                              <span key={type} style={{ display: 'block' }}>
                                {type}
                                {price ? `: ₹${price}/mo` : ''}
                                {hasAC && (
                                  <span style={{ fontWeight: 600, color: '#45855a' }}>
                                    {acPrice ? ` · AC ₹${acPrice}/mo` : ' · AC available'}
                                  </span>
                                )}
                              </span>
                            );
                          })
                        : 'Single, 2 Sharing'
                    }
                  />
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
              <h4 style={{ fontSize: '1.05rem', color: '#181e1b', fontWeight: 700, marginBottom: '10px' }}>
                Included Amenities
              </h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {amenities.map((item, idx) => (
                  <span
                    key={idx}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '20px',
                      background: '#eaf3ed',
                      border: '1px solid #c2e2cc',
                      color: '#181e1b',
                      fontWeight: 600,
                      fontSize: '0.82rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <CheckCircle2 size={14} color="#45855a" />
                    <span>{item}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Footer Actions — edit and delete stay locked until an administrator approves */}
          <div style={{ paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
              <Lock size={14} color="#64748b" />
              <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>
                Restricted actions — administrator permission required
              </span>
            </div>

            {notice && (
              <div style={{
                padding: '10px 14px',
                borderRadius: '12px',
                marginBottom: '12px',
                fontSize: '0.82rem',
                fontWeight: 600,
                background: notice.tone === 'good' ? '#eaf3ed' : '#fef2f2',
                border: `1px solid ${notice.tone === 'good' ? '#c2e2cc' : '#fecaca'}`,
                color: notice.tone === 'good' ? '#2f6b45' : '#dc2626'
              }}>
                {notice.text}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <RestrictedAction
                icon={Pencil}
                label="Edit Listing"
                tone="edit"
                permission={permissionFor('edit')}
                loading={accessLoading}
                busy={busyAction === 'edit'}
                onClick={() => { setNotice(null); setIsEditing(true); }}
              />

              <RestrictedAction
                icon={Trash2}
                label="Delete Listing"
                tone="delete"
                permission={permissionFor('delete')}
                loading={accessLoading}
                busy={busyAction === 'delete'}
                onClick={handleDelete}
              />

              <button
                type="button"
                onClick={() => {
                  setNotice(null);
                  setAskReason('');
                  setAskAction(askAction ? null : (permissionFor('edit').allowed ? 'delete' : 'edit'));
                }}
                style={{
                  padding: '9px 16px',
                  borderRadius: '10px',
                  background: askAction ? '#181e1b' : '#eaf3ed',
                  border: `1px solid ${askAction ? '#181e1b' : '#c2e2cc'}`,
                  color: askAction ? '#ffffff' : '#2f6b45',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <KeyRound size={16} />
                <span>{askAction ? 'Cancel Request' : 'Ask Permission'}</span>
              </button>

              <button
                onClick={onClose}
                className="btn"
                style={{ marginLeft: 'auto', padding: '10px 24px', background: '#181e1b', color: '#ffffff', borderRadius: '12px' }}
              >
                Close Window
              </button>
            </div>

            {/* Ask Permission — the request an administrator will act on */}
            {askAction && (
              <form
                onSubmit={handleAskPermission}
                style={{
                  marginTop: '14px',
                  padding: '16px',
                  borderRadius: '16px',
                  background: '#f8faf8',
                  border: '1px solid #c2e2cc'
                }}
              >
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#181e1b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <KeyRound size={16} color="#45855a" />
                  <span>Request administrator permission</span>
                </h4>
                <p style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '4px', marginBottom: '12px' }}>
                  Requesting as <strong style={{ color: '#45855a' }}>{currentEmployeeEmail || 'unknown employee'}</strong>.
                  The request is recorded and reviewed in the admin console.
                </p>

                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                  {[
                    { value: 'edit', label: 'Edit this listing', icon: Pencil },
                    { value: 'delete', label: 'Delete this listing', icon: Trash2 }
                  ].map(({ value, label, icon: OptionIcon }) => {
                    const isSelected = askAction === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setAskAction(value)}
                        style={{
                          flex: '1 1 180px',
                          padding: '10px 14px',
                          borderRadius: '12px',
                          textAlign: 'left',
                          cursor: 'pointer',
                          background: isSelected ? '#eaf3ed' : '#ffffff',
                          border: `2px solid ${isSelected ? '#45855a' : '#e2e8f0'}`,
                          color: '#181e1b',
                          fontSize: '0.85rem',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}
                      >
                        <OptionIcon size={16} color={isSelected ? '#45855a' : '#64748b'} />
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>

                <label style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', fontWeight: 600, marginBottom: '4px' }}>
                  Reason for the request
                </label>
                <textarea
                  value={askReason}
                  onChange={(e) => setAskReason(e.target.value)}
                  rows={2}
                  maxLength={500}
                  placeholder={askAction === 'delete'
                    ? 'e.g. Owner has withdrawn the property from the platform.'
                    : 'e.g. Owner changed the monthly rent and contact number.'}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    fontSize: '0.85rem',
                    fontFamily: 'inherit',
                    resize: 'vertical'
                  }}
                />

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                  <button
                    type="button"
                    onClick={() => setAskAction(null)}
                    style={{ padding: '9px 18px', borderRadius: '10px', background: '#ffffff', border: '1px solid #e2e8f0', color: '#64748b', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={asking || !currentEmployeeEmail}
                    className="btn btn-primary"
                    style={{ padding: '9px 20px', background: '#45855a', borderRadius: '10px', fontSize: '0.85rem', opacity: asking || !currentEmployeeEmail ? 0.6 : 1 }}
                  >
                    {asking ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
                    <span>{asking ? 'Sending…' : 'Send Request'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Edit form — reachable only while an approved edit permission is open */}
      {isEditing && (
        <EditPropertyPanel
          property={property}
          saving={busyAction === 'edit'}
          onCancel={() => setIsEditing(false)}
          onSave={handleSaveEdit}
        />
      )}
    </div>
  );
}

/**
 * An action the employee cannot take on their own authority. The button is
 * always visible — so it is obvious what the listing supports — but stays
 * disabled until an administrator's grant is on record, and the line beneath
 * says exactly where the request stands.
 */
function RestrictedAction({ icon: Icon, label, tone, permission, loading, busy, onClick }) {
  const allowed = !loading && permission.allowed;
  const note = PERMISSION_NOTES[permission.status] || PERMISSION_NOTES.none;
  const NoteIcon = note.icon;

  const palette = tone === 'delete'
    ? { bg: '#fef2f2', border: '#fecaca', text: '#dc2626' }
    : { bg: '#eef4ff', border: '#c7d7fe', text: '#2952b3' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <button
        type="button"
        onClick={onClick}
        disabled={!allowed || busy}
        title={allowed ? label : `${label} — ${note.text}`}
        style={{
          padding: '9px 16px',
          borderRadius: '10px',
          background: allowed ? palette.bg : '#f1f5f9',
          border: `1px solid ${allowed ? palette.border : '#e2e8f0'}`,
          color: allowed ? palette.text : '#94a3b8',
          fontSize: '0.85rem',
          fontWeight: 700,
          cursor: allowed && !busy ? 'pointer' : 'not-allowed',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}
      >
        {busy
          ? <Loader2 size={16} className="animate-spin" />
          : allowed ? <Icon size={16} /> : <Lock size={16} />}
        <span>{label}</span>
      </button>

      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', fontWeight: 600, color: loading ? '#94a3b8' : note.color }}>
        {loading ? <Loader2 size={11} className="animate-spin" /> : <NoteIcon size={11} />}
        <span>{loading ? 'Checking access…' : note.text}</span>
      </span>
    </div>
  );
}

const editInputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '10px',
  border: '1px solid #e2e8f0',
  fontSize: '0.88rem',
  fontFamily: 'inherit'
};

// Declared at module level: a component defined inside the form would be a new
// type on every keystroke, remounting each input and dropping focus.
function Labelled({ label, children }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: '0.75rem', color: '#64748b', fontWeight: 600, marginBottom: '4px' }}>{label}</span>
      {children}
    </label>
  );
}

/** The editable subset of a listing — the fields a field agent corrects in practice. */
function EditPropertyPanel({ property, saving, onCancel, onSave }) {
  const [form, setForm] = useState({
    name: property.name || '',
    place: property.place || '',
    address: property.address || '',
    ownerName: property.ownerName || '',
    ownerMobile: property.ownerMobile || '',
    ownerAltMobile: property.ownerAltMobile || '',
    monthlyPrice: property.monthlyPrice ?? '',
    dailyPrice: property.dailyPrice ?? '',
    deposit: property.deposit ?? ''
  });

  const setField = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    const monthlyPrice = Number(form.monthlyPrice) || 0;
    const dailyPrice = Number(form.dailyPrice) || 0;

    onSave({
      name: form.name.trim(),
      place: form.place.trim(),
      address: form.address.trim(),
      ownerName: form.ownerName.trim(),
      ownerMobile: form.ownerMobile.trim(),
      ownerAltMobile: form.ownerAltMobile.trim(),
      monthlyPrice,
      dailyPrice,
      deposit: Number(form.deposit) || 0,
      // `rent` is the field the listings and admin figures read, so it tracks
      // whichever price the listing is actually sold on.
      rent: monthlyPrice || dailyPrice || Number(property.rent) || 0
    });
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onCancel(); }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10001,
        background: 'rgba(0, 0, 0, 0.55)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px 14px',
        overflowY: 'auto'
      }}
      className="animate-fade-in"
    >
      <form
        onSubmit={handleSubmit}
        style={{
          maxWidth: '560px',
          width: '100%',
          maxHeight: 'calc(100vh - 40px)',
          overflowY: 'auto',
          background: '#ffffff',
          borderRadius: '20px',
          border: '1px solid #e2e8f0',
          padding: '24px 22px',
          margin: 'auto',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4)'
        }}
      >
        <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#181e1b', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Pencil size={18} color="#45855a" />
          <span>Edit Listing</span>
        </h3>
        <p style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '4px', marginBottom: '18px' }}>
          Saving spends your approved edit permission — you will need a new approval for the next change.
        </p>

        <div style={{ display: 'grid', gap: '12px' }}>
          <Labelled label="Property Name">
            <input value={form.name} onChange={setField('name')} required style={editInputStyle} />
          </Labelled>

          <Labelled label="Place / Location">
            <input value={form.place} onChange={setField('place')} required style={editInputStyle} />
          </Labelled>

          <Labelled label="Street Address">
            <input value={form.address} onChange={setField('address')} style={editInputStyle} />
          </Labelled>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
            <Labelled label="Owner Name">
              <input value={form.ownerName} onChange={setField('ownerName')} required style={editInputStyle} />
            </Labelled>
            <Labelled label="Owner WhatsApp">
              <input value={form.ownerMobile} onChange={setField('ownerMobile')} required style={editInputStyle} />
            </Labelled>
            <Labelled label="Owner Mobile (optional)">
              <input value={form.ownerAltMobile} onChange={setField('ownerAltMobile')} style={editInputStyle} />
            </Labelled>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
            <Labelled label="Monthly Price (₹)">
              <input type="number" min="0" value={form.monthlyPrice} onChange={setField('monthlyPrice')} style={editInputStyle} />
            </Labelled>
            <Labelled label="Daily Price (₹)">
              <input type="number" min="0" value={form.dailyPrice} onChange={setField('dailyPrice')} style={editInputStyle} />
            </Labelled>
            <Labelled label="Deposit (₹)">
              <input type="number" min="0" value={form.deposit} onChange={setField('deposit')} style={editInputStyle} />
            </Labelled>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            style={{ padding: '10px 20px', borderRadius: '10px', background: '#ffffff', border: '1px solid #e2e8f0', color: '#64748b', fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="btn btn-primary"
            style={{ padding: '10px 22px', background: '#45855a', borderRadius: '10px', fontSize: '0.88rem', opacity: saving ? 0.6 : 1 }}
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            <span>{saving ? 'Saving…' : 'Save Changes'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}

function SpecItem({ label, value }) {
  return (
    <div style={{
      padding: '12px 14px',
      borderRadius: '12px',
      background: '#f8faf8',
      border: '1px solid #e2e8f0'
    }}>
      <span style={{ fontSize: '0.74rem', color: '#64748b', display: 'block', fontWeight: 500, marginBottom: '2px' }}>{label}</span>
      <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#181e1b' }}>{value || 'N/A'}</span>
    </div>
  );
}
